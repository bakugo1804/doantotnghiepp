import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import {
  CustomsFieldKey,
  CUSTOMS_FIELDS,
  matchField,
  matchMaterialColumn,
  matchJourneyColumn,
  MATERIAL_COLUMNS,
  MaterialFieldKey,
  JourneyFieldKey,
  isPlaceholderText,
  normalizeTransport,
} from '../common/customs-form';
import { normalizeCountryCode } from '../common/countries';
import { normalizeHsCode } from '../hs-codes/hs-codes.service';

// pdf-parse (thuần JS) — trích xuất text từ PDF có lớp text
const pdfParse = require('pdf-parse');

/** Đủ dài để Ollama nạp model từ đầu ở lần hỏi đầu tiên. */
const AI_TIMEOUT_MS = 150_000;

/**
 * Số lượt hội thoại cũ gửi kèm.
 *
 * Giữ lại quá nhiều lịch sử khiến model 3B bám vào chủ đề cũ và trả lời lạc đề:
 * người dùng hỏi một đằng, model vẫn tiếp tục câu chuyện trước đó.
 */
const CHAT_HISTORY_LIMIT = 4;

/** Quá mốc này coi như phiên trò chuyện mới, không gửi kèm lịch sử cũ nữa. */
const CHAT_SESSION_WINDOW_MS = 30 * 60 * 1000;

type ParsedMaterial = {
  itemNo: number;
  hsCode?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  origin?: string;
  weight?: number;
};

/** Một ô chữ trên bản PDF, kèm toạ độ ngang để nhận ra ô nào thuộc cột nào. */
type PdfCell = { x: number; text: string };

/** Sai số ngang (pt) khi ghép một dòng bị ngắt vào đúng ô của dòng phía trên. */
const CONTINUATION_X_TOLERANCE = 6;

type ParsedJourney = {
  legNumber: number;
  transportType: string; // AIR | SEA | RAIL | ROAD
  origin: string;
  destination: string;
};

type ParsedForm = {
  recordNo?: string;
  entryDate: string;
  exitDate?: string;
  transportType: string;
  flightNo?: string;
  journeys: ParsedJourney[];
  exporterName: string;
  exporterAddress?: string;
  exporterCountry?: string;
  importerName: string;
  importerAddress?: string;
  importerCountry?: string;
  invoiceNo?: string;
  billOfLading?: string;
  containerNo?: string;
  currency: string;
  vatRate?: number;
  notes?: string;
  materials: ParsedMaterial[];
};

@Injectable()
export class AiService {
  private openai: OpenAI | null = null;
  private model: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    // Hỗ trợ mọi nhà cung cấp tương thích OpenAI: OpenAI, Groq, Gemini, Ollama (local)...
    // Cấu hình qua .env: AI_BASE_URL, AI_MODEL, AI_API_KEY (hoặc OPENAI_API_KEY).
    const baseURL = config.get<string>('AI_BASE_URL')?.trim() || undefined;
    const rawKey = (config.get<string>('AI_API_KEY') || config.get<string>('OPENAI_API_KEY') || '').trim();
    this.model = config.get<string>('AI_MODEL')?.trim() || 'gpt-4o-mini';

    const hasRealKey = rawKey && !rawKey.startsWith('sk-dummy') && !rawKey.startsWith('sk-placeholder');
    // Bật khi có API key thật, HOẶC khi trỏ tới máy chủ local như Ollama (không cần key).
    if (hasRealKey || baseURL) {
      this.openai = new OpenAI({
        apiKey: rawKey || 'not-needed',
        baseURL,
        // Ollama phải nạp model vào RAM ở lần gọi đầu (hoặc sau vài phút không
        // dùng), bước này có thể mất cả phút. Timeout mặc định của thư viện quá
        // ngắn cho tình huống đó nên yêu cầu bị huỷ giữa chừng.
        timeout: AI_TIMEOUT_MS,
        maxRetries: 1,
      });
      this.warmUp();
    }
  }

  /**
   * Nạp sẵn mô hình vào bộ nhớ ngay khi backend khởi động.
   *
   * Ollama chỉ nạp mô hình vào lúc có yêu cầu đầu tiên, và với mô hình 7B chạy
   * trên CPU thì bước này mất hơn một phút. Nếu để tự nhiên, người dùng đầu tiên
   * hỏi gì cũng phải ngồi chờ - giữa buổi demo thì trông như bị treo.
   */
  private warmUp() {
    // Chạy nền, không chặn tiến trình khởi động, và lỗi ở đây không ảnh hưởng gì
    // tới phần còn lại của ứng dụng.
    setTimeout(() => {
      this.openai?.chat.completions
        .create({ model: this.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 })
        .then(() => console.log(`🔥 Đã nạp sẵn mô hình AI: ${this.model}`))
        .catch(() => console.warn(`⚠️  Chưa nạp được mô hình AI (${this.model}). Kiểm tra Ollama đã chạy chưa.`));
    }, 3000);
  }

  // ===== Tiện ích đọc giá trị =====
  private cellText(value: any): string {
    if (value == null) return '';
    if (typeof value === 'object') {
      if (value instanceof Date) return value.toISOString();
      if ('text' in value) return String(value.text);
      if ('result' in value) return String(value.result);
      if ('richText' in value) return value.richText.map((t: any) => t.text).join('');
      if ('hyperlink' in value) return String(value.text || value.hyperlink);
      return '';
    }
    return String(value).trim();
  }

  private toNumber(value: any): number {
    if (typeof value === 'number') return value;
    const text = this.cellText(value)
      .replace(/[^0-9.,\-]/g, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(',', '.');
    const num = parseFloat(text);
    return isNaN(num) ? 0 : num;
  }

  private parseDate(value: any): string | undefined {
    if (value instanceof Date) return value.toISOString();
    const s = this.cellText(value).trim();
    if (!s) return undefined;
    const m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m) {
      const [, d, mo, y] = m;
      const dt = new Date(Date.UTC(+y, +mo - 1, +d));
      return isNaN(dt.getTime()) ? undefined : dt.toISOString();
    }
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? undefined : dt.toISOString();
  }

  private normalizeCurrency(value: any): string {
    return this.cellText(value).toUpperCase().includes('VND') ? 'VND' : 'USD';
  }

  private assemble(fields: Partial<Record<CustomsFieldKey, string>>, journeys: ParsedJourney[], materials: ParsedMaterial[]): ParsedForm {
    // Ô để trống trên bản mẫu ("………", "—", "-") không phải dữ liệu người dùng nhập.
    for (const k of Object.keys(fields) as CustomsFieldKey[]) {
      if (isPlaceholderText(fields[k])) delete fields[k];
    }
    const vat = fields.vatRate ? this.toNumber(fields.vatRate) : undefined;
    return {
      recordNo: fields.declarationNo || undefined,
      entryDate: this.parseDate(fields.entryDate) || new Date().toISOString(),
      exitDate: this.parseDate(fields.exitDate),
      transportType: journeys[0]?.transportType || 'AIR',
      flightNo: fields.flightNo || undefined,
      journeys,
      exporterName: fields.exporterName || '',
      exporterAddress: fields.exporterAddress || undefined,
      exporterCountry: normalizeCountryCode(fields.exporterCountry),
      importerName: fields.importerName || '',
      importerAddress: fields.importerAddress || undefined,
      importerCountry: normalizeCountryCode(fields.importerCountry),
      invoiceNo: fields.invoiceNo || undefined,
      billOfLading: fields.billOfLading || undefined,
      containerNo: fields.containerNo || undefined,
      currency: this.normalizeCurrency(fields.currency),
      vatRate: vat && vat > 0 ? vat : undefined,
      notes: fields.notes || undefined,
      materials,
    };
  }

  // ==================== ĐỌC EXCEL (theo nhãn) ====================

  async parseExcel(buffer: Buffer): Promise<ParsedForm> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const fields: Partial<Record<CustomsFieldKey, string>> = {};
    let materials: ParsedMaterial[] = [];
    let journeys: ParsedJourney[] = [];

    workbook.eachSheet((sheet) => {
      const grid: string[][] = [];
      sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        const arr: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const anchor = !cell.isMerged || (cell.master && cell.master.address === cell.address);
          arr[colNumber] = anchor ? this.cellText(cell.value) : '';
        });
        grid[rowNumber] = arr;
      });

      // Một ô chỉ được coi là "giá trị" khi bản thân nó không phải nhãn của
      // trường khác - nếu không, ô trống của trường này sẽ hút nhãn nằm kế bên.
      const isLabel = (text: string) => Boolean(matchField(text) || matchMaterialColumn(text) || matchJourneyColumn(text));

      // 1) Quét các trường: nhãn -> giá trị bên phải (hoặc bên dưới nếu không phải nhãn)
      for (let rr = 1; rr < grid.length; rr++) {
        const row = grid[rr];
        if (!row) continue;
        for (let cc = 1; cc < row.length; cc++) {
          const text = (row[cc] || '').trim();
          if (!text) continue;
          const key = matchField(text);
          if (!key || fields[key] != null) continue;
          let val = '';
          for (let k = cc + 1; k < row.length; k++) {
            const candidate = (row[k] || '').trim();
            if (!candidate) continue;
            if (!isLabel(candidate)) val = candidate;
            break;
          }
          if (!val) {
            const below = grid[rr + 1];
            const belowText = below ? (below[cc] || '').trim() : '';
            if (belowText && !isLabel(belowText)) val = belowText;
          }
          if (val && !isPlaceholderText(val)) fields[key] = val;
        }
      }

      // 2) Bảng hành trình: header có 'điểm đi' & 'điểm đến'
      if (journeys.length === 0) {
        const found = this.findTableHeader(grid, (row) => {
          const map: Record<number, JourneyFieldKey> = {};
          let hasOrigin = false;
          let hasDest = false;
          for (let cc = 1; cc < row.length; cc++) {
            const k = matchJourneyColumn(row[cc]);
            if (k && !Object.values(map).includes(k)) {
              map[cc] = k;
              if (k === 'origin') hasOrigin = true;
              if (k === 'destination') hasDest = true;
            }
          }
          return hasOrigin && hasDest ? map : null;
        });
        if (found) {
          const { headerRow, colMap } = found;
          const originCol = this.colOf(colMap, 'origin');
          const destCol = this.colOf(colMap, 'destination');
          for (let rr = headerRow + 1; rr < grid.length; rr++) {
            const row = grid[rr];
            const origin = row && originCol ? (row[originCol] || '').trim() : '';
            const destination = row && destCol ? (row[destCol] || '').trim() : '';
            if (isPlaceholderText(origin) && isPlaceholderText(destination)) break;
            const tCol = this.colOf(colMap, 'transportType');
            const lCol = this.colOf(colMap, 'legNumber');
            journeys.push({
              legNumber: (lCol && this.toNumber(row[lCol])) || journeys.length + 1,
              transportType: normalizeTransport(tCol ? row[tCol] : '') || 'ROAD',
              origin,
              destination,
            });
          }
        }
      }

      // 3) Bảng vật tư: header có 'mô tả'
      if (materials.length === 0) {
        const found = this.findTableHeader(grid, (row) => {
          const map: Record<number, MaterialFieldKey> = {};
          let hits = 0;
          let hasDesc = false;
          for (let cc = 1; cc < row.length; cc++) {
            const k = matchMaterialColumn(row[cc]);
            if (k && !Object.values(map).includes(k)) {
              map[cc] = k;
              hits++;
              if (k === 'description') hasDesc = true;
            }
          }
          return hits >= 2 && hasDesc ? map : null;
        });
        if (found) {
          const { headerRow, colMap } = found;
          const descCol = this.colOf(colMap, 'description');
          for (let rr = headerRow + 1; rr < grid.length; rr++) {
            const row = grid[rr];
            const desc = row && descCol ? (row[descCol] || '').trim() : '';
            if (isPlaceholderText(desc)) break;
            const get = (key: MaterialFieldKey) => {
              const cc = this.colOf(colMap, key);
              return cc ? row[cc] : undefined;
            };
            materials.push({
              itemNo: this.toNumber(get('itemNo')) || materials.length + 1,
              // Chuẩn hoá ngay khi đọc: "847130" và "8471.30" phải trỏ về cùng một
              // mã trong danh mục, nếu không bảng tra thuế theo chương đọc sai và
              // danh mục mã HS sinh ra hai bản ghi cho cùng một mặt hàng.
              hsCode: normalizeHsCode(get('hsCode')) || undefined,
              description: desc,
              quantity: this.toNumber(get('quantity')),
              unit: this.cellText(get('unit')) || 'cái',
              unitPrice: this.toNumber(get('unitPrice')),
              origin: normalizeCountryCode(get('origin')),
              weight: this.toNumber(get('weight')) || undefined,
            });
          }
        }
      }
    });

    return this.assemble(fields, journeys, materials);
  }

  private findTableHeader<T extends string>(grid: string[][], detect: (row: string[]) => Record<number, T> | null): { headerRow: number; colMap: Record<number, T> } | null {
    for (let rr = 1; rr < grid.length; rr++) {
      const row = grid[rr] || [];
      const map = detect(row);
      if (map) return { headerRow: rr, colMap: map };
    }
    return null;
  }

  private colOf<T extends string>(colMap: Record<number, T>, key: T): number {
    const found = Object.keys(colMap).find((c) => colMap[+c] === key);
    return found ? +found : 0;
  }

  // ==================== ĐỌC PDF (theo nhãn, best-effort) ====================

  /**
   * Dựng lại nội dung PDF thành lưới ô, giữ ranh giới giữa các cột.
   *
   * Text mặc định của pdf-parse nối thẳng các ô liền nhau ("18471.30Máy tính
   * xách tay10cái850") vì trong PDF không có khái niệm "cột" - chỉ có các mẩu
   * chữ đặt tại toạ độ. Ở đây gom các mẩu chữ theo dòng (toạ độ y) rồi cắt thành
   * ô ở những chỗ có khoảng trống ngang. Toạ độ x của từng ô được giữ lại vì đó
   * là căn cứ duy nhất để biết một dòng không có nhãn là phần ngắt dòng của ô nào.
   */
  private async pdfRows(buffer: Buffer): Promise<PdfCell[][]> {
    /** Khoảng hở ngang (pt) đủ lớn để coi là ranh giới giữa hai ô. */
    const COLUMN_GAP = 3;
    /** Sai số dọc (pt) khi gom các mẩu chữ về cùng một dòng. */
    const ROW_TOLERANCE = 2;

    const rows: { page: number; y: number; items: { x: number; width: number; str: string }[] }[] = [];

    // Toạ độ y được đánh lại từ đầu ở mỗi trang, nên phải gom theo TỪNG TRANG.
    // Gộp chung cả tài liệu thì dòng cuối trang 1 và dòng cuối trang 2 có cùng y sẽ
    // bị nhập vào một dòng, cho ra những chuỗi lặp đôi kiểu "Trang Trang 1/22/2" -
    // và với tờ khai dài hơn một trang thì cả bảng vật tư bị trộn lẫn.
    let pageIndex = 0;

    const renderPage = (pageData: any) => {
      const page = pageIndex++;
      return pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).then((content: any) => {
        for (const item of content.items) {
          if (!item.str) continue;
          const x = item.transform[4];
          const y = item.transform[5];
          const row = rows.find((r) => r.page === page && Math.abs(r.y - y) <= ROW_TOLERANCE);
          if (row) row.items.push({ x, width: item.width || 0, str: item.str });
          else rows.push({ page, y, items: [{ x, width: item.width || 0, str: item.str }] });
        }
        return '';
      });
    };

    await pdfParse(buffer, { pagerender: renderPage });

    // Trang trước lên trước; trong mỗi trang, PDF đánh y từ dưới lên nên phải đảo
    // lại mới ra thứ tự đọc của con người.
    rows.sort((a, b) => a.page - b.page || b.y - a.y);

    return rows
      .map((row) => {
        row.items.sort((a, b) => a.x - b.x);
        const cells: PdfCell[] = [];
        let cursor = -Infinity;
        for (const item of row.items) {
          if (cells.length === 0 || item.x - cursor > COLUMN_GAP) cells.push({ x: item.x, text: item.str });
          else cells[cells.length - 1].text += item.str;
          cursor = item.x + item.width;
        }
        return cells.map((cell) => ({ x: cell.x, text: cell.text.trim() })).filter((cell) => cell.text.length > 0);
      })
      .filter((cells) => cells.length > 0);
  }

  /** Bản text thuần của từng dòng, dùng cho phần dò bảng theo biểu thức chính quy. */
  private rowsToLines(rows: PdfCell[][]): string[] {
    return rows.map((cells) => cells.map((cell) => cell.text).join('\t'));
  }

  /**
   * Tách "Nhãn: giá trị" khi cả hai dính liền trong một mẩu chữ.
   * Xảy ra khi ô nhãn và ô giá trị sát nhau đến mức không còn khoảng hở để nhận
   * ra ranh giới cột.
   */
  private splitLabelValue(text: string): { key: CustomsFieldKey; value: string } | null {
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const f of CUSTOMS_FIELDS) {
      const m = text.match(new RegExp('^\\s*' + escape(f.label) + '\\s*[:\\-]?\\s*(.+)$', 'i'));
      if (m && m[1] && !matchField(m[1])) return { key: f.key, value: m[1].trim() };
    }
    return null;
  }

  async parsePdf(buffer: Buffer): Promise<ParsedForm> {
    const rows = await this.pdfRows(buffer);
    const lines = this.rowsToLines(rows);

    const fields: Partial<Record<CustomsFieldKey, string>> = {};

    // Phần trường chỉ nằm phía trên các bảng. Dừng lại ở dòng tiêu đề bảng đầu
    // tiên để cột "Mô tả hàng hoá" không bị hiểu thành phần nối tiếp của một ô
    // giá trị trùng toạ độ ngang.
    const isTableHeader = (cells: PdfCell[]) =>
      cells.filter((cell) => matchMaterialColumn(cell.text) || matchJourneyColumn(cell.text)).length >= 2;
    const tablesStart = rows.findIndex(isTableHeader);
    const fieldRows = tablesStart >= 0 ? rows.slice(0, tablesStart) : rows;

    /**
     * Ô giá trị gần nhất tại mỗi vị trí ngang, để nối lại phần bị ngắt dòng.
     *
     * Tên công ty dài hơn bề rộng ô sẽ được PDF ngắt xuống dòng dưới, mà dòng đó
     * không còn nhãn nào đi kèm. Nếu chỉ đọc dòng có nhãn thì "Công ty TNHH
     * Thương mại ABC Việt Nam" bị cắt cụt thành "Công ty TNHH Thương mại ABC".
     */
    const anchors = new Map<number, CustomsFieldKey>();
    /** Sai số ngang (pt) khi coi hai ô là cùng một cột. */
    const X_TOLERANCE = 4;
    const anchorAt = (x: number) => [...anchors.keys()].find((ax) => Math.abs(ax - x) <= X_TOLERANCE);

    // Khối "Bên xuất khẩu" và "Bên nhập khẩu" nằm cạnh nhau trên bản PDF, nên
    // một dòng có thể chứa hai cặp nhãn - giá trị. Vì vậy phải duyệt theo từng
    // mẩu chữ trong dòng, không thể lấy toàn bộ phần đuôi làm giá trị.
    for (const cells of fieldRows) {
      const assigned = new Set<number>();

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        let key = matchField(cell.text);
        let value = '';
        let valueX = cell.x;

        if (key) {
          const next = cells[i + 1];
          if (next && !matchField(next.text)) {
            value = next.text;
            valueX = next.x;
            i++;
          }
        } else {
          const pair = this.splitLabelValue(cell.text);
          if (pair) ({ key, value } = pair);
        }

        if (key) {
          if (value && fields[key] == null && !isPlaceholderText(value)) fields[key] = value;
          // Dù giá trị rỗng vẫn phải neo: ô trống trên bản mẫu cũng có thể được
          // điền bằng nhiều dòng ở các dòng tiếp theo.
          const existing = anchorAt(valueX);
          anchors.set(existing ?? valueX, key);
          assigned.add(existing ?? valueX);
          continue;
        }

        // Không phải nhãn, cũng không phải giá trị vừa gán -> phần ngắt dòng của
        // ô phía trên cùng cột.
        const ax = anchorAt(cell.x);
        if (ax == null || assigned.has(ax)) continue;
        const owner = anchors.get(ax)!;
        if (fields[owner] && !isPlaceholderText(cell.text)) fields[owner] += ` ${cell.text}`;
      }
    }

    // Bảng hành trình và bảng vật tư: nhận diện dòng tiêu đề bằng cách khớp TỪNG Ô
    // với danh mục cột, giống hệt đường đọc Excel.
    //
    // Cách cũ dò bằng biểu thức chính quy trên cả dòng (`/\bSTT\b/`), nên chỉ cần
    // PDF ngắt nhãn "STT" thành "ST" + "T" ở dòng dưới là không tìm thấy tiêu đề và
    // toàn bộ bảng vật tư bị bỏ trắng - đúng lỗi "vật tư chả in cái gì cả".
    /** Khối tổng kết và khu vực chữ ký - mọi bảng đều kết thúc trước những dòng này. */
    const isAfterTables = (cells: PdfCell[]) =>
      /(tổng|tong)\s|người khai|nguoi khai|xác nhận|xac nhan|ký, ghi rõ/i.test(cells.map((c) => c.text).join(' '));

    const journeys = this.readPdfTable(rows, {
      match: matchJourneyColumn,
      required: ['origin', 'destination'],
      indexColumn: 'legNumber',
      // Bảng vật tư nằm ngay dưới bảng hành trình và cũng có cột "STT", nên nếu
      // không dừng ở đây thì các dòng hàng hoá bị đọc thành chặng vận chuyển.
      stopAt: (cells) => isAfterTables(cells) || cells.filter((c) => matchMaterialColumn(c.text)).length >= 2,
      build: (get, index) => {
        const origin = get('origin');
        const destination = get('destination');
        if (!origin || !destination) return null;
        return {
          legNumber: this.toNumber(get('legNumber')) || index + 1,
          transportType: normalizeTransport(get('transportType')) || 'ROAD',
          origin,
          destination,
        } as ParsedJourney;
      },
    });

    const materials = this.readPdfTable(rows, {
      match: matchMaterialColumn,
      required: ['description'],
      indexColumn: 'itemNo',
      stopAt: isAfterTables,
      build: (get, index) => {
        const description = get('description');
        // Dòng tổng kết ("Tổng giá trị hàng: 13.900 USD") cũng có hai ô, nên phải
        // loại những dòng mà cột mô tả chỉ chứa số.
        if (!description || /^[\d.,\s]+$/.test(description)) return null;
        return {
          itemNo: this.toNumber(get('itemNo')) || index + 1,
          hsCode: normalizeHsCode(get('hsCode')) || undefined,
          description,
          quantity: this.toNumber(get('quantity')),
          unit: get('unit') || 'cái',
          unitPrice: this.toNumber(get('unitPrice')),
          origin: normalizeCountryCode(get('origin')),
          weight: this.toNumber(get('weight')) || undefined,
        } as ParsedMaterial;
      },
    });

    return this.assemble(fields, journeys, materials);
  }

  /**
   * Đọc một bảng trong PDF: tìm dòng tiêu đề rồi lấy các dòng dữ liệu bên dưới.
   *
   * Dòng tiêu đề được nhận ra bằng cách khớp TỪNG Ô với danh mục cột (giống đường
   * đọc Excel), rồi thứ tự các cột đọc được từ chính dòng tiêu đề đó dùng để gán ô
   * dữ liệu ở các dòng dưới. Không thể gán theo toạ độ ngang: nhãn tiêu đề được
   * canh giữa còn dữ liệu canh trái, nên hai mốc x lệch nhau cả chục điểm.
   */
  private readPdfTable<K extends string, T>(
    rows: PdfCell[][],
    options: {
      match: (label: unknown) => K | undefined;
      required: K[];
      /** Cột số thứ tự - dùng để phân biệt dòng dữ liệu thật với dòng khác. */
      indexColumn: K;
      /** Dòng đánh dấu bảng đã kết thúc. */
      stopAt: (cells: PdfCell[]) => boolean;
      build: (get: (key: K) => string | undefined, index: number) => T | null;
    },
  ): T[] {
    /** Một dòng được coi là tiêu đề khi có ít nhất hai ô khớp danh mục cột. */
    const headerColumnsOf = (cells: PdfCell[]): K[] => {
      const keys: K[] = [];
      for (const cell of cells) {
        const key = options.match(cell.text);
        if (key && !keys.includes(key)) keys.push(key);
      }
      return keys;
    };

    for (let header = 0; header < rows.length; header++) {
      const columns = headerColumnsOf(rows[header]);
      if (columns.length < 2 || !options.required.every((key) => columns.includes(key))) continue;

      const indexPosition = columns.indexOf(options.indexColumn);

      // Gom dòng trước, dựng đối tượng sau: một dòng hàng hoá có thể trải trên nhiều
      // dòng chữ (mô tả dài bị ngắt), nên phải ghép xong mới biết giá trị đầy đủ.
      const collected: { values: (string | undefined)[]; anchors: PdfCell[] }[] = [];

      for (let r = header + 1; r < rows.length; r++) {
        const cells = rows[r];

        const indexText = indexPosition >= 0 ? cells[indexPosition]?.text : undefined;
        const isDataRow = indexPosition < 0 || /^\d+$/.test(String(indexText ?? '').trim());

        if (isDataRow) {
          collected.push({ values: columns.map((_, i) => cells[i]?.text), anchors: cells });
          continue;
        }

        // Hết bảng thật sự: khối tổng kết hoặc khu vực chữ ký (với bảng hành trình
        // thì thêm cả dòng tiêu đề của bảng vật tư ngay bên dưới).
        if (options.stopAt(cells)) break;

        // Tiêu đề được pdfmake lặp lại ở đầu mỗi trang: bỏ qua, đừng coi là hết bảng,
        // nếu không tờ khai dài hơn một trang chỉ đọc được phần nằm ở trang đầu.
        if (headerColumnsOf(cells).length >= 2) continue;

        const previous = collected[collected.length - 1];
        if (!previous) continue;

        // Dòng không có số thứ tự và không phải tiêu đề: phần bị ngắt dòng của ô phía
        // trên. Gán theo toạ độ ngang so với chính dòng dữ liệu trước đó (ô dữ liệu
        // với ô dữ liệu thì mới cùng cách canh lề).
        //
        // Không khớp toạ độ nào thì đây là dòng trang trí - chân trang, số trang - nên
        // bỏ qua chứ KHÔNG dừng: chân trang của trang 1 nằm ngay giữa bảng.
        const isContinuation = cells.every((cell) =>
          previous.anchors.some((anchor) => Math.abs(anchor.x - cell.x) <= CONTINUATION_X_TOLERANCE),
        );
        if (!isContinuation) continue;

        for (const cell of cells) {
          let nearest = 0;
          for (let i = 1; i < previous.anchors.length; i++) {
            if (Math.abs(previous.anchors[i].x - cell.x) < Math.abs(previous.anchors[nearest].x - cell.x)) nearest = i;
          }
          if (nearest < previous.values.length) {
            previous.values[nearest] = `${previous.values[nearest] ?? ''} ${cell.text}`.trim();
          }
        }
      }

      const result: T[] = [];
      for (const row of collected) {
        const item = options.build((key) => {
          const position = columns.indexOf(key);
          return position >= 0 ? row.values[position] : undefined;
        }, result.length);
        if (item) result.push(item);
      }
      if (result.length > 0) return result;
    }
    return [];
  }

  // ==================== Chat AI ====================

  async chat(message: string, userId?: string): Promise<string> {
    if (!this.openai) {
      return 'Trợ lý AI hiện chưa được cấu hình. Vui lòng đặt AI_BASE_URL/AI_MODEL (ví dụ Ollama) hoặc API key trong file .env để bật tính năng này.';
    }

    // Chỉ lấy lịch sử của phiên trò chuyện đang diễn ra. Hội thoại từ hôm trước
    // không còn là ngữ cảnh hữu ích, nhưng vẫn đủ sức kéo model nhỏ quay lại chủ
    // đề cũ và trả lời lạc hẳn câu vừa hỏi.
    const historyCutoff = new Date(Date.now() - CHAT_SESSION_WINDOW_MS);
    const history = userId
      ? await this.prisma.chatMessage.findMany({
          where: { userId, createdAt: { gte: historyCutoff } },
          orderBy: { createdAt: 'desc' },
          take: CHAT_HISTORY_LIMIT,
        })
      : [];

    const messages: any[] = [
      {
        role: 'system',
        content: `Bạn là trợ lý AI tích hợp trong phần mềm quản lý hải quan Việt Nam.

Bạn trả lời được MỌI chủ đề người dùng hỏi. Thế mạnh chuyên sâu của bạn là nghiệp
vụ xuất nhập khẩu: tờ khai hải quan, mã HS, thuế VAT, chứng từ (hoá đơn, vận đơn,
C/O), Incoterms, thủ tục thông quan, và cách sử dụng chính phần mềm này.

QUY TẮC TRẢ LỜI:
- Trả lời bằng tiếng Việt, rõ ràng, đi thẳng vào vấn đề. Câu hỏi đơn giản thì đáp
  ngắn gọn; câu phức tạp mới cần chia ý hoặc gạch đầu dòng.
- Chỉ trả lời câu hỏi mới nhất. Lịch sử bên dưới là ngữ cảnh tham khảo; người dùng
  đổi chủ đề thì bỏ qua hoàn toàn nội dung cũ, đừng nhắc lại câu trả lời trước.
- Thông tin có thể đã thay đổi theo thời gian (nhân sự, giá cả, quy định, thuế
  suất) thì nói rõ là kiến thức của bạn có thể không còn mới, và khuyên người dùng
  kiểm chứng lại từ nguồn chính thức.
- Không biết thì nói thẳng là không biết. Tuyệt đối không bịa số liệu, điều khoản
  hay tên văn bản pháp luật.`,
      },
      ...history.reverse().map((m) => ({ role: m.role, content: m.content })),
      // Nhắc lại ngay trước câu hỏi: model bám vào phần cuối ngữ cảnh mạnh hơn
      // nhiều so với system prompt nằm tít trên đầu, nên chỉ đặt luật ở trên thì
      // sau vài lượt trao đổi nó sẽ trôi mất và model quay ra trả lời chủ đề cũ.
      {
        role: 'system',
        content: 'Chỉ trả lời đúng câu hỏi ngay dưới đây, không nhắc lại nội dung của các lượt trước.',
      },
      { role: 'user', content: message },
    ];

    let reply: string;
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: 600,
        temperature: 0.3,
      });
      reply = response.choices[0]?.message?.content?.trim() || 'Xin lỗi, tôi chưa có câu trả lời phù hợp.';
    } catch (err: any) {
      // Phân biệt rõ các nguyên nhân: người dùng cần biết phải mở Ollama lên hay
      // chỉ cần hỏi lại, thay vì nhận chung một câu "có lỗi xảy ra".
      const detail = String(err?.message || '');
      const isTimeout = /timeout|aborted|ETIMEDOUT/i.test(detail);
      const isOffline = /ECONNREFUSED|fetch failed|ENOTFOUND|socket hang up/i.test(detail);

      if (isOffline) {
        throw new ServiceUnavailableException(
          'Chưa kết nối được tới Ollama. Hãy kiểm tra Ollama đã chạy trên máy chưa (mở ứng dụng Ollama hoặc chạy lệnh "ollama serve").',
        );
      }
      if (isTimeout) {
        throw new ServiceUnavailableException(
          'Trợ lý AI phản hồi quá lâu. Lần hỏi đầu tiên cần nạp mô hình vào bộ nhớ nên có thể mất tới một phút — vui lòng thử lại.',
        );
      }
      throw new ServiceUnavailableException(`Không gọi được trợ lý AI (${this.model}). Chi tiết: ${detail || 'lỗi không xác định'}`);
    }

    if (userId) {
      await this.prisma.chatMessage.createMany({
        data: [
          { userId, role: 'user', content: message },
          { userId, role: 'assistant', content: reply },
        ],
      });
    }

    return reply;
  }
}
