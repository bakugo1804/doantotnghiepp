import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import { CUSTOMS_FIELDS, CustomsFieldKey, IDENTITY_SECTION, JOURNEY_COLUMNS, MATERIAL_COLUMNS, TRANSPORT_LABELS } from '../common/customs-form';
import { calcDeclarationTotals } from '../customs/financial-rules';

// pdfmake (server-side) — nạp font Roboto (hỗ trợ tiếng Việt) từ vfs của pdfmake
const PdfPrinter = require('pdfmake');
const vfs = require('pdfmake/build/vfs_fonts');
const pdfFonts = {
  Roboto: {
    normal: Buffer.from(vfs['Roboto-Regular.ttf'], 'base64'),
    bold: Buffer.from(vfs['Roboto-Medium.ttf'], 'base64'),
    italics: Buffer.from(vfs['Roboto-Italic.ttf'], 'base64'),
    bolditalics: Buffer.from(vfs['Roboto-MediumItalic.ttf'], 'base64'),
  },
};

type ScopeUser = { sub: string; role: string; companyId?: string | null };

type JourneyRow = { legNumber: number; transportType: string; origin: string; destination: string };
type MaterialRow = { itemNo?: number; hsCode?: string; description?: string; quantity?: number; unit?: string; unitPrice?: number; origin?: string; weight?: number };
type Totals = {
  totalValue: number;
  vatAmount: number;
  vatRate: number;
  /** Thuế nhập khẩu - 0 với hàng trong nước, xem financial-rules.ts. */
  importDutyRate: number;
  importDutyAmount: number;
  shippingFee: number;
  /** Tổng trọng lượng (kg), là căn cứ tính phí vận chuyển nên phải in ra để đối chiếu. */
  totalWeight: number;
  totalPayable: number;
  currency: string;
};

/** Mô hình trung gian dùng chung cho xuất Excel & PDF (từ bản ghi DB hoặc dữ liệu đã parse). */
interface FormModel {
  recordNo?: string;
  values: Record<CustomsFieldKey, string>;
  journeys: JourneyRow[];
  materials: MaterialRow[];
  totals?: Totals;
}

// Nhóm hiển thị (đã bỏ 'Hành trình' vì chuyển sang bảng nhiều chặng riêng).
// IDENTITY_SECTION ("Số tờ khai") cố tình không có ở đây: nó được vẽ riêng ở
// góc trên biểu mẫu, thêm vào danh sách này sẽ khiến nó xuất hiện hai lần.
const SECTION_ORDER = ['Thông tin chung', 'Bên xuất khẩu', 'Bên nhập khẩu', 'Chứng từ', 'Tài chính'];

/**
 * Số cột vật lý của biểu mẫu Excel.
 *
 * Phải >= số cột của bảng rộng nhất (bảng vật tư, 8 cột) thì mỗi cột logic mới
 * có chỗ riêng; nếu ít hơn, các cột cuối bị dồn chung một ô và ghi đè lẫn nhau.
 */
const FORM_COLS = MATERIAL_COLUMNS.length;
const LAST_COL = String.fromCharCode(64 + FORM_COLS); // 8 -> 'H'

/**
 * Bề rộng từng cột, đặt theo cột tương ứng của bảng vật tư.
 *
 * Cột cuối phải đủ chứa nhãn "Trọng lượng (kg)" (16 ký tự). Hẹp hơn thì Excel
 * ngắt nhãn xuống dòng hai, mà dòng hai lại nằm ngoài chiều cao đã khoá của dòng
 * tiêu đề nên bị cắt - đúng hiện tượng cột trọng lượng "lồi ra ngoài" khung.
 */
const COL_WIDTHS = [6, 14, 32, 11, 10, 14, 12, 17];

/** Khối nhãn của một trường chiếm A:C, khối giá trị chiếm D:H. */
const LABEL_WIDTH = COL_WIDTHS.slice(0, 3).reduce((a, b) => a + b, 0);
const VALUE_WIDTH = COL_WIDTHS.slice(3).reduce((a, b) => a + b, 0);

/** Xấp xỉ số dòng mà Excel phải ngắt để hiển thị hết `text` trong bề rộng `width`. */
function wrapLines(text: unknown, width: number): number {
  const length = String(text ?? '').length;
  if (!length) return 1;
  // Trừ 1 cho phần thụt lề (indent) đang đặt ở các ô nhãn/giá trị.
  return Math.max(1, Math.ceil(length / Math.max(width - 1, 4)));
}

/** Chiều cao (pt) đủ chỗ cho `lines` dòng chữ, kèm khoảng đệm trên dưới. */
function rowHeightFor(lines: number): number {
  return 6 + lines * 14;
}

const BRAND = 'FF1E40AF';
const LIGHT = 'FFEFF4FF';

/**
 * Số dòng trống trên biểu mẫu trắng.
 *
 * Hai con số này dùng chung cho cả Excel và PDF: trước đây Excel chừa 6 chặng / 8
 * vật tư còn PDF chừa 4 chặng / 5 vật tư, nên cùng một "mẫu tờ khai" mà hai bản
 * lại khác nhau, và bên nào điền bản PDF sẽ thiếu dòng so với bản Excel.
 */
const TEMPLATE_JOURNEY_ROWS = 6;
const TEMPLATE_MATERIAL_ROWS = 6;

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // ==================== Tiện ích ====================

  private scope(_user: ScopeUser) {
    // Hệ thống dùng cho 1 tổ chức duy nhất -> mọi người xem chung dữ liệu.
    return {};
  }

  private async getRecordOrThrow(id: string, user: ScopeUser) {
    const record = await this.prisma.customsRecord.findFirst({
      where: { id, ...this.scope(user) },
      include: {
        materials: { orderBy: { itemNo: 'asc' } },
        createdBy: { select: { fullName: true } },
        journeys: { orderBy: { legNumber: 'asc' } },
      },
    });
    if (!record) throw new NotFoundException('Không tìm thấy tờ khai hoặc bạn không có quyền truy cập');
    return record;
  }

  private fmtDate(d?: Date | null): string {
    return d ? new Date(d).toLocaleDateString('vi-VN') : '';
  }

  private fmtMoney(n: number, currency = ''): string {
    const s = (n ?? 0).toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return currency ? `${s} ${currency}` : s;
  }

  private recordToValues(record: any): Record<CustomsFieldKey, string> {
    const shipNo = record.flightNo || record.vesselName || record.trainNo || '';
    return {
      declarationNo: record.recordNo || '',
      entryDate: this.fmtDate(record.entryDate),
      exitDate: this.fmtDate(record.exitDate),
      flightNo: shipNo,
      exporterName: record.exporterName || '',
      exporterAddress: record.exporterAddress || '',
      exporterCountry: record.exporterCountry || '',
      importerName: record.importerName || '',
      importerAddress: record.importerAddress || '',
      importerCountry: record.importerCountry || '',
      invoiceNo: record.invoiceNo || '',
      billOfLading: record.billOfLading || '',
      containerNo: record.containerNo || '',
      currency: record.currency || '',
      vatRate: record.vatRate != null ? String(record.vatRate) : '',
      notes: record.notes || '',
    };
  }

  private recordToJourneys(record: any): JourneyRow[] {
    if (record.journeys && record.journeys.length > 0) {
      return record.journeys.map((j: any) => ({
        legNumber: j.legNumber,
        transportType: TRANSPORT_LABELS[j.transportType] || j.transportType,
        origin: j.origin,
        destination: j.destination,
      }));
    }
    // Tương thích ngược: dựng từ leg1/leg2
    const list: JourneyRow[] = [];
    const mainLabel = TRANSPORT_LABELS[record.transportType] || record.transportType || '';
    if (record.leg1Origin || record.leg1Destination) list.push({ legNumber: 1, transportType: mainLabel, origin: record.leg1Origin || '', destination: record.leg1Destination || '' });
    if (record.leg2Origin || record.leg2Destination) list.push({ legNumber: 2, transportType: mainLabel, origin: record.leg2Origin || '', destination: record.leg2Destination || '' });
    return list;
  }

  private recordToModel(record: any): FormModel {
    return {
      recordNo: record.recordNo,
      values: this.recordToValues(record),
      journeys: this.recordToJourneys(record),
      materials: record.materials || [],
      totals: {
        totalValue: record.totalValue,
        vatAmount: record.vatAmount,
        vatRate: record.vatRate,
        importDutyRate: record.importDutyRate ?? 0,
        importDutyAmount: record.importDutyAmount ?? 0,
        shippingFee: record.shippingFee,
        totalWeight: record.totalWeight ?? 0,
        totalPayable: record.totalPayable,
        currency: record.currency,
      },
    };
  }

  /** Dựng model từ dữ liệu đã parse (dùng cho chuyển đổi file, chưa lưu DB). */
  private parsedToModel(p: any): FormModel {
    const materials: MaterialRow[] = (p.materials || []).map((m: any, i: number) => ({
      itemNo: m.itemNo ?? i + 1,
      hsCode: m.hsCode,
      description: m.description,
      quantity: m.quantity,
      unit: m.unit,
      unitPrice: m.unitPrice,
      origin: m.origin,
      weight: m.weight,
    }));
    const journeys: JourneyRow[] = (p.journeys || []).map((j: any, i: number) => ({
      legNumber: j.legNumber ?? i + 1,
      transportType: TRANSPORT_LABELS[j.transportType] || j.transportType || '',
      origin: j.origin || '',
      destination: j.destination || '',
    }));
    const currency = p.currency || 'USD';
    // Dùng đúng bộ quy tắc của tờ khai thật, để bản chuyển đổi từ file không ra
    // con số khác với bản được lưu vào hệ thống từ cùng dữ liệu đó.
    const computed = calcDeclarationTotals(
      materials.map((m) => ({
        hsCode: m.hsCode,
        quantity: Number(m.quantity) || 0,
        unitPrice: Number(m.unitPrice) || 0,
        origin: m.origin,
        weight: m.weight,
      })),
      {
        exporterCountry: p.exporterCountry,
        importerCountry: p.importerCountry,
        // p.transportType là mã enum (AIR/SEA/...), còn journeys phía trên đã đổi
        // sang nhãn tiếng Việt nên không dùng được để tra bảng đơn giá.
        transportType: p.transportType,
        distanceKm: p.distanceKm,
        vatRateOverride: p.vatRate != null ? Number(p.vatRate) : undefined,
        currency,
        exchangeRate: p.exchangeRate,
      },
    );
    const vatRate = computed.vatRate;
    const values: Record<CustomsFieldKey, string> = {
      declarationNo: p.recordNo || '',
      entryDate: p.entryDate ? new Date(p.entryDate).toLocaleDateString('vi-VN') : '',
      exitDate: p.exitDate ? new Date(p.exitDate).toLocaleDateString('vi-VN') : '',
      flightNo: p.flightNo || '',
      exporterName: p.exporterName || '',
      exporterAddress: p.exporterAddress || '',
      exporterCountry: p.exporterCountry || '',
      importerName: p.importerName || '',
      importerAddress: p.importerAddress || '',
      importerCountry: p.importerCountry || '',
      invoiceNo: p.invoiceNo || '',
      billOfLading: p.billOfLading || '',
      containerNo: p.containerNo || '',
      currency,
      vatRate: String(vatRate),
      notes: p.notes || '',
    };
    return {
      recordNo: p.recordNo,
      values,
      journeys,
      materials,
      totals: {
        totalValue: computed.totalValue,
        vatAmount: computed.vatAmount,
        vatRate: computed.vatRate,
        importDutyRate: computed.importDutyRate,
        importDutyAmount: computed.importDutyAmount,
        shippingFee: computed.shippingFee,
        totalWeight: computed.totalWeight,
        totalPayable: computed.totalPayable,
        currency,
      },
    };
  }

  // ==================== EXCEL ====================

  private drawFormSheet(sheet: ExcelJS.Worksheet, model: FormModel, isTemplate: boolean) {
    const { values, journeys, materials, recordNo, totals } = model;
    COL_WIDTHS.forEach((w, i) => (sheet.getColumn(i + 1).width = w));

    // Tổng bề ngang 8 cột vượt khổ A4, nên nếu không co lại thì các cột cuối
    // (Xuất xứ, Trọng lượng) bị đẩy sang trang thứ hai khi in.
    sheet.pageSetup = {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    };

    const thin: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    };

    let r = 1;

    sheet.mergeCells(`A${r}:${LAST_COL}${r}`);
    const title = sheet.getCell(`A${r}`);
    title.value = 'TỜ KHAI HÀNG HÓA XUẤT KHẨU, NHẬP KHẨU';
    title.font = { bold: true, size: 16, color: { argb: BRAND } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(r).height = 26;
    r++;

    sheet.mergeCells(`A${r}:${LAST_COL}${r}`);
    const sub = sheet.getCell(`A${r}`);
    sub.value = 'CUSTOMS DECLARATION FOR IMPORTED / EXPORTED GOODS';
    sub.font = { italic: true, size: 9.5, color: { argb: 'FF64748B' } };
    sub.alignment = { horizontal: 'center' };
    r++;

    sheet.mergeCells(`A${r}:C${r}`);
    const formCode = sheet.getCell(`A${r}`);
    formCode.value = `Mẫu số: HQ/${new Date().getFullYear()}/XNK`;
    formCode.font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
    formCode.alignment = { horizontal: 'left', indent: 1 };

    // Nhãn và giá trị phải nằm ở HAI ô khác nhau. Gộp thành một chuỗi
    // "Số tờ khai: 123" thì lúc đọc file lại không tách được đâu là nhãn, đâu là
    // giá trị, nên số tờ khai người dùng điền sẽ bị bỏ qua hoàn toàn.
    sheet.mergeCells(`D${r}:E${r}`);
    const noLabel = sheet.getCell(`D${r}`);
    noLabel.value = 'Số tờ khai';
    noLabel.font = { bold: true, size: 11, color: { argb: 'FF334155' } };
    noLabel.alignment = { horizontal: 'right', indent: 1 };

    sheet.mergeCells(`F${r}:${LAST_COL}${r}`);
    const noValue = sheet.getCell(`F${r}`);
    noValue.value = recordNo || '';
    noValue.font = { bold: true, size: 11, color: { argb: BRAND } };
    noValue.alignment = { horizontal: 'left', indent: 1, vertical: 'middle' };
    noValue.border = { bottom: { style: 'thin', color: { argb: 'FF94A3B8' } } };
    sheet.getRow(r).height = 18;
    r += 2;

    // Các nhóm thông tin
    for (const section of SECTION_ORDER) {
      sheet.mergeCells(`A${r}:${LAST_COL}${r}`);
      const h = sheet.getCell(`A${r}`);
      h.value = section.toUpperCase();
      h.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
      h.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      sheet.getRow(r).height = 20;
      r++;

      for (const f of CUSTOMS_FIELDS.filter((x) => x.section === section)) {
        sheet.mergeCells(`A${r}:C${r}`);
        sheet.mergeCells(`D${r}:${LAST_COL}${r}`);
        const labelCell = sheet.getCell(`A${r}`);
        labelCell.value = f.label;
        labelCell.font = { bold: true, size: 10, color: { argb: 'FF475569' } };
        labelCell.alignment = { vertical: 'middle', indent: 1 };
        labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
        labelCell.border = thin;

        const valueCell = sheet.getCell(`D${r}`);
        valueCell.value = values[f.key] || '';
        valueCell.font = { size: 10 };
        valueCell.alignment = { vertical: 'middle', indent: 1, wrapText: true };
        valueCell.border = thin;
        if (isTemplate && f.key === 'currency') valueCell.dataValidation = { type: 'list', allowBlank: true, formulae: ['"USD,VND"'] } as any;
        // Ô đã gộp thì Excel không tự giãn chiều cao được, nên giá trị dài (địa chỉ,
        // ghi chú) sẽ bị cắt mất phần ngắt dòng nếu khoá cứng ở một dòng.
        sheet.getRow(r).height = rowHeightFor(
          Math.max(wrapLines(f.label, LABEL_WIDTH), wrapLines(values[f.key], VALUE_WIDTH)),
        );
        r++;
      }
      r++;
    }

    // Bảng HÀNH TRÌNH (nhiều chặng)
    r = this.drawTable(sheet, r, thin, 'HÀNH TRÌNH VẬN CHUYỂN', JOURNEY_COLUMNS.map((c) => c.label), [0.5, 2, 2.6, 2.6], isTemplate ? this.blankRows(TEMPLATE_JOURNEY_ROWS, JOURNEY_COLUMNS.length) : journeys.map((j) => [j.legNumber, j.transportType, j.origin, j.destination]));

    // Bảng VẬT TƯ - mỗi cột logic chiếm đúng 1 cột vật lý
    r = this.drawTable(sheet, r + 1, thin, 'DANH MỤC HÀNG HÓA / VẬT TƯ', MATERIAL_COLUMNS.map((c) => c.label), MATERIAL_COLUMNS.map(() => 1), isTemplate ? this.blankRows(TEMPLATE_MATERIAL_ROWS, MATERIAL_COLUMNS.length) : materials.map((m, i) => [i + 1, m.hsCode ?? '', m.description ?? '', m.quantity ?? '', m.unit ?? '', m.unitPrice ?? '', m.origin ?? '', m.weight ?? '']), true);

    // Tổng kết
    if (totals) {
      r++;
      const addTotal = (label: string, value: string, bold = false) => {
        sheet.mergeCells(`A${r}:E${r}`);
        const l = sheet.getCell(`A${r}`);
        l.value = label;
        l.alignment = { horizontal: 'right', indent: 1 };
        l.font = { bold, size: 10, color: { argb: bold ? BRAND : 'FF334155' } };
        sheet.mergeCells(`F${r}:${LAST_COL}${r}`);
        const v = sheet.getCell(`F${r}`);
        v.value = value;
        v.alignment = { horizontal: 'right', indent: 1 };
        v.font = { bold, size: bold ? 12 : 10, color: { argb: bold ? BRAND : 'FF334155' } };
        r++;
      };
      addTotal('Tổng giá trị hàng:', this.fmtMoney(totals.totalValue, totals.currency));
      if (totals.totalWeight) addTotal('Tổng trọng lượng:', `${totals.totalWeight.toLocaleString('vi-VN')} kg`);
      // Thuế nhập khẩu đứng trước VAT vì VAT được tính trên trị giá đã có thuế
      // nhập khẩu; in ngược thứ tự sẽ không giải thích được con số tổng.
      if (totals.importDutyAmount) {
        addTotal(`Thuế nhập khẩu (${totals.importDutyRate}%):`, this.fmtMoney(totals.importDutyAmount, totals.currency));
      }
      addTotal(`Thuế VAT (${totals.vatRate}%):`, this.fmtMoney(totals.vatAmount, totals.currency));
      if (totals.shippingFee) addTotal('Phí vận chuyển:', this.fmtMoney(totals.shippingFee, totals.currency));
      addTotal('TỔNG THANH TOÁN:', this.fmtMoney(totals.totalPayable, totals.currency), true);
    }

    // Khu vực chữ ký: phải có khoảng trống thật để ký tay sau khi in, chứ không
    // chỉ là hai dòng chữ sát nhau.
    r += 2;

    // Dòng địa điểm - ngày tháng, căn phải phía trên chữ ký bên phải.
    sheet.mergeCells(`E${r}:${LAST_COL}${r}`);
    const dateLine = sheet.getCell(`E${r}`);
    const now = new Date();
    dateLine.value = isTemplate
      ? '……………, ngày …… tháng …… năm ………'
      : `Hà Nội, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`;
    dateLine.font = { italic: true, size: 10, color: { argb: 'FF334155' } };
    dateLine.alignment = { horizontal: 'center' };
    r++;

    const signatureRow = (left: string, right: string, font: Partial<ExcelJS.Font>) => {
      sheet.mergeCells(`A${r}:D${r}`);
      sheet.mergeCells(`E${r}:${LAST_COL}${r}`);
      const l = sheet.getCell(`A${r}`);
      l.value = left;
      l.font = font;
      l.alignment = { horizontal: 'center' };
      const right2 = sheet.getCell(`E${r}`);
      right2.value = right;
      right2.font = font;
      right2.alignment = { horizontal: 'center' };
      r++;
    };

    signatureRow('NGƯỜI KHAI BÁO', 'XÁC NHẬN CỦA GIÁM ĐỐC', { bold: true, size: 10 });
    signatureRow('(Ký, ghi rõ họ tên)', '(Ký, ghi rõ họ tên)', { italic: true, size: 9, color: { argb: 'FF64748B' } });

    // Bốn dòng trống cao 18pt = khoảng 1,8cm chỗ ký, rồi một dòng gạch chân để
    // biết ký vào đâu. Bản trước chỉ có một dòng cao 50 nên in ra không đủ chỗ.
    for (let blank = 0; blank < 4; blank += 1) {
      sheet.mergeCells(`A${r}:D${r}`);
      sheet.mergeCells(`E${r}:${LAST_COL}${r}`);
      sheet.getRow(r).height = 18;
      r++;
    }

    const underline: Partial<ExcelJS.Borders> = { bottom: { style: 'thin', color: { argb: 'FF94A3B8' } } };
    sheet.mergeCells(`B${r}:C${r}`);
    sheet.getCell(`B${r}`).border = underline;
    sheet.mergeCells(`F${r}:G${r}`);
    sheet.getCell(`F${r}`).border = underline;
    sheet.getRow(r).height = 16;
  }

  /** Vẽ 1 bảng (tiêu đề + header cột + các dòng dữ liệu) trên toàn bộ bề ngang biểu mẫu. Trả về row tiếp theo. */
  private drawTable(sheet: ExcelJS.Worksheet, startRow: number, thin: Partial<ExcelJS.Borders>, title: string, headers: string[], weights: number[], rows: any[][], descIsCol3 = false): number {
    let r = startRow;
    sheet.mergeCells(`A${r}:${LAST_COL}${r}`);
    const t = sheet.getCell(`A${r}`);
    t.value = title;
    t.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    t.alignment = { horizontal: 'left', indent: 1, vertical: 'middle' };
    sheet.getRow(r).height = 20;
    r++;

    // Map các cột logic sang các cột vật lý theo trọng số
    const spans = this.spread(weights, FORM_COLS);
    /** Bề rộng thực tế (tính theo ký tự) của cột logic thứ i. */
    const spanWidth = (i: number) => COL_WIDTHS.slice(spans[i][0] - 1, spans[i][1]).reduce((a, b) => a + b, 0);

    const headerRow = sheet.getRow(r);
    headers.forEach((h, i) => {
      const [c1, c2] = spans[i];
      if (c2 > c1) sheet.mergeCells(r, c1, r, c2);
      const cell = headerRow.getCell(c1);
      cell.value = h;
      cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thin;
    });
    sheet.getRow(r).height = rowHeightFor(Math.max(...headers.map((h, i) => wrapLines(h, spanWidth(i)))));
    r++;

    for (const row of rows) {
      const dataRow = sheet.getRow(r);
      row.forEach((v, i) => {
        const [c1, c2] = spans[i];
        if (c2 > c1) sheet.mergeCells(r, c1, r, c2);
        const cell = dataRow.getCell(c1);
        cell.value = v as any;
        cell.font = { size: 10 };
        cell.border = thin;
        const leftAlign = descIsCol3 ? i === 2 : i >= 2;
        cell.alignment = { vertical: 'middle', horizontal: leftAlign ? 'left' : 'center', indent: leftAlign ? 1 : 0, wrapText: true };
      });
      // Mô tả hàng hoá dài hơn bề rộng cột thì phải nới dòng ra, nếu không tên
      // hàng bị cắt còn một nửa ngay trên bản in.
      sheet.getRow(r).height = rowHeightFor(Math.max(...row.map((v, i) => wrapLines(v, spanWidth(i)))));
      r++;
    }
    return r;
  }

  /**
   * Chia totalCols cột vật lý cho các cột logic theo trọng số; trả về [colStart, colEnd] (1-based).
   *
   * Mỗi cột logic được cấp trước 1 cột vật lý, phần dư mới chia theo trọng số
   * (largest remainder). Chia thẳng theo tỷ lệ rồi làm tròn - như bản trước đây -
   * khiến cột nhẹ cân bị làm tròn xuống 0, các cột sau bị đẩy dần sang phải và
   * cuối cùng tràn khỏi bề ngang biểu mẫu: cả nhóm Đơn giá / Xuất xứ / Trọng
   * lượng cùng rơi vào một ô nằm ngoài khung và ghi đè lên nhau.
   */
  private spread(weights: number[], totalCols: number): [number, number][] {
    const widths = weights.map(() => 1);
    const spare = totalCols - weights.length;

    if (spare > 0) {
      const sum = weights.reduce((a, b) => a + b, 0) || weights.length;
      const exact = weights.map((w) => (w / sum) * spare);
      const extra = exact.map((v) => Math.floor(v));
      let used = extra.reduce((a, b) => a + b, 0);
      const byRemainder = exact
        .map((v, i) => ({ i, remainder: v - Math.floor(v) }))
        .sort((a, b) => b.remainder - a.remainder);
      for (const { i } of byRemainder) {
        if (used >= spare) break;
        extra[i] += 1;
        used += 1;
      }
      extra.forEach((e, i) => (widths[i] += e));
    }

    const spans: [number, number][] = [];
    let col = 1;
    for (const width of widths) {
      spans.push([col, col + width - 1]);
      col += width;
    }
    return spans;
  }

  private blankRows(count: number, cols: number): any[][] {
    return Array.from({ length: count }, (_, i) => {
      const row: any[] = Array.from({ length: cols }, () => '');
      row[0] = i + 1;
      return row;
    });
  }

  async exportToExcel(id: string, user: ScopeUser): Promise<Buffer> {
    const record = await this.getRecordOrThrow(id, user);
    return this.modelToExcel(this.recordToModel(record));
  }

  async exportTemplateExcel(): Promise<Buffer> {
    return this.modelToExcel(this.emptyModel(), true);
  }

  /**
   * Biểu mẫu trắng - dùng chung cho cả Excel và PDF.
   *
   * Hai bản mẫu phải sinh ra từ cùng một model, nếu không chúng lại lệch nhau như
   * trước (Excel 6 chặng/8 vật tư, PDF 4 chặng/5 vật tư).
   */
  private emptyModel(): FormModel {
    const emptyValues = Object.fromEntries(CUSTOMS_FIELDS.map((f) => [f.key, ''])) as Record<CustomsFieldKey, string>;
    return { values: emptyValues, journeys: [], materials: [] };
  }

  /** Dựng file Excel từ model (dùng cho export & chuyển đổi). */
  async modelToExcel(model: FormModel, isTemplate = false): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Customs App';
    const sheet = workbook.addWorksheet('Tờ khai hải quan');
    this.drawFormSheet(sheet, model, isTemplate);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ==================== PDF ====================

  private buildPdfDoc(model: FormModel, isTemplate: boolean): any {
    const { values, journeys, materials, totals } = model;
    const cur = totals?.currency || values.currency || '';

    const infoTable = (section: string) => {
      const rows = CUSTOMS_FIELDS.filter((f) => f.section === section).map((f) => [
        { text: f.label, style: 'fieldLabel' },
        { text: values[f.key] || (isTemplate ? '' : '—'), style: 'fieldValue' },
      ]);
      return {
        table: { widths: ['42%', '58%'], body: rows },
        // Đệm 2pt thay vì 4pt: nhân với 18 ô của biểu mẫu là hơn 70pt chiều cao,
        // đủ để khối chữ ký bị đẩy sang trang thứ hai.
        layout: { hLineColor: () => '#e2e8f0', vLineColor: () => '#e2e8f0', hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingTop: () => 2, paddingBottom: () => 2 },
        margin: [0, 0, 0, 6],
      };
    };
    const sectionHeader = (t: string) => ({ text: t.toUpperCase(), style: 'sectionHeader', margin: [0, 6, 0, 4] });

    const journeyRows = isTemplate
      ? Array.from({ length: TEMPLATE_JOURNEY_ROWS }, (_, i) => [String(i + 1), '', '', ''])
      : journeys.map((j) => [String(j.legNumber), j.transportType, j.origin, j.destination]);
    const journeyBody = [JOURNEY_COLUMNS.map((c) => ({ text: c.label, style: 'tableHeader' })), ...journeyRows.map((row) => row.map((v, i) => ({ text: String(v ?? ''), alignment: i === 0 ? 'center' : 'left' })))];

    const materialRows = isTemplate
      ? Array.from({ length: TEMPLATE_MATERIAL_ROWS }, (_, i) => [String(i + 1), '', '', '', '', '', '', ''])
      : materials.map((m, i) => [String(i + 1), m.hsCode || '—', m.description || '', this.fmtMoney(m.quantity || 0), m.unit || '', this.fmtMoney(m.unitPrice || 0), m.origin || '—', m.weight != null ? this.fmtMoney(m.weight) : '—']);
    const materialBody = [
      MATERIAL_COLUMNS.map((c) => ({ text: c.label, style: 'tableHeader' })),
      ...materialRows.map((row) => row.map((v, i) => ({ text: String(v ?? ''), alignment: i === 2 ? 'left' : i === 5 ? 'right' : 'center' }))),
    ];

    const content: any[] = [
      { text: 'TỜ KHAI HÀNG HÓA XUẤT KHẨU, NHẬP KHẨU', style: 'title', alignment: 'center' },
      { text: 'CUSTOMS DECLARATION FOR IMPORTED / EXPORTED GOODS', style: 'subtitle', alignment: 'center', margin: [0, 0, 0, 4] },
      { text: `Mẫu số: HQ/${new Date().getFullYear()}/XNK`, italics: true, fontSize: 9, color: '#64748b' },
      // Số tờ khai đứng riêng một dòng bắt đầu bằng đúng nhãn của nó: khi đọc
      // ngược file PDF, bộ đọc dò theo từng dòng "Nhãn: giá trị", nên nếu ghép
      // chung dòng với "Mẫu số" thì hai chuỗi dính liền và không tách ra được.
      {
        text: `Số tờ khai: ${model.recordNo || (isTemplate ? '………………………' : '—')}`,
        alignment: 'right',
        bold: true,
        color: '#334155',
        margin: [0, 2, 0, 12],
      },

      sectionHeader('Thông tin chung'),
      infoTable('Thông tin chung'),
      {
        columns: [
          [sectionHeader('Bên xuất khẩu'), infoTable('Bên xuất khẩu')],
          [sectionHeader('Bên nhập khẩu'), infoTable('Bên nhập khẩu')],
        ],
        columnGap: 12,
      },
      // Chứng từ và Tài chính xếp cạnh nhau cho gọn chiều cao: biểu mẫu trắng phải
      // vừa một trang mà vẫn còn chỗ ký ở cuối, chứ không đẩy phần chữ ký sang
      // trang thứ hai.
      //
      // Khối Tài chính là bắt buộc: không có nó thì tiền tệ, thuế suất VAT và ghi
      // chú không hề xuất hiện trên bản PDF, và khi đọc ngược lại file sẽ mất
      // trắng ba trường đó.
      {
        columns: [
          [sectionHeader('Chứng từ'), infoTable('Chứng từ')],
          [sectionHeader('Tài chính'), infoTable('Tài chính')],
        ],
        columnGap: 12,
      },

      sectionHeader('Hành trình vận chuyển'),
      { table: { headerRows: 1, widths: [28, 90, '*', '*'], body: journeyBody, dontBreakRows: true }, layout: this.tableLayout(), margin: [0, 0, 0, 8] },

      sectionHeader('Danh mục hàng hóa / vật tư'),
      // Cột "Trọng lượng (kg)" phải đủ rộng cho nhãn của nó: hẹp hơn thì nhãn ngắt
      // xuống ba dòng và đội cao cả dòng tiêu đề.
      { table: { headerRows: 1, widths: [22, 42, '*', 38, 32, 46, 36, 52], body: materialBody, dontBreakRows: true }, layout: this.tableLayout(), margin: [0, 0, 0, 8] },
    ];

    if (totals) {
      content.push({
        columns: [
          { width: '*', text: '' },
          {
            width: 'auto',
            table: {
              body: [
                [{ text: 'Tổng giá trị hàng:', style: 'totLabel' }, { text: this.fmtMoney(totals.totalValue, cur), style: 'totValue' }],
                ...(totals.totalWeight
                  ? [[{ text: 'Tổng trọng lượng:', style: 'totLabel' }, { text: `${totals.totalWeight.toLocaleString('vi-VN')} kg`, style: 'totValue' }]]
                  : []),
                // Thuế nhập khẩu in trước VAT vì VAT tính trên trị giá đã có thuế
                // nhập khẩu - in ngược thì không giải thích được con số tổng.
                ...(totals.importDutyAmount
                  ? [[{ text: `Thuế nhập khẩu (${totals.importDutyRate}%):`, style: 'totLabel' }, { text: this.fmtMoney(totals.importDutyAmount, cur), style: 'totValue' }]]
                  : []),
                [{ text: `Thuế VAT (${totals.vatRate}%):`, style: 'totLabel' }, { text: this.fmtMoney(totals.vatAmount, cur), style: 'totValue' }],
                ...(totals.shippingFee ? [[{ text: 'Phí vận chuyển:', style: 'totLabel' }, { text: this.fmtMoney(totals.shippingFee, cur), style: 'totValue' }]] : []),
                [{ text: 'TỔNG THANH TOÁN:', style: 'totLabelBold' }, { text: this.fmtMoney(totals.totalPayable, cur), style: 'totValueBold' }],
              ],
            },
            layout: 'noBorders',
          },
        ],
      });
    }

    // Khu vực ký: bản in phải có chỗ ký tay thật.
    //
    // Trước đây chỉ có hai dòng chữ đặt cách nội dung 30pt, nên tờ khai kín chữ
    // từ trên xuống dưới và không còn khoảng trắng nào để đặt bút. Ở đây mỗi bên
    // được chừa 64pt trắng rồi mới tới đường kẻ ký, và cả khối được đánh dấu
    // unbreakable để không bị tách làm hai trang.
    const signatureColumn = (title: string) => ({
      width: '*',
      stack: [
        { text: title, bold: true, alignment: 'center' as const },
        { text: '(Ký, ghi rõ họ tên)', italics: true, fontSize: 8, alignment: 'center' as const, color: '#64748b' },
        {
          canvas: [{ type: 'line', x1: 40, y1: 0, x2: 200, y2: 0, lineWidth: 0.7, lineColor: '#94a3b8' }],
          margin: [0, 64, 0, 0],
        },
      ],
    });

    content.push({
      unbreakable: true,
      stack: [
        {
          text: isTemplate
            ? '……………………, ngày …… tháng …… năm ………'
            : `Hà Nội, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`,
          italics: true,
          alignment: 'right',
          color: '#334155',
          margin: [0, 18, 8, 10],
        },
        { columns: [signatureColumn('Người khai báo'), signatureColumn('Xác nhận của Giám đốc')], columnGap: 16 },
      ],
    });

    return {
      pageSize: 'A4',
      // Lề dưới rộng hơn lề trên: đây là mép giấy hay bị kẹp/đóng ghim khi lưu hồ sơ.
      pageMargins: [36, 40, 36, 56],
      defaultStyle: { font: 'Roboto', fontSize: 9, color: '#1e293b' },
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: `Hệ thống Quản Lý Hải Quan · ${new Date().toLocaleString('vi-VN')}`, style: 'footer' },
          { text: `Trang ${currentPage}/${pageCount}`, alignment: 'right', style: 'footer' },
        ],
        margin: [36, 10, 36, 0],
      }),
      content,
      styles: {
        title: { fontSize: 18, bold: true, color: '#1e40af' },
        subtitle: { fontSize: 9, italics: true, color: '#64748b' },
        sectionHeader: { fontSize: 10, bold: true, color: '#ffffff' },
        fieldLabel: { bold: true, color: '#475569', fillColor: '#eff4ff' },
        fieldValue: { color: '#1e293b' },
        tableHeader: { bold: true, color: '#ffffff', alignment: 'center' },
        totLabel: { alignment: 'right', color: '#334155', margin: [0, 1, 8, 1] },
        totValue: { alignment: 'right', color: '#334155', margin: [0, 1, 0, 1] },
        totLabelBold: { alignment: 'right', bold: true, fontSize: 11, color: '#1e40af', margin: [0, 2, 8, 2] },
        totValueBold: { alignment: 'right', bold: true, fontSize: 11, color: '#1e40af', margin: [0, 2, 0, 2] },
        footer: { fontSize: 7, color: '#94a3b8' },
      },
    };
  }

  private tableLayout() {
    return {
      fillColor: (rowIndex: number) => (rowIndex === 0 ? '#334155' : rowIndex % 2 === 0 ? '#f8fafc' : null),
      hLineColor: () => '#e2e8f0',
      vLineColor: () => '#e2e8f0',
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
    };
  }

  /** Bọc mỗi sectionHeader (text có style sectionHeader) thành bảng 1 ô để có nền màu. */
  private wrapSectionHeaders(doc: any): any {
    const walk = (node: any): any => {
      if (Array.isArray(node)) return node.map(walk);
      if (node && typeof node === 'object') {
        if (node.style === 'sectionHeader' && node.text) {
          return {
            table: { widths: ['*'], body: [[{ text: node.text, color: '#ffffff', bold: true, fontSize: 10 }]] },
            layout: { fillColor: () => '#1e40af', hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 2, paddingBottom: () => 2 },
            margin: node.margin || [0, 6, 0, 4],
          };
        }
        const copy: any = { ...node };
        for (const k of Object.keys(copy)) copy[k] = walk(copy[k]);
        return copy;
      }
      return node;
    };
    return walk(doc);
  }

  async modelToPdf(model: FormModel, isTemplate = false): Promise<Buffer> {
    const printer = new PdfPrinter(pdfFonts);
    const pdfDoc = printer.createPdfKitDocument(this.wrapSectionHeaders(this.buildPdfDoc(model, isTemplate)));
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (c: Buffer) => chunks.push(c));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });
  }

  async exportToPdf(id: string, user: ScopeUser): Promise<Buffer> {
    const record = await this.getRecordOrThrow(id, user);
    return this.modelToPdf(this.recordToModel(record));
  }

  async exportTemplatePdf(): Promise<Buffer> {
    return this.modelToPdf(this.emptyModel(), true);
  }

  // ==================== Chuyển đổi file ====================

  /** Dữ liệu đã parse (từ AiService) -> Excel. */
  async parsedToExcel(parsed: any): Promise<Buffer> {
    return this.modelToExcel(this.parsedToModel(parsed));
  }

  /** Dữ liệu đã parse (từ AiService) -> PDF. */
  async parsedToPdf(parsed: any): Promise<Buffer> {
    return this.modelToPdf(this.parsedToModel(parsed));
  }
}
