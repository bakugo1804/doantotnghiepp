import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import {
  CustomsFieldKey,
  CUSTOMS_FIELDS,
  IDENTITY_SECTION,
  matchField,
  matchMaterialColumn,
  matchJourneyColumn,
  MATERIAL_COLUMNS,
  JOURNEY_COLUMNS,
  MaterialFieldKey,
  JourneyFieldKey,
  isPlaceholderText,
  normalizeLabel,
  normalizeTransport,
  TRANSPORT_CHOICES,
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

/** Câu yêu cầu gửi kèm ảnh, dùng chung cho mọi lượt đọc ảnh. */
const VISION_INSTRUCTION = 'Đọc ảnh và trả về đúng một đối tượng JSON theo cấu trúc đã cho.';

/**
 * Lượt hỏi bổ sung chỉ dành cho ô "Số tờ khai".
 *
 * Ô này nằm lẻ ở góc trên phải, không thuộc khối nào, nên trong một câu hỏi gộp mô
 * hình hay bỏ qua nó. Hỏi riêng bằng một câu ngắn thì đọc đúng.
 */
const VISION_DECLARATION_NO_PROMPT = `Bạn đọc chữ viết tay trên ảnh chụp tờ khai hải quan Việt Nam.

Chỉ đọc DUY NHẤT ô có nhãn "Số tờ khai" nằm ở góc trên bên phải tờ khai, ngay dưới
dòng "Mẫu số". Bỏ qua tất cả phần còn lại.

Trả về đúng một đối tượng JSON: { "declarationNo": "giá trị đọc được" }

- Ghi lại đúng chuỗi ký tự viết trong ô đó, giữ nguyên cả chữ và số.
- Ô đó trống thì trả về chuỗi rỗng "".`;

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

/**
 * Sai số ngang khi ghép phần bị ngắt dòng của NHÃN TIÊU ĐỀ.
 *
 * Rộng hơn hẳn ngưỡng của dòng dữ liệu vì nhãn tiêu đề được canh giữa ô: dòng thứ hai
 * của "Trọng lượng (kg)" lệch 16pt so với dòng đầu, còn dữ liệu canh trái thì thẳng
 * hàng. 40pt vẫn nhỏ hơn bề rộng một cột nên không ghép lẫn sang cột bên cạnh.
 */
const HEADER_CONTINUATION_X_TOLERANCE = 40;

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
  /**
   * Những ô mà hai lượt đọc độc lập cho ra hai kết quả khác nhau - tức là chỗ đáng
   * ngờ nhất, cần người dùng soi lại trước tiên. Đường dẫn theo dạng "containerNo"
   * hoặc "materials.0.unitPrice". Chỉ có khi đọc từ ảnh.
   */
  uncertain?: string[];
};

@Injectable()
export class AiService {
  private openai: OpenAI | null = null;
  private model: string;
  /** Mô hình đọc ảnh - khác mô hình trò chuyện vì phải hiểu được hình ảnh. */
  private visionModel: string;
  /**
   * Client riêng cho việc đọc ảnh.
   *
   * Tách khỏi client trò chuyện để hai việc chọn được hai nhà cung cấp khác nhau:
   * trò chuyện giữ ở mô hình cục bộ cho kín dữ liệu và không tốn phí, còn đọc chữ
   * viết tay có thể trỏ sang dịch vụ mạnh hơn nếu cần độ chính xác. Không cấu hình
   * gì thêm thì dùng chung client với phần trò chuyện.
   */
  private visionClient: OpenAI | null = null;
  /**
   * Ollama phải gọi qua API riêng của nó, không dùng được đường tương thích OpenAI.
   *
   * Lý do: đường /v1/chat/completions của Ollama không nhận tham số num_ctx, nên
   * cửa sổ ngữ cảnh bị kẹt ở mặc định 4096 token. Một ảnh chụp tờ khai đã chiếm
   * hơn 4000 token, cộng lời nhắc vào là vượt trần - máy chủ trả lỗi
   * "exceeds the available context size", hoặc tệ hơn là âm thầm cắt bớt ảnh và
   * mô hình đọc thiếu nửa tờ khai. Đường /api/chat cho đặt num_ctx nên không vướng.
   */
  private visionApiStyle: 'ollama' | 'openai' = 'openai';
  /** Địa chỉ gốc của Ollama (đã bỏ hậu tố /v1), chỉ dùng cho đường native. */
  private visionOllamaUrl = '';
  private visionNumCtx: number;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    // Hỗ trợ mọi nhà cung cấp tương thích OpenAI: OpenAI, Groq, Gemini, Ollama (local)...
    // Cấu hình qua .env: AI_BASE_URL, AI_MODEL, AI_API_KEY (hoặc OPENAI_API_KEY).
    const baseURL = config.get<string>('AI_BASE_URL')?.trim() || undefined;
    const rawKey = (config.get<string>('AI_API_KEY') || config.get<string>('OPENAI_API_KEY') || '').trim();
    this.model = config.get<string>('AI_MODEL')?.trim() || 'gpt-4o-mini';
    // Bản 7B chứ không phải 3B: đo trên cùng một ảnh tờ khai viết tay, bản 3B đọc
    // đúng chữ nhưng bỏ trắng gần hết các dãy số dài (số hoá đơn, số vận đơn, ngày),
    // tức là đúng phần dữ liệu quan trọng nhất của tờ khai.
    this.visionModel = config.get<string>('AI_VISION_MODEL')?.trim() || 'qwen2.5vl:7b';

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

    // Đọc ảnh có thể trỏ sang nhà cung cấp khác phần trò chuyện. Không khai báo
    // gì thì dùng chung client, tức là cùng chạy trên Ollama cục bộ.
    const visionBaseURL = config.get<string>('AI_VISION_BASE_URL')?.trim();
    const visionKey = (config.get<string>('AI_VISION_API_KEY') || '').trim();
    if (visionBaseURL) {
      this.visionClient = new OpenAI({
        apiKey: visionKey || rawKey || 'not-needed',
        baseURL: visionBaseURL,
        timeout: AI_TIMEOUT_MS,
        maxRetries: 1,
      });
      console.log(`🖼️  Đọc ảnh dùng nhà cung cấp riêng: ${visionBaseURL} (${this.visionModel})`);
    } else {
      this.visionClient = this.openai;
    }

    // Cửa sổ ngữ cảnh khi đọc ảnh. 8192 đủ cho một ảnh chụp cả tờ khai (~4800
    // token) cộng phần JSON trả về; đặt cao hơn chỉ tốn thêm bộ nhớ GPU.
    this.visionNumCtx = Number(config.get<string>('AI_VISION_NUM_CTX')) || 8192;

    // Nhận diện Ollama để chuyển sang API riêng của nó. Cho phép chỉ định thẳng
    // bằng AI_VISION_API_STYLE khi Ollama được đặt sau proxy ở cổng khác.
    const style = config.get<string>('AI_VISION_API_STYLE')?.trim().toLowerCase();
    const effectiveVisionUrl = visionBaseURL || baseURL || '';
    const looksLikeOllama = /:11434(\/|$)/.test(effectiveVisionUrl);
    if (style === 'ollama' || (style !== 'openai' && looksLikeOllama)) {
      this.visionApiStyle = 'ollama';
      this.visionOllamaUrl = effectiveVisionUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
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

  /**
   * Nhận ra đồng tiền từ chữ người dùng viết tay lên biểu mẫu.
   *
   * Trước đây chỉ so đúng chuỗi "VND", nên ghi "VNĐ", "đồng", "₫" hay "vnd " đều bị
   * hiểu thành USD một cách âm thầm - sai đồng tiền là sai toàn bộ số tiền trên tờ
   * khai. Ô trống thì mặc định USD như trước.
   */
  private normalizeCurrency(value: any): string {
    const raw = this.cellText(value);
    if (/[₫đ]/i.test(raw)) return 'VND';

    const text = normalizeLabel(raw); // bỏ dấu, chữ thường: "VNĐ" -> "vnd"
    if (!text) return 'USD';
    if (/\b(vnd|vn|dong|d)\b/.test(text) || text.includes('viet nam dong')) return 'VND';
    return 'USD';
  }

  private assemble(fields: Partial<Record<CustomsFieldKey, string>>, journeys: ParsedJourney[], materials: ParsedMaterial[]): ParsedForm {
    // Ô để trống trên bản mẫu ("………", "—", "-") không phải dữ liệu người dùng nhập.
    for (const k of Object.keys(fields) as CustomsFieldKey[]) {
      if (isPlaceholderText(fields[k])) delete fields[k];
    }
    const vat = fields.vatRate ? this.toNumber(fields.vatRate) : undefined;
    return {
      recordNo: fields.declarationNo || undefined,
      // Không đọc được ngày thì để TRỐNG, không lấy ngày hôm nay.
      //
      // Trước đây thiếu ngày là điền ngày hôm nay: biểu mẫu hiện ra với một ngày
      // trông hợp lý nên người dùng bấm lưu mà không để ý, và tờ khai mang sai mốc
      // thời gian vận chuyển. Ô trống thì bộ kiểm tra của biểu mẫu chặn lại và buộc
      // người dùng tự điền - sai sót lộ ra thay vì bị che đi.
      entryDate: this.parseDate(fields.entryDate) || '',
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
    /**
     * Khoá cột của TỪNG Ô trên dòng tiêu đề, giữ nguyên vị trí.
     *
     * Trả về mảng có đúng số phần tử bằng số ô, ô nào không nhận ra thì để undefined.
     * Không được dồn lại thành danh sách ngắn hơn: ô dữ liệu ở các dòng dưới được gán
     * theo VỊ TRÍ, nên một tiêu đề không nhận ra mà bị bỏ khỏi danh sách sẽ làm lệch
     * toàn bộ các cột phía sau nó - đã gặp thật, cột đơn giá đọc ra giá trị của cột bên
     * cạnh.
     */
    const headerKeysOf = (cells: PdfCell[]): (K | undefined)[] => cells.map((cell) => options.match(cell.text));
    const definedCount = (keys: (K | undefined)[]) => keys.filter(Boolean).length;

    /**
     * Ghép những dòng chữ là phần bị ngắt của chính dòng tiêu đề.
     *
     * Tiêu đề dài như "Đơn giá (ví dụ 5.000.000)" hay "Loại vận chuyển (hàng không /
     * biển / sắt / bộ)" bị pdfmake ngắt xuống dòng thứ hai. Không ghép lại thì nhãn chỉ
     * còn một nửa ("Đơn giá (ví") và không khớp danh mục cột nào.
     */
    const mergeHeaderRows = (start: number): { texts: string[]; xs: number[]; consumed: number } => {
      const texts = rows[start].map((cell) => cell.text);
      const xs = rows[start].map((cell) => cell.x);
      let consumed = 1;

      for (let next = start + 1; next < rows.length; next++) {
        const cells = rows[next];
        if (cells.length === 0) break;
        // Dòng dữ liệu (bắt đầu bằng số thứ tự) thì tiêu đề đã hết.
        if (/^\d+$/.test(cells[0].text.trim())) break;
        // Phần bị ngắt luôn ít ô hơn dòng tiêu đề gốc.
        if (cells.length >= texts.length) break;

        // Mọi ô phải tìm được một cột đủ gần. Ngưỡng ở đây RỘNG hơn ngưỡng dùng cho
        // dòng dữ liệu: nhãn tiêu đề được canh giữa ô nên phần bị ngắt xuống dòng lệch
        // khá nhiều so với mốc x của dòng đầu - đo thực tế "(kg)" lệch 16pt, trong khi
        // ngưỡng của dòng dữ liệu chỉ 6pt vì dữ liệu canh trái nên thẳng hàng.
        const nearestOf = (cell: PdfCell) => {
          let nearest = 0;
          for (let i = 1; i < xs.length; i++) {
            if (Math.abs(xs[i] - cell.x) < Math.abs(xs[nearest] - cell.x)) nearest = i;
          }
          return Math.abs(xs[nearest] - cell.x) <= HEADER_CONTINUATION_X_TOLERANCE ? nearest : -1;
        };
        if (cells.some((cell) => nearestOf(cell) < 0)) break;

        for (const cell of cells) texts[nearestOf(cell)] = `${texts[nearestOf(cell)]} ${cell.text}`.trim();
        consumed++;
      }
      return { texts, xs, consumed };
    };

    for (let header = 0; header < rows.length; header++) {
      const merged = mergeHeaderRows(header);
      const columns = headerKeysOf(merged.texts.map((text, i) => ({ text, x: merged.xs[i] })));
      if (definedCount(columns) < 2 || !options.required.every((key) => columns.includes(key))) continue;

      const indexPosition = columns.indexOf(options.indexColumn);

      // Gom dòng trước, dựng đối tượng sau: một dòng hàng hoá có thể trải trên nhiều
      // dòng chữ (mô tả dài bị ngắt), nên phải ghép xong mới biết giá trị đầy đủ.
      const collected: { values: (string | undefined)[]; anchors: PdfCell[] }[] = [];

      // Bắt đầu sau TOÀN BỘ dòng tiêu đề, kể cả phần bị ngắt xuống dòng.
      for (let r = header + merged.consumed; r < rows.length; r++) {
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
        if (definedCount(headerKeysOf(cells)) >= 2) continue;

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

  // ==================== ĐỌC ẢNH (chụp biểu mẫu giấy) ====================

  /**
   * Đọc tờ khai từ ẢNH CHỤP bản giấy đã điền tay.
   *
   * Khác hẳn Excel và PDF: ảnh không có lớp văn bản nào để dò nhãn, nên phải nhờ
   * mô hình thị giác đọc chữ viết tay. Đổi lại, kết quả không bao giờ chắc chắn
   * như đọc tệp số, vì vậy dữ liệu luôn được đưa về biểu mẫu cho người dùng soát
   * lại chứ không lưu thẳng.
   *
   * Toàn bộ giá trị đọc được vẫn đi qua đúng bộ chuẩn hoá của hai đường kia
   * (mã quốc gia, mã HS, tiền tệ, ngày, ô để trống), nên ba đường nhập liệu cho ra
   * cùng một dạng dữ liệu.
   */
  async parseImage(buffer: Buffer, mimeType = 'image/jpeg'): Promise<ParsedForm> {
    if (!this.visionClient && this.visionApiStyle !== 'ollama') {
      throw new ServiceUnavailableException(
        'Chức năng đọc ảnh cần mô hình thị giác. Hãy đặt AI_BASE_URL và AI_VISION_MODEL trong .env (ví dụ Ollama) rồi thử lại.',
      );
    }

    const ask = async (parts: { system?: string; user: string }) => {
      try {
        const raw =
          this.visionApiStyle === 'ollama'
            ? await this.askOllamaVision(parts.system, parts.user, buffer)
            : await this.askOpenAiVision(parts.system, parts.user, buffer, mimeType);
        return this.extractJson(raw);
      } catch (err: any) {
        throw this.describeAiFailure(err, this.visionModel);
      }
    };

    /**
     * Hỏi thành NHIỀU CÂU NGẮN, mỗi câu một khối của biểu mẫu, chạy song song.
     *
     * Đây là kết luận đo được, không phải sở thích trình bày. Trên cùng ba ảnh mẫu:
     *
     *   phần đầu tờ khai   hỏi gộp 16 ô: 89,6%   chia theo khối: 91,7%
     *   hai bảng            hỏi gộp:      73%     chia hai câu:   93%
     *
     * Và những ô bị cách hỏi gộp đánh rơi hoàn toàn (hai ô ngày, số container, điểm
     * đi/điểm đến của mọi chặng) thì cách hỏi ngắn lại đọc ra. Mô hình KHÔNG phải
     * không nhìn thấy: hỏi thẳng "ô này ghi gì" là trả lời đúng ngay. Càng bắt trả về
     * nhiều thứ trong một lượt, mô hình quy mô nhỏ càng bỏ sót.
     *
     * Chi phí thấp hơn tưởng: mọi câu dùng CÙNG một ảnh nên phần mã hoá ảnh được dùng
     * lại giữa các lượt, bảy câu hỏi chỉ mất khoảng 20 giây.
     */
    const fieldQuestions = this.buildVisionFieldQuestions();
    const materialQuestion = this.buildMaterialQuestion();
    /**
     * Bảng hàng hoá được đọc HAI LẦN.
     *
     * Đây là nơi chứa tiền: một chữ số 0 bị đọc thiếu ở cột đơn giá là sai cả tờ khai
     * (đã gặp 5.000.000 bị đọc thành 500.000). Hai lượt đọc độc lập không sửa được lỗi,
     * nhưng chỗ nào hai lượt không đồng ý thì gần như chắc chắn là chỗ đáng ngờ - và
     * chỉ ra đúng vài ô cần soi lại thì hữu ích hơn nhiều so với bảo người dùng kiểm
     * tra lại cả tờ khai.
     */
    const questions = [...fieldQuestions, this.buildJourneyQuestion(), materialQuestion, materialQuestion];
    const answers = await Promise.all(questions.map((question) => ask({ user: question })));
    const parts = answers.filter(Boolean);
    if (parts.length === 0) {
      throw new ServiceUnavailableException(
        'Mô hình không trả về dữ liệu đọc được từ ảnh. Hãy chụp lại rõ hơn (đủ sáng, thẳng góc, thấy trọn tờ khai) rồi thử lại.',
      );
    }

    const secondMaterialRead = answers[answers.length - 1];
    // Bỏ lượt đọc thứ hai ra khỏi phần gộp: nó chỉ dùng để đối chiếu.
    const data: any = Object.assign({}, ...answers.slice(0, -1).filter(Boolean));
    const uncertain = this.compareMaterialReads(data?.materials, secondMaterialRead?.materials);

    /**
     * Lượt hỏi bù cho những ô vẫn còn trống.
     *
     * Mô hình đánh rơi ô một cách ngẫu nhiên chứ không phải vì không đọc được: cùng
     * một ảnh, lượt trên bỏ trắng hai ô ngày trong khi hỏi riêng thì đọc đúng ngay.
     *
     * Câu hỏi bù đặt ở lượt NGƯỜI DÙNG, ngắn, không kèm lời nhắc hệ thống. Đây không
     * phải chuyện hình thức: thử đúng nội dung ấy dưới dạng lời nhắc hệ thống kèm các
     * luật "tuyệt đối không suy diễn / ô trắng thì để rỗng" thì mô hình trả rỗng hết,
     * còn hỏi thẳng thì đọc ra giá trị. Bộ luật nghiêm ngặt cần cho lượt đọc cả trang
     * lại làm mô hình ngả về "không chắc thì bỏ" ở lượt soi lại từng ô.
     *
     * Vẫn giữ một câu nhắc ô trắng để rỗng, và đã kiểm chứng trên hai ảnh mẫu: hai ô
     * "Thuế suất VAT" và "Ghi chú" thật sự trắng thì lượt này trả về rỗng, không bịa.
     */
    const missing = CUSTOMS_FIELDS.filter((field) => isPlaceholderText(data[field.key]));
    if (missing.length > 0) {
      const extra = await ask({ user: this.buildVisionGapQuestion(missing) });
      for (const field of missing) {
        const value = String(extra?.[field.key] ?? '').trim();
        if (value && !isPlaceholderText(value)) data[field.key] = value;
      }
    }

    /**
     * Loại vận chuyển: hỏi lại dưới dạng CHỌN MỘT trong bốn.
     *
     * Đây là ô duy nhất trên tờ khai chỉ có bốn giá trị hợp lệ, nên thay vì để mô
     * hình viết tự do rồi đi dò từ khoá, hỏi thẳng "ô này là cái nào trong bốn cái
     * sau". Đo trên ba ảnh mẫu: lượt đọc bảng trả về những chuỗi như "Đường Vận tải"
     * cho 3 trong 4 chặng, và trước đây mọi chuỗi không nhận ra đều bị mặc định thành
     * đường bộ - một lô đi máy bay bị tính phí đường bộ, sai gấp hơn ba lần.
     */
    const rawJourneys: any[] = Array.isArray(data.journeys) ? data.journeys : [];
    const unresolved = rawJourneys.filter((leg) => !normalizeTransport(leg?.transportType));
    if (rawJourneys.length > 0 && unresolved.length > 0) {
      const answer = await ask({ user: this.buildTransportQuestion(rawJourneys.length) });
      const picked: any[] = Array.isArray(answer?.legs) ? answer.legs : [];
      rawJourneys.forEach((leg, index) => {
        if (normalizeTransport(leg?.transportType)) return;
        const resolved = normalizeTransport(this.textOfAnswer(picked[index]));
        // Vẫn không ra thì để TRỐNG, không đoán: biểu mẫu sẽ buộc người dùng tự chọn.
        leg.transportType = resolved ?? '';
      });
    }

    const form = this.assembleFromVision(data);
    if (uncertain.length > 0) form.uncertain = uncertain;
    return form;
  }

  /**
   * Gọi Ollama qua API riêng của nó để đặt được num_ctx (xem ghi chú ở visionApiStyle).
   *
   * Dùng fetch thẳng thay vì thư viện openai: đây là dạng yêu cầu mà thư viện đó
   * không mô tả được (ảnh nằm ở trường "images" riêng, không phải data URL).
   */
  private async askOllamaVision(system: string | undefined, instruction: string, buffer: Buffer): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.visionOllamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.visionModel,
          stream: false,
          // Buộc mô hình trả về JSON hợp lệ, khỏi phải gỡ rào ```json hay câu dẫn.
          format: 'json',
          options: {
            num_ctx: this.visionNumCtx,
            // Nhiệt độ 0: đây là việc trích xuất dữ liệu, không phải viết văn -
            // cần đọc đúng chữ trên giấy chứ không cần sáng tạo.
            temperature: 0,
            num_predict: 1600,
          },
          messages: [
            // Lượt hỏi bù cố ý KHÔNG có lời nhắc hệ thống - xem ghi chú ở parseImage.
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: instruction, images: [buffer.toString('base64')] },
          ],
        }),
      });

      const body: any = await response.json().catch(() => null);
      if (!response.ok || body?.error) {
        throw new Error(String(body?.error || `Ollama trả về mã ${response.status}`));
      }
      return String(body?.message?.content ?? '').trim();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Gọi nhà cung cấp tương thích OpenAI (ảnh gửi dưới dạng data URL). */
  private async askOpenAiVision(system: string | undefined, instruction: string, buffer: Buffer, mimeType: string): Promise<string> {
    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
    const response = await this.visionClient!.chat.completions.create({
      model: this.visionModel,
      temperature: 0,
      max_tokens: 1600,
      response_format: { type: 'json_object' },
      messages: [
        ...(system ? [{ role: 'system' as const, content: system }] : []),
        {
          role: 'user',
          content: [
            { type: 'text', text: instruction },
            { type: 'image_url', image_url: { url: dataUrl } },
          ] as any,
        },
      ],
    });
    return response.choices[0]?.message?.content?.trim() || '';
  }

  /**
   * Các câu hỏi đọc PHẦN TRÊN tờ khai - chia theo từng khối của biểu mẫu.
   *
   * Vì sao chia nhỏ thay vì một lời nhắc liệt kê cả 16 ô: đo trên ba ảnh mẫu, hỏi gộp
   * đạt 89,6% còn chia theo khối đạt 91,7%, và quan trọng hơn là những ô bị hỏi gộp
   * đánh rơi hoàn toàn (hai ô ngày, số container) thì hỏi theo khối lại đọc ra. Câu
   * hỏi ngắn thì mô hình soi đúng vùng cần đọc thay vì phải quét cả trang một lượt.
   *
   * Các câu chạy song song nên tổng thời gian gần như không tăng: ảnh giống nhau ở mọi
   * câu nên phần mã hoá ảnh được dùng lại giữa các lượt.
   *
   * Danh sách ô sinh từ CUSTOMS_FIELDS theo `section`, nên thêm một trường vào biểu
   * mẫu là nó tự vào đúng câu hỏi của khối đó.
   */
  private buildVisionFieldQuestions(): string[] {
    const bySection = new Map<string, typeof CUSTOMS_FIELDS>();
    for (const field of CUSTOMS_FIELDS) {
      // Tiền tệ tách riêng thành câu hỏi chọn một, xem buildCurrencyQuestion.
      if (field.key === 'currency') continue;
      const list = bySection.get(field.section) ?? [];
      list.push(field);
      bySection.set(field.section, list);
    }

    /** Gộp các khối lại thành từng câu hỏi, kèm lời nhắc riêng cho từng nhóm. */
    const groups: { sections: string[]; extra?: string }[] = [
      {
        sections: [IDENTITY_SECTION, 'Thông tin chung'],
        extra:
          'Ngày trên tờ khai viết theo thứ tự NGÀY/THÁNG/NĂM của Việt Nam, ví dụ "3/9/2026"\n' +
          'là ngày 3 tháng 9 năm 2026. Giữ nguyên đúng như trên giấy, không đổi thứ tự.',
      },
      { sections: ['Bên xuất khẩu', 'Bên nhập khẩu'] },
      {
        sections: ['Chứng từ'],
        extra: 'Đây là các dãy chữ và số dài. Đọc từng ký tự một, ghi liền không dấu cách.',
      },
      { sections: ['Tài chính'] },
    ];

    const questions = groups
      .map((group) => {
        const fields = group.sections.flatMap((section) => bySection.get(section) ?? []);
        if (fields.length === 0) return '';
        const lines = fields
          .map((field) => `- "${field.key}": ô "${field.label}" — ${this.describeFieldPosition(field)}`)
          .join('\n');
        return `Đây là ảnh chụp một tờ khai hải quan đã điền tay. Đọc giúp giá trị viết trong ${fields.length} ô sau:
${lines}

Trả về đúng một đối tượng JSON với các khoá trên. Ô nào trên giấy để trắng thì giá trị là "".${
          group.extra ? `\n${group.extra}` : ''
        }`;
      })
      .filter(Boolean);

    return [...questions, this.buildCurrencyQuestion()];
  }

  /** Mô tả vị trí của một ô để mô hình khỏi phải quét cả trang. */
  private describeFieldPosition(field: (typeof CUSTOMS_FIELDS)[number]): string {
    if (field.key === 'declarationNo') return 'ô riêng ở góc trên bên phải, ngay dưới dòng "Mẫu số"';
    const inSection = CUSTOMS_FIELDS.filter((f) => f.section === field.section);
    const row = inSection.findIndex((f) => f.key === field.key) + 1;
    return `khối ${field.section.toUpperCase()}, dòng ${row}`;
  }

  /**
   * Ô "Tiền tệ" chỉ có hai giá trị hợp lệ, nên hỏi dạng CHỌN MỘT.
   *
   * Đo trên ba ảnh mẫu: hỏi chung cùng hai ô trống bên cạnh (thuế suất, ghi chú) thì
   * mô hình trả rỗng cả ba, 0/3 lần đọc được; hỏi riêng "USD hay VND" thì 3/3 đúng.
   * Đọc sai ô này là sai toàn bộ số tiền của tờ khai, nên nó xứng đáng một lượt riêng.
   */
  private buildCurrencyQuestion(): string {
    return `Đây là ảnh chụp một tờ khai hải quan đã điền tay. Xem khối "TÀI CHÍNH", dòng "Tiền tệ".

Trong ô đó người khai đã viết đơn vị tiền nào? Chỉ có hai khả năng:
- USD (đô la Mỹ) — cũng có thể viết "usd", "đô", "$"
- VND (đồng Việt Nam) — cũng có thể viết "vnd", "vnđ", "đồng", "₫"

Trả về đúng một đối tượng JSON: { "currency": "USD" } hoặc { "currency": "VND" }.
Nếu ô đó thật sự để trắng thì trả { "currency": "" }.`;
  }

  /**
   * Câu hỏi bù, chỉ liệt kê những ô lượt trước để trống, kèm vị trí của từng ô để
   * mô hình khỏi phải dò lại cả trang.
   */
  private buildVisionGapQuestion(missing: typeof CUSTOMS_FIELDS): string {
    const lines = missing
      .map((field) => {
        const where =
          field.key === 'declarationNo'
            ? 'ô riêng ở góc trên bên phải, ngay dưới dòng "Mẫu số"'
            : `thuộc khối ${field.section.toUpperCase()}`;
        return `- "${field.key}": ô "${field.label}" — ${where}`;
      })
      .join('\n');

    return `Đây là ảnh chụp một tờ khai hải quan đã điền tay. Đọc giúp giá trị viết trong ${
      missing.length > 1 ? `${missing.length} ô sau` : 'ô sau'
    }:
${lines}

Trả về đúng một đối tượng JSON với các khoá trên. Ngày giữ nguyên như trên giấy, ví dụ
"11/8/2026". Ô nào trên giấy để trắng thì giá trị là "".`;
  }

  /**
   * Câu hỏi chọn một cho cột "Loại vận chuyển" của bảng hành trình.
   *
   * Cố ý không kèm lời nhắc hệ thống và không nhắc luật "không suy diễn" - xem ghi
   * chú ở parseImage về việc bộ luật nghiêm ngặt làm mô hình ngả về bỏ trống.
   */
  private buildTransportQuestion(legCount: number): string {
    return `Đây là ảnh chụp một tờ khai hải quan đã điền tay. Xem bảng "HÀNH TRÌNH VẬN CHUYỂN",
cột "Loại vận chuyển", ${legCount} dòng đầu tiên có chữ viết.

Với mỗi dòng, chọn MỘT trong bốn phương thức sau, dựa vào chữ viết trong ô:
${TRANSPORT_CHOICES.map((choice) => `- ${choice.label}`).join('\n')}

Lưu ý cách viết tay hay gặp: "đường bay", "máy bay", "hàng không" đều là Đường hàng
không; "đường sắt", "tàu hoả", "tàu lửa" là Đường sắt; "đường biển", "tàu biển" là
Đường biển; "đường bộ", "xe tải", "ô tô" là Đường bộ. Ba chữ "đường sắt", "đường bộ",
"đường biển" chỉ khác nhau ở từ cuối nên đọc kỹ từ đó.

Trả về đúng một đối tượng JSON: { "legs": ["...", "..."] } - mảng ${legCount} phần tử,
mỗi phần tử là nhãn đầy đủ của phương thức đã chọn cho dòng tương ứng.`;
  }

  /**
   * Câu hỏi đọc bảng HÀNH TRÌNH VẬN CHUYỂN.
   *
   * Tách khỏi bảng hàng hoá: hỏi cả hai bảng trong một lượt thì mô hình đọc được loại
   * vận chuyển nhưng bỏ trắng điểm đi và điểm đến của MỌI chặng (đo trên cả ba ảnh
   * mẫu). Tách ra thì đọc đủ ba ô của từng chặng.
   *
   * Không liệt kê danh sách bốn phương thức ở đây - thêm danh sách vào làm điểm số tụt
   * từ 83% xuống 73%. Việc quy chữ viết về một trong bốn phương thức để dành cho lượt
   * hỏi chọn một riêng (buildTransportQuestion), chỉ chạy khi cần.
   */
  private buildJourneyQuestion(): string {
    const cols = JOURNEY_COLUMNS.filter((c) => c.key !== 'legNumber')
      .map((c) => `"${c.key}"`)
      .join(', ');

    return `Đây là ảnh chụp một tờ khai hải quan đã điền tay. Xem bảng "HÀNH TRÌNH VẬN CHUYỂN"
ở nửa dưới trang. Bảng có 6 dòng nhưng thường chỉ vài dòng đầu có chữ viết tay.

Với mỗi dòng CÓ chữ, đọc ba ô: "Loại vận chuyển", "Điểm đi", "Điểm đến".

Trả về đúng một đối tượng JSON: { "journeys": [ { ${cols} } ] }
Chỉ đưa vào những dòng có chữ, theo đúng thứ tự từ trên xuống.`;
  }

  /**
   * Câu hỏi đọc bảng DANH MỤC HÀNG HÓA / VẬT TƯ.
   *
   * Cột STT không hỏi: số thứ tự dòng được đánh lại theo trật tự đọc được (xem
   * assembleFromVision) nên câu trả lời bị bỏ đi, mà thêm nó vào lời nhắc thì đo được
   * là mô hình bắt đầu đánh rơi những ô khác.
   */
  private buildMaterialQuestion(): string {
    const cols = MATERIAL_COLUMNS.filter((c) => c.key !== 'itemNo')
      .map((c) => `"${c.key}": cột "${c.label}"`)
      .join(', ');

    return `Đây là ảnh chụp một tờ khai hải quan đã điền tay. Xem bảng "DANH MỤC HÀNG HÓA / VẬT TƯ"
ở cuối trang. Bảng có 6 dòng nhưng thường chỉ vài dòng đầu có chữ viết tay.

Với mỗi dòng CÓ chữ, đọc các ô: ${cols}

Trả về đúng một đối tượng JSON: { "materials": [ { ... } ] }
Chỉ đưa vào những dòng có chữ, theo đúng thứ tự từ trên xuống.

Riêng ba cột số:
- Trọng lượng có thể được viết kèm chữ "kg" - giữ nguyên cũng được.
- Đơn giá có thể được viết kèm dấu phân cách nghìn ("5.000.000") - GIỮ NGUYÊN cả dấu,
  đừng bỏ đi, vì dấu phân cách cho biết số đó có bao nhiêu chữ số.
- Số tiền viết liền không dấu thì đếm thật kỹ từng chữ số 0 trước khi trả lời.`;
  }

  /**
   * Đối chiếu hai lượt đọc bảng hàng hoá, trả về đường dẫn những ô không khớp.
   *
   * Chỉ so những cột mang số liệu tính tiền và định danh hàng: mô tả hàng hoá lệch một
   * chữ thì không đáng gọi là đáng ngờ, còn đơn giá lệch một chữ số thì có.
   */
  private compareMaterialReads(first: any, second: any): string[] {
    if (!Array.isArray(first) || !Array.isArray(second)) return [];
    const compared: MaterialFieldKey[] = ['hsCode', 'quantity', 'unitPrice', 'weight'];
    const flat = (value: any) => String(value ?? '').replace(/[\s.,]/g, '').toLowerCase();
    const paths: string[] = [];

    // Hai lượt đọc ra số dòng khác nhau thì bản thân việc đó đã đáng ngờ.
    if (first.length !== second.length) paths.push('materials');

    first.forEach((row: any, index: number) => {
      const other = second[index];
      if (!other) return;
      for (const key of compared) {
        if (flat(row?.[key]) !== flat(other?.[key])) paths.push(`materials.${index}.${key}`);
      }
    });
    return paths;
  }

  /**
   * Lấy phần chữ từ một phần tử trong câu trả lời của mô hình.
   *
   * Được hỏi "trả về mảng chuỗi" thì mô hình vẫn có lúc trả về mảng đối tượng
   * ({ "type": "Đường biển", ... }). Bắt cả hai dạng, vì nếu chỉ nhận chuỗi thì cả
   * lượt hỏi lại coi như mất trắng - đúng lỗi đã gặp: chặng đọc được nhưng vẫn ra rỗng.
   */
  private textOfAnswer(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      for (const key of ['transportType', 'type', 'label', 'value', 'name', 'loai']) {
        const candidate = (value as any)[key];
        if (typeof candidate === 'string' && candidate.trim()) return candidate;
      }
      const firstString = Object.values(value).find((v) => typeof v === 'string' && v.trim());
      return typeof firstString === 'string' ? firstString : '';
    }
    return String(value);
  }

  /** Lấy đối tượng JSON đầu tiên trong câu trả lời, kể cả khi bị bọc trong ```json. */
  private extractJson(text: string): any | null {
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  /** Đưa dữ liệu mô hình đọc được về đúng dạng ParsedForm như hai đường kia. */
  private assembleFromVision(data: any): ParsedForm {
    const fields: Partial<Record<CustomsFieldKey, string>> = {};
    for (const def of CUSTOMS_FIELDS) {
      const value = data?.[def.key];
      if (value == null) continue;
      const text = String(value).trim();
      if (text && !isPlaceholderText(text)) fields[def.key] = text;
    }

    const journeys: ParsedJourney[] = (Array.isArray(data?.journeys) ? data.journeys : [])
      .map((j: any, index: number) => ({
        legNumber: this.toNumber(j?.legNumber) || index + 1,
        // Không nhận ra thì để TRỐNG, tuyệt đối không mặc định về 'ROAD': lượt hỏi
        // lại phía trên đã cho mô hình cơ hội chọn một trong bốn, còn im lặng đổi
        // thành đường bộ là ghi sai phương thức và tính sai phí vận chuyển.
        transportType: normalizeTransport(j?.transportType) ?? '',
        origin: String(j?.origin ?? '').trim(),
        destination: String(j?.destination ?? '').trim(),
      }))
      .filter((j: ParsedJourney) => !isPlaceholderText(j.origin) || !isPlaceholderText(j.destination));

    const materials: ParsedMaterial[] = (Array.isArray(data?.materials) ? data.materials : [])
      .map((m: any, index: number) => ({
        itemNo: this.toNumber(m?.itemNo) || index + 1,
        hsCode: normalizeHsCode(m?.hsCode) || undefined,
        description: String(m?.description ?? '').trim(),
        quantity: this.toNumber(m?.quantity),
        unit: String(m?.unit ?? '').trim() || 'cái',
        unitPrice: this.toNumber(m?.unitPrice),
        // Xuất xứ viết tay hay ở dạng tên nước ("T.Quốc", "Trung Quốc") nên phải
        // quy về mã ISO giống hai đường đọc tệp.
        origin: normalizeCountryCode(m?.origin),
        weight: this.toNumber(m?.weight) || undefined,
      }))
      .filter((m: ParsedMaterial) => m.description && !isPlaceholderText(m.description));

    const form = this.assemble(fields, journeys, materials);

    // Hai ô ngày nằm sát nhau trên giấy nên mô hình thị giác có lúc đọc đảo thứ tự.
    // Vận chuyển không thể kết thúc trước khi bắt đầu, nên gặp cặp ngược thì đổi lại
    // - còn hơn để người dùng nhận một cặp ngày vô nghĩa rồi tự đoán chỗ sai.
    if (form.exitDate && form.exitDate < form.entryDate) {
      const earlier = form.exitDate;
      form.exitDate = form.entryDate;
      form.entryDate = earlier;
    }
    return form;
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
      throw this.describeAiFailure(err, this.model);
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

  /**
   * Dịch lỗi gọi mô hình thành thông báo chỉ ra việc cần làm.
   *
   * Người dùng cần biết phải mở Ollama lên, phải tải mô hình về, hay chỉ cần thử
   * lại - một câu "có lỗi xảy ra" chung chung thì không giúp họ làm gì tiếp.
   */
  private describeAiFailure(err: any, model: string): ServiceUnavailableException {
    const detail = String(err?.message || '');

    if (/ECONNREFUSED|fetch failed|ENOTFOUND|socket hang up/i.test(detail)) {
      return new ServiceUnavailableException(
        'Chưa kết nối được tới Ollama. Hãy kiểm tra Ollama đã chạy trên máy chưa (mở ứng dụng Ollama hoặc chạy lệnh "ollama serve").',
      );
    }
    // Ollama trả 404 kèm "model not found" khi mô hình chưa được tải về máy.
    if (/not found|404|no such model|pull the model/i.test(detail)) {
      return new ServiceUnavailableException(
        `Chưa có mô hình "${model}" trên máy. Hãy chạy lệnh: ollama pull ${model}`,
      );
    }
    if (/timeout|aborted|ETIMEDOUT/i.test(detail)) {
      return new ServiceUnavailableException(
        'Mô hình phản hồi quá lâu. Lần gọi đầu tiên cần nạp mô hình vào bộ nhớ nên có thể mất tới một phút — vui lòng thử lại.',
      );
    }
    return new ServiceUnavailableException(`Không gọi được mô hình AI (${model}). Chi tiết: ${detail || 'lỗi không xác định'}`);
  }
}
