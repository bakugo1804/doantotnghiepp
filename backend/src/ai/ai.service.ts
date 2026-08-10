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
              hsCode: this.cellText(get('hsCode')) || undefined,
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
   * Dựng lại text của PDF, giữ ranh giới giữa các ô trong bảng.
   *
   * Text mặc định của pdf-parse nối thẳng các ô liền nhau ("18471.30Máy tính
   * xách tay10cái850") vì trong PDF không có khái niệm "cột" - chỉ có các mẩu
   * chữ đặt tại toạ độ. Ở đây gom các mẩu chữ theo dòng (toạ độ y) rồi chèn TAB
   * vào chỗ có khoảng trống ngang, nhờ vậy bảng mới tách được thành các cột.
   */
  private async pdfLines(buffer: Buffer): Promise<string[]> {
    /** Khoảng hở ngang (pt) đủ lớn để coi là ranh giới giữa hai ô. */
    const COLUMN_GAP = 3;
    /** Sai số dọc (pt) khi gom các mẩu chữ về cùng một dòng. */
    const ROW_TOLERANCE = 2;

    const rows: { y: number; items: { x: number; width: number; str: string }[] }[] = [];

    const renderPage = (pageData: any) =>
      pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).then((content: any) => {
        for (const item of content.items) {
          if (!item.str) continue;
          const x = item.transform[4];
          const y = item.transform[5];
          const row = rows.find((r) => Math.abs(r.y - y) <= ROW_TOLERANCE);
          if (row) row.items.push({ x, width: item.width || 0, str: item.str });
          else rows.push({ y, items: [{ x, width: item.width || 0, str: item.str }] });
        }
        return '';
      });

    await pdfParse(buffer, { pagerender: renderPage });

    // PDF đánh y từ dưới lên, nên phải đảo lại mới ra thứ tự đọc của con người.
    rows.sort((a, b) => b.y - a.y);

    return rows
      .map((row) => {
        row.items.sort((a, b) => a.x - b.x);
        let line = '';
        let cursor = -Infinity;
        for (const item of row.items) {
          if (line && item.x - cursor > COLUMN_GAP) line += '\t';
          line += item.str;
          cursor = item.x + item.width;
        }
        return line.trim();
      })
      .filter((line) => line.length > 0);
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
    const lines = await this.pdfLines(buffer);

    const fields: Partial<Record<CustomsFieldKey, string>> = {};

    // Khối "Bên xuất khẩu" và "Bên nhập khẩu" nằm cạnh nhau trên bản PDF, nên
    // một dòng có thể chứa hai cặp nhãn - giá trị. Vì vậy phải duyệt theo từng
    // mẩu chữ trong dòng, không thể lấy toàn bộ phần đuôi làm giá trị.
    for (const line of lines) {
      const tokens = line.split('\t').map((t) => t.trim()).filter(Boolean);
      for (let i = 0; i < tokens.length; i++) {
        let key = matchField(tokens[i]);
        let value = '';

        if (key) {
          const next = tokens[i + 1];
          if (next && !matchField(next)) {
            value = next;
            i++;
          }
        } else {
          const pair = this.splitLabelValue(tokens[i]);
          if (pair) ({ key, value } = pair);
        }

        if (key && value && fields[key] == null && !isPlaceholderText(value)) fields[key] = value;
      }
    }

    // Hành trình (best-effort): dòng sau header 'Chặng ... Điểm đi ... Điểm đến'
    const journeys: ParsedJourney[] = [];
    const jHeader = lines.findIndex((l) => /(chặng|chang)/i.test(l) && /(điểm đi|diem di)/i.test(l) && /(điểm đến|diem den)/i.test(l));
    if (jHeader >= 0) {
      for (let i = jHeader + 1; i < lines.length; i++) {
        const line = lines[i];
        if (/(mô tả|mo ta|hàng hóa|tổng|người khai)/i.test(line)) break;
        const cols = line.split(/\s{2,}|\t/).map((c) => c.trim()).filter(Boolean);
        if (cols.length < 3) continue;
        const [leg, transport, origin, destination] = cols.length >= 4 ? cols : [String(journeys.length + 1), ...cols];
        if (!origin || !destination) continue;
        journeys.push({
          legNumber: this.toNumber(leg) || journeys.length + 1,
          transportType: normalizeTransport(transport) || 'ROAD',
          origin,
          destination,
        });
      }
    }

    // Vật tư (best-effort)
    const materials: ParsedMaterial[] = [];
    const headerIdx = lines.findIndex((l) => /\bSTT\b/i.test(l) && /(mô tả|mo ta)/i.test(l));
    if (headerIdx >= 0) {
      for (let i = headerIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (/(tổng|tong)\s|người khai|xác nhận|customs declaration/i.test(line)) break;
        const cols = line.split(/\s{2,}|\t/).map((c) => c.trim()).filter(Boolean);
        if (cols.length < 3) continue;
        const byIndex: Record<MaterialFieldKey, string | undefined> = {} as any;
        MATERIAL_COLUMNS.forEach((c, idx) => (byIndex[c.key] = cols[idx]));
        const desc = byIndex.description || cols[2];
        if (!desc || /^[\d.,]+$/.test(desc)) continue;
        materials.push({
          itemNo: this.toNumber(byIndex.itemNo) || materials.length + 1,
          hsCode: byIndex.hsCode || undefined,
          description: desc,
          quantity: this.toNumber(byIndex.quantity),
          unit: byIndex.unit || 'cái',
          unitPrice: this.toNumber(byIndex.unitPrice),
          origin: normalizeCountryCode(byIndex.origin),
          weight: this.toNumber(byIndex.weight) || undefined,
        });
      }
    }

    return this.assemble(fields, journeys, materials);
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
