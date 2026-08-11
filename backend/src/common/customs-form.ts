/**
 * ĐỊNH NGHĨA MẪU TỜ KHAI HẢI QUAN CỐ ĐỊNH (single source of truth)
 *
 * File này là nguồn chuẩn dùng chung cho:
 *  - Xuất Excel / PDF (reports.service)
 *  - Đọc Excel / PDF (ai.service)
 *
 * Nhờ dùng chung 1 định nghĩa nhãn (label), việc "xuất ra" và "đọc vào"
 * luôn khớp nhau -> round-trip ổn định.
 */

export type CustomsFieldKey =
  | 'declarationNo'
  | 'entryDate'
  | 'exitDate'
  | 'flightNo'
  | 'exporterName'
  | 'exporterAddress'
  | 'exporterCountry'
  | 'importerName'
  | 'importerAddress'
  | 'importerCountry'
  | 'invoiceNo'
  | 'billOfLading'
  | 'containerNo'
  | 'currency'
  | 'vatRate'
  | 'notes';

export interface CustomsFieldDef {
  key: CustomsFieldKey;
  label: string; // Nhãn hiển thị trên biểu mẫu
  section: string; // Nhóm để trình bày biểu mẫu
  synonyms?: string[]; // Các cách viết khác (đã bỏ dấu) để đọc file linh hoạt
}

/**
 * Nhóm của "Số tờ khai".
 *
 * Trường này được vẽ riêng ở góc trên biểu mẫu (đúng vị trí của tờ khai giấy)
 * chứ không nằm trong khối nhóm nào, nên section của nó cố ý không có mặt trong
 * SECTION_ORDER của reports.service - nếu thêm vào đó nó sẽ bị vẽ hai lần.
 */
export const IDENTITY_SECTION = 'Định danh';

/** Danh sách trường của phần thông tin chung (ngoài bảng vật tư). */
export const CUSTOMS_FIELDS: CustomsFieldDef[] = [
  { key: 'declarationNo', label: 'Số tờ khai', section: IDENTITY_SECTION, synonyms: ['so to khai', 'so tk', 'to khai so', 'declaration no', 'declaration number'] },

  // Hai mốc này là ĐIỂM ĐẦU và ĐIỂM CUỐI của hành trình vận chuyển.
  //
  // Cố ý KHÔNG dùng cặp từ "nhập cảnh / xuất cảnh" nữa: theo nghĩa hải quan thì
  // hàng xuất cảnh khỏi nước bán TRƯỚC rồi mới nhập cảnh vào nước mua, tức là
  // ngược đúng thứ tự của hai cột này, nên đọc lên là thấy mâu thuẫn ngay. Các
  // cách viết cũ vẫn nằm trong synonyms để những file đã phát hành đọc lại được.
  {
    key: 'entryDate',
    label: 'Ngày bắt đầu vận chuyển',
    section: 'Thông tin chung',
    synonyms: ['ngay bat dau van chuyen', 'bat dau van chuyen', 'ngay bat dau', 'ngay nhap canh', 'ngay nhap', 'entry date'],
  },
  {
    key: 'exitDate',
    label: 'Ngày kết thúc vận chuyển',
    section: 'Thông tin chung',
    synonyms: ['ngay ket thuc van chuyen', 'ket thuc van chuyen', 'ngay ket thuc', 'ngay xuat canh', 'exit date'],
  },
  { key: 'flightNo', label: 'Số hiệu chuyến (bay/tàu)', section: 'Thông tin chung', synonyms: ['so hieu chuyen', 'so hieu chuyen bay tau', 'so chuyen bay', 'chuyen bay', 'ten tau', 'so hieu tau', 'flight no', 'so hieu tau xe'] },

  { key: 'exporterName', label: 'Nhà xuất khẩu', section: 'Bên xuất khẩu', synonyms: ['nha xuat khau', 'ten nha xuat khau', 'exporter', 'exporter name'] },
  { key: 'exporterAddress', label: 'Địa chỉ nhà xuất khẩu', section: 'Bên xuất khẩu', synonyms: ['dia chi nha xuat khau', 'dia chi xk', 'dia chi xuat khau', 'exporter address'] },
  { key: 'exporterCountry', label: 'Nước xuất khẩu', section: 'Bên xuất khẩu', synonyms: ['nuoc xuat khau', 'quoc gia xuat khau', 'exporter country'] },

  { key: 'importerName', label: 'Nhà nhập khẩu', section: 'Bên nhập khẩu', synonyms: ['nha nhap khau', 'ten nha nhap khau', 'importer', 'importer name'] },
  { key: 'importerAddress', label: 'Địa chỉ nhà nhập khẩu', section: 'Bên nhập khẩu', synonyms: ['dia chi nha nhap khau', 'dia chi nk', 'dia chi nhap khau', 'importer address'] },
  { key: 'importerCountry', label: 'Nước nhập khẩu', section: 'Bên nhập khẩu', synonyms: ['nuoc nhap khau', 'quoc gia nhap khau', 'importer country'] },

  { key: 'invoiceNo', label: 'Số hóa đơn', section: 'Chứng từ', synonyms: ['so hoa don', 'invoice', 'invoice no'] },
  { key: 'billOfLading', label: 'Số vận đơn', section: 'Chứng từ', synonyms: ['so van don', 'van don', 'bill of lading', 'bl'] },
  { key: 'containerNo', label: 'Số container', section: 'Chứng từ', synonyms: ['so container', 'container', 'container no'] },

  { key: 'currency', label: 'Tiền tệ', section: 'Tài chính', synonyms: ['tien te', 'loai tien', 'currency'] },
  { key: 'vatRate', label: 'Thuế suất VAT (%)', section: 'Tài chính', synonyms: ['thue suat vat', 'thue vat', 'vat', 'thue suat'] },
  { key: 'notes', label: 'Ghi chú', section: 'Tài chính', synonyms: ['ghi chu', 'notes', 'note'] },
];

export type MaterialFieldKey = 'itemNo' | 'hsCode' | 'description' | 'quantity' | 'unit' | 'unitPrice' | 'origin' | 'weight';

export interface MaterialColumnDef {
  key: MaterialFieldKey;
  label: string;
  synonyms?: string[];
}

/** Cột của bảng vật tư hàng hóa. */
export const MATERIAL_COLUMNS: MaterialColumnDef[] = [
  { key: 'itemNo', label: 'STT', synonyms: ['stt', 'tt', 'no', 'so tt'] },
  { key: 'hsCode', label: 'Mã HS', synonyms: ['ma hs', 'hs', 'hs code', 'ma hs code'] },
  { key: 'description', label: 'Mô tả hàng hóa', synonyms: ['mo ta hang hoa', 'mo ta', 'ten hang', 'ten hang hoa', 'hang hoa', 'description'] },
  { key: 'quantity', label: 'Số lượng', synonyms: ['so luong', 'sl', 'quantity', 'qty'] },
  { key: 'unit', label: 'Đơn vị', synonyms: ['don vi', 'dvt', 'dv', 'unit'] },
  { key: 'unitPrice', label: 'Đơn giá', synonyms: ['don gia', 'gia', 'unit price', 'price', 'don gia usd'] },
  { key: 'origin', label: 'Xuất xứ', synonyms: ['xuat xu', 'origin'] },
  { key: 'weight', label: 'Trọng lượng (kg)', synonyms: ['trong luong', 'trong luong kg', 'tl', 'weight', 'kg'] },
];

export type JourneyFieldKey = 'legNumber' | 'transportType' | 'origin' | 'destination';

export interface JourneyColumnDef {
  key: JourneyFieldKey;
  label: string;
  synonyms?: string[];
}

/** Cột của bảng hành trình vận chuyển (nhiều chặng). */
export const JOURNEY_COLUMNS: JourneyColumnDef[] = [
  { key: 'legNumber', label: 'Chặng', synonyms: ['chang', 'chang so', 'stt', 'leg', 'so chang'] },
  { key: 'transportType', label: 'Loại vận chuyển', synonyms: ['loai van chuyen', 'phuong thuc', 'phuong thuc van chuyen', 'transport'] },
  { key: 'origin', label: 'Điểm đi', synonyms: ['diem di', 'noi di', 'origin', 'from'] },
  { key: 'destination', label: 'Điểm đến', synonyms: ['diem den', 'noi den', 'destination', 'to'] },
];

/**
 * Chuẩn hóa nhãn để so khớp linh hoạt:
 * bỏ dấu tiếng Việt, chữ thường, chỉ giữ [a-z0-9 khoảng trắng], gộp khoảng trắng.
 */
export function normalizeLabel(input: unknown): string {
  if (input == null) return '';
  return String(input)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // bo dau thanh (combining marks)
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // bỏ ký tự đặc biệt (kể cả dấu ":", "(%)")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bảng tra: nhãn (đã chuẩn hóa) -> field key. */
const FIELD_LOOKUP: Record<string, CustomsFieldKey> = (() => {
  const map: Record<string, CustomsFieldKey> = {};
  for (const f of CUSTOMS_FIELDS) {
    map[normalizeLabel(f.label)] = f.key;
    for (const s of f.synonyms ?? []) map[normalizeLabel(s)] = f.key;
  }
  return map;
})();

const MATERIAL_LOOKUP: Record<string, MaterialFieldKey> = (() => {
  const map: Record<string, MaterialFieldKey> = {};
  for (const c of MATERIAL_COLUMNS) {
    map[normalizeLabel(c.label)] = c.key;
    for (const s of c.synonyms ?? []) map[normalizeLabel(s)] = c.key;
  }
  return map;
})();

/** Tra field key từ một nhãn bất kỳ (trả về undefined nếu không nhận diện). */
export function matchField(label: unknown): CustomsFieldKey | undefined {
  return FIELD_LOOKUP[normalizeLabel(label)];
}

/** Tra cột vật tư từ một nhãn bất kỳ. */
export function matchMaterialColumn(label: unknown): MaterialFieldKey | undefined {
  return MATERIAL_LOOKUP[normalizeLabel(label)];
}

const JOURNEY_LOOKUP: Record<string, JourneyFieldKey> = (() => {
  const map: Record<string, JourneyFieldKey> = {};
  for (const c of JOURNEY_COLUMNS) {
    map[normalizeLabel(c.label)] = c.key;
    for (const s of c.synonyms ?? []) map[normalizeLabel(s)] = c.key;
  }
  return map;
})();

/** Tra cột hành trình từ một nhãn bất kỳ. */
export function matchJourneyColumn(label: unknown): JourneyFieldKey | undefined {
  return JOURNEY_LOOKUP[normalizeLabel(label)];
}

/** Chuẩn hóa loại vận chuyển về enum AIR/SEA/RAIL/ROAD. */
export function normalizeTransport(value: unknown): 'AIR' | 'SEA' | 'RAIL' | 'ROAD' | undefined {
  const raw = String(value ?? '').trim().toUpperCase();
  if (['AIR', 'SEA', 'RAIL', 'ROAD'].includes(raw)) return raw as any;
  const n = normalizeLabel(value);
  if (!n) return undefined;
  if (/(hang khong|may bay|hkhong|\bair\b)/.test(n)) return 'AIR';
  if (/(duong bien|tau bien|\bbien\b|\bsea\b)/.test(n)) return 'SEA';
  if (/(duong sat|tau lua|tau hoa|\bsat\b|\brail\b)/.test(n)) return 'RAIL';
  if (/(duong bo|xe tai|\bo to\b|oto|\bbo\b|\broad\b)/.test(n)) return 'ROAD';
  return undefined;
}

/**
 * Ô mẫu để trống trên biểu mẫu giấy được điền bằng dấu chấm nối hoặc gạch ngang.
 * Người dùng tải mẫu về mà không xoá thì phải coi như ô trống, nếu không hệ thống
 * sẽ lưu nguyên chuỗi "………" vào cơ sở dữ liệu.
 */
export function isPlaceholderText(value: unknown): boolean {
  const s = String(value ?? '').trim();
  if (!s) return true;
  return /^[.…–—\-_\s:]*$/.test(s);
}

/** Nhãn tiếng Việt cho loại vận chuyển (dùng khi xuất file). */
export const TRANSPORT_LABELS: Record<string, string> = {
  AIR: 'Đường hàng không',
  SEA: 'Đường biển',
  RAIL: 'Đường sắt',
  ROAD: 'Đường bộ',
};
