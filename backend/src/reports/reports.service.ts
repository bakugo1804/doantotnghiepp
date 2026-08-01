import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import { CUSTOMS_FIELDS, CustomsFieldKey, JOURNEY_COLUMNS, MATERIAL_COLUMNS, TRANSPORT_LABELS } from '../common/customs-form';

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
type Totals = { totalValue: number; vatAmount: number; shippingFee: number; totalPayable: number; vatRate: number; currency: string };

/** Mô hình trung gian dùng chung cho xuất Excel & PDF (từ bản ghi DB hoặc dữ liệu đã parse). */
interface FormModel {
  recordNo?: string;
  values: Record<CustomsFieldKey, string>;
  journeys: JourneyRow[];
  materials: MaterialRow[];
  totals?: Totals;
}

// Nhóm hiển thị (đã bỏ 'Hành trình' vì chuyển sang bảng nhiều chặng riêng)
const SECTION_ORDER = ['Thông tin chung', 'Bên xuất khẩu', 'Bên nhập khẩu', 'Chứng từ', 'Tài chính'];

const BRAND = 'FF1E40AF';
const LIGHT = 'FFEFF4FF';

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
        shippingFee: record.shippingFee,
        totalPayable: record.totalPayable,
        vatRate: record.vatRate,
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
    const vatRate = p.vatRate != null ? Number(p.vatRate) : 10;
    const totalValue = materials.reduce((s, m) => s + (Number(m.quantity) || 0) * (Number(m.unitPrice) || 0), 0);
    const vatAmount = (totalValue * vatRate) / 100;
    const values: Record<CustomsFieldKey, string> = {
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
      totals: { totalValue, vatAmount, shippingFee: 0, totalPayable: totalValue + vatAmount, vatRate, currency },
    };
  }

  // ==================== EXCEL ====================

  private drawFormSheet(sheet: ExcelJS.Worksheet, model: FormModel, isTemplate: boolean) {
    const { values, journeys, materials, recordNo, totals } = model;
    [24, 16, 20, 14, 16, 16].forEach((w, i) => (sheet.getColumn(i + 1).width = w));

    const thin: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    };

    let r = 1;
    sheet.mergeCells(`A${r}:F${r}`);
    const title = sheet.getCell(`A${r}`);
    title.value = 'TỜ KHAI HẢI QUAN';
    title.font = { bold: true, size: 18, color: { argb: BRAND } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(r).height = 28;
    r++;

    sheet.mergeCells(`A${r}:F${r}`);
    const sub = sheet.getCell(`A${r}`);
    sub.value = 'CUSTOMS DECLARATION';
    sub.font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
    sub.alignment = { horizontal: 'center' };
    r++;

    sheet.mergeCells(`A${r}:F${r}`);
    const noCell = sheet.getCell(`A${r}`);
    noCell.value = recordNo ? `Số tờ khai: ${recordNo}` : 'Số tờ khai: ..............................';
    noCell.font = { bold: true, size: 11, color: { argb: 'FF334155' } };
    noCell.alignment = { horizontal: 'center' };
    r += 2;

    // Các nhóm thông tin
    for (const section of SECTION_ORDER) {
      sheet.mergeCells(`A${r}:F${r}`);
      const h = sheet.getCell(`A${r}`);
      h.value = section.toUpperCase();
      h.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
      h.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      sheet.getRow(r).height = 20;
      r++;

      for (const f of CUSTOMS_FIELDS.filter((x) => x.section === section)) {
        sheet.mergeCells(`A${r}:B${r}`);
        sheet.mergeCells(`C${r}:F${r}`);
        const labelCell = sheet.getCell(`A${r}`);
        labelCell.value = f.label;
        labelCell.font = { bold: true, size: 10, color: { argb: 'FF475569' } };
        labelCell.alignment = { vertical: 'middle', indent: 1 };
        labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
        labelCell.border = thin;

        const valueCell = sheet.getCell(`C${r}`);
        valueCell.value = values[f.key] || '';
        valueCell.font = { size: 10 };
        valueCell.alignment = { vertical: 'middle', indent: 1, wrapText: true };
        valueCell.border = thin;
        if (isTemplate && f.key === 'currency') valueCell.dataValidation = { type: 'list', allowBlank: true, formulae: ['"USD,VND"'] } as any;
        sheet.getRow(r).height = 18;
        r++;
      }
      r++;
    }

    // Bảng HÀNH TRÌNH (nhiều chặng)
    r = this.drawTable(sheet, r, thin, 'HÀNH TRÌNH VẬN CHUYỂN (có thể nhiều chặng)', JOURNEY_COLUMNS.map((c) => c.label), [1, 1.6, 2, 2], isTemplate ? this.blankRows(6) : journeys.map((j) => [j.legNumber, j.transportType, j.origin, j.destination]), isTemplate);

    // Bảng VẬT TƯ
    r = this.drawTable(sheet, r + 1, thin, 'DANH MỤC HÀNG HÓA / VẬT TƯ', MATERIAL_COLUMNS.map((c) => c.label), [0.6, 1, 2.4, 0.9, 0.9, 1.1, 1, 1], isTemplate ? this.blankRows(8, 8, true) : materials.map((m, i) => [i + 1, m.hsCode ?? '', m.description ?? '', m.quantity ?? '', m.unit ?? '', m.unitPrice ?? '', m.origin ?? '', m.weight ?? '']), isTemplate, true);

    // Tổng kết
    if (totals) {
      r++;
      const addTotal = (label: string, value: string, bold = false) => {
        sheet.mergeCells(`A${r}:D${r}`);
        const l = sheet.getCell(`A${r}`);
        l.value = label;
        l.alignment = { horizontal: 'right', indent: 1 };
        l.font = { bold, size: 10, color: { argb: bold ? BRAND : 'FF334155' } };
        sheet.mergeCells(`E${r}:F${r}`);
        const v = sheet.getCell(`E${r}`);
        v.value = value;
        v.alignment = { horizontal: 'right', indent: 1 };
        v.font = { bold, size: bold ? 12 : 10, color: { argb: bold ? BRAND : 'FF334155' } };
        r++;
      };
      addTotal('Tổng giá trị hàng:', this.fmtMoney(totals.totalValue, totals.currency));
      addTotal(`Thuế VAT (${totals.vatRate}%):`, this.fmtMoney(totals.vatAmount, totals.currency));
      if (totals.shippingFee) addTotal('Phí vận chuyển:', this.fmtMoney(totals.shippingFee, totals.currency));
      addTotal('TỔNG THANH TOÁN:', this.fmtMoney(totals.totalPayable, totals.currency), true);
    }

    // Chữ ký xác nhận
    r += 2;
    sheet.mergeCells(`A${r}:C${r}`);
    sheet.mergeCells(`D${r}:F${r}`);
    const s1 = sheet.getCell(`A${r}`);
    s1.value = 'NGƯỜI KHAI BÁO';
    s1.font = { bold: true, size: 10 };
    s1.alignment = { horizontal: 'center' };
    const s2 = sheet.getCell(`D${r}`);
    s2.value = 'XÁC NHẬN CỦA GIÁM ĐỐC';
    s2.font = { bold: true, size: 10 };
    s2.alignment = { horizontal: 'center' };
    r++;
    sheet.mergeCells(`A${r}:C${r}`);
    sheet.mergeCells(`D${r}:F${r}`);
    const s1b = sheet.getCell(`A${r}`);
    s1b.value = '(Ký, ghi rõ họ tên)';
    s1b.font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
    s1b.alignment = { horizontal: 'center' };
    const s2b = sheet.getCell(`D${r}`);
    s2b.value = '(Ký, ghi rõ họ tên)';
    s2b.font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
    s2b.alignment = { horizontal: 'center' };
    sheet.getRow(r).height = 50;

    if (isTemplate) {
      r += 2;
      sheet.mergeCells(`A${r}:F${r}`);
      const note = sheet.getCell(`A${r}`);
      note.value =
        'HƯỚNG DẪN: Điền trực tiếp vào ô bên phải mỗi nhãn. Bảng HÀNH TRÌNH có thể thêm nhiều chặng (Đường hàng không/Đường biển/Đường sắt/Đường bộ). ' +
        'Bảng HÀNG HÓA có thể thêm nhiều dòng. Ngày ghi dạng NGÀY/THÁNG/NĂM. Sau đó tải file này lên hệ thống ở mục "Nhập từ file".';
      note.font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
      note.alignment = { wrapText: true, vertical: 'top' };
      sheet.getRow(r).height = 46;
    }
  }

  /** Vẽ 1 bảng (tiêu đề + header cột + các dòng dữ liệu) vào 6 cột A..F. Trả về row tiếp theo. */
  private drawTable(sheet: ExcelJS.Worksheet, startRow: number, thin: Partial<ExcelJS.Borders>, title: string, headers: string[], weights: number[], rows: any[][], isTemplate: boolean, descIsCol3 = false): number {
    let r = startRow;
    sheet.mergeCells(`A${r}:F${r}`);
    const t = sheet.getCell(`A${r}`);
    t.value = title;
    t.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    t.alignment = { horizontal: 'left', indent: 1, vertical: 'middle' };
    sheet.getRow(r).height = 20;
    r++;

    // Map các cột logic sang 6 cột vật lý theo trọng số
    const spans = this.spread(weights, 6);
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
    sheet.getRow(r).height = 22;
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
      sheet.getRow(r).height = 18;
      r++;
    }
    return r;
  }

  /** Chia n cột vật lý cho các cột logic theo trọng số; trả về [colStart, colEnd] (1-based). */
  private spread(weights: number[], totalCols: number): [number, number][] {
    const sum = weights.reduce((a, b) => a + b, 0);
    const spans: [number, number][] = [];
    let col = 1;
    weights.forEach((w, i) => {
      let width = i === weights.length - 1 ? totalCols - col + 1 : Math.max(1, Math.round((w / sum) * totalCols));
      if (col + width - 1 > totalCols) width = totalCols - col + 1;
      spans.push([col, col + width - 1]);
      col += width;
    });
    return spans;
  }

  private blankRows(count: number, cols = 4, _numberFirst = false): any[][] {
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
    const emptyValues = Object.fromEntries(CUSTOMS_FIELDS.map((f) => [f.key, ''])) as Record<CustomsFieldKey, string>;
    return this.modelToExcel({ values: emptyValues, journeys: [], materials: [] }, true);
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
        table: { widths: ['40%', '60%'], body: rows },
        layout: { hLineColor: () => '#e2e8f0', vLineColor: () => '#e2e8f0', hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingTop: () => 4, paddingBottom: () => 4 },
        margin: [0, 0, 0, 10],
      };
    };
    const sectionHeader = (t: string) => ({ text: t.toUpperCase(), style: 'sectionHeader', margin: [0, 6, 0, 4] });

    const journeyRows = isTemplate
      ? Array.from({ length: 4 }, (_, i) => [String(i + 1), '', '', ''])
      : journeys.map((j) => [String(j.legNumber), j.transportType, j.origin, j.destination]);
    const journeyBody = [JOURNEY_COLUMNS.map((c) => ({ text: c.label, style: 'tableHeader' })), ...journeyRows.map((row) => row.map((v, i) => ({ text: String(v ?? ''), alignment: i === 0 ? 'center' : 'left' })))];

    const materialRows = isTemplate
      ? Array.from({ length: 5 }, (_, i) => [String(i + 1), '', '', '', '', '', '', ''])
      : materials.map((m, i) => [String(i + 1), m.hsCode || '—', m.description || '', this.fmtMoney(m.quantity || 0), m.unit || '', this.fmtMoney(m.unitPrice || 0), m.origin || '—', m.weight != null ? this.fmtMoney(m.weight) : '—']);
    const materialBody = [
      MATERIAL_COLUMNS.map((c) => ({ text: c.label, style: 'tableHeader' })),
      ...materialRows.map((row) => row.map((v, i) => ({ text: String(v ?? ''), alignment: i === 2 ? 'left' : i === 5 ? 'right' : 'center' }))),
    ];

    const content: any[] = [
      { text: 'TỜ KHAI HẢI QUAN', style: 'title', alignment: 'center' },
      { text: 'CUSTOMS DECLARATION', style: 'subtitle', alignment: 'center', margin: [0, 0, 0, 2] },
      { text: model.recordNo ? `Số tờ khai: ${model.recordNo}` : (isTemplate ? 'Số tờ khai: ..............................' : ''), alignment: 'center', bold: true, color: '#334155', margin: [0, 0, 0, 12] },

      sectionHeader('Thông tin chung'),
      infoTable('Thông tin chung'),
      {
        columns: [
          [sectionHeader('Bên xuất khẩu'), infoTable('Bên xuất khẩu')],
          [sectionHeader('Bên nhập khẩu'), infoTable('Bên nhập khẩu')],
        ],
        columnGap: 12,
      },
      sectionHeader('Chứng từ'),
      infoTable('Chứng từ'),

      sectionHeader('Hành trình vận chuyển'),
      { table: { headerRows: 1, widths: [28, 90, '*', '*'], body: journeyBody }, layout: this.tableLayout(), margin: [0, 0, 0, 12] },

      sectionHeader('Danh mục hàng hóa / vật tư'),
      { table: { headerRows: 1, widths: [18, 44, '*', 40, 32, 52, 44, 40], body: materialBody }, layout: this.tableLayout(), margin: [0, 0, 0, 12] },
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

    content.push({
      columns: [
        { stack: [{ text: 'Người khai báo', bold: true, alignment: 'center' }, { text: '(Ký, ghi rõ họ tên)', italics: true, fontSize: 8, alignment: 'center', color: '#64748b' }], margin: [0, 30, 0, 0] },
        { stack: [{ text: 'Xác nhận của Giám đốc', bold: true, alignment: 'center' }, { text: '(Ký, ghi rõ họ tên)', italics: true, fontSize: 8, alignment: 'center', color: '#64748b' }], margin: [0, 30, 0, 0] },
      ],
    });

    return {
      pageSize: 'A4',
      pageMargins: [36, 40, 36, 48],
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
    const emptyValues = Object.fromEntries(CUSTOMS_FIELDS.map((f) => [f.key, ''])) as Record<CustomsFieldKey, string>;
    return this.modelToPdf({ values: emptyValues, journeys: [], materials: [] }, true);
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
