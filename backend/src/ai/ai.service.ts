import { Injectable } from '@nestjs/common';
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
  normalizeTransport,
} from '../common/customs-form';

// pdf-parse (thuần JS) — trích xuất text từ PDF có lớp text
const pdfParse = require('pdf-parse');

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
      this.openai = new OpenAI({ apiKey: rawKey || 'not-needed', baseURL });
    }
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
    for (const k of Object.keys(fields) as CustomsFieldKey[]) {
      const v = fields[k];
      if (typeof v === 'string' && /^[—–\-\s]*$/.test(v)) delete fields[k];
    }
    const vat = fields.vatRate ? this.toNumber(fields.vatRate) : undefined;
    return {
      entryDate: this.parseDate(fields.entryDate) || new Date().toISOString(),
      exitDate: this.parseDate(fields.exitDate),
      transportType: journeys[0]?.transportType || 'AIR',
      flightNo: fields.flightNo || undefined,
      journeys,
      exporterName: fields.exporterName || '',
      exporterAddress: fields.exporterAddress || undefined,
      exporterCountry: fields.exporterCountry || undefined,
      importerName: fields.importerName || '',
      importerAddress: fields.importerAddress || undefined,
      importerCountry: fields.importerCountry || undefined,
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
            if ((row[k] || '').trim()) {
              val = row[k].trim();
              break;
            }
          }
          if (!val) {
            const below = grid[rr + 1];
            const belowText = below ? (below[cc] || '').trim() : '';
            if (belowText && !matchField(belowText) && !matchMaterialColumn(belowText) && !matchJourneyColumn(belowText)) val = belowText;
          }
          if (val) fields[key] = val;
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
            if (!origin && !destination) break;
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
            if (!desc) break;
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
              origin: this.cellText(get('origin')) || undefined,
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

  async parsePdf(buffer: Buffer): Promise<ParsedForm> {
    const data = await pdfParse(buffer);
    const lines: string[] = String(data.text || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const fields: Partial<Record<CustomsFieldKey, string>> = {};
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    for (const f of CUSTOMS_FIELDS) {
      if (fields[f.key] != null) continue;
      const re = new RegExp('^\\s*' + escape(f.label) + '\\s*[:\\-]?\\s*(.+)$', 'i');
      for (const line of lines) {
        const m = line.match(re);
        if (m && m[1] && matchField(m[1]) === undefined) {
          fields[f.key] = m[1].trim();
          break;
        }
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
          origin: byIndex.origin || undefined,
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

    const history = userId
      ? await this.prisma.chatMessage.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : [];

    const messages: any[] = [
      {
        role: 'system',
        content: `Bạn là trợ lý AI của hệ thống quản lý hải quan. Bạn giúp người dùng:
1. Hướng dẫn cách điền tờ khai hải quan
2. Giải thích các quy định hải quan Việt Nam
3. Hỗ trợ sử dụng phần mềm
4. Giải thích các mã HS code, thuế VAT, phí vận chuyển
Trả lời bằng tiếng Việt, ngắn gọn, dễ hiểu.`,
      },
      ...history.reverse().map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    let reply: string;
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: 500,
      });
      reply = response.choices[0]?.message?.content?.trim() || 'Xin lỗi, tôi chưa có câu trả lời phù hợp.';
    } catch (err: any) {
      return `Không kết nối được tới dịch vụ AI (${this.model}). Vui lòng kiểm tra AI đang chạy và cấu hình .env. Chi tiết: ${err?.message || 'lỗi không xác định'}`;
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
