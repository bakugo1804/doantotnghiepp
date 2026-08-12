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
  // Nhãn ghi kèm định dạng "(ngày/tháng/năm)".
  //
  // Biểu mẫu này để in ra điền tay, và người Việt viết 3/9/2026 là ngày 3 tháng 9.
  // Không ghi rõ thì chính người điền cũng có thể viết theo kiểu Mỹ, và mô hình đọc
  // ảnh lại càng dễ đảo ngày với tháng. Ghi thẳng lên biểu mẫu là cách rẻ nhất để cả
  // người điền lẫn máy đọc cùng hiểu một kiểu. Synonyms giữ cả nhãn cũ (không có
  // phần trong ngoặc) để những tệp đã phát hành vẫn đọc lại được.
  {
    key: 'entryDate',
    label: 'Ngày bắt đầu vận chuyển (ngày/tháng/năm)',
    section: 'Thông tin chung',
    synonyms: [
      'ngay bat dau van chuyen',
      'bat dau van chuyen',
      'ngay bat dau',
      'ngay bat dau van chuyen ngay thang nam',
      'ngay nhap canh',
      'ngay nhap',
      'entry date',
    ],
  },
  {
    key: 'exitDate',
    label: 'Ngày kết thúc vận chuyển (ngày/tháng/năm)',
    section: 'Thông tin chung',
    synonyms: [
      'ngay ket thuc van chuyen',
      'ket thuc van chuyen',
      'ngay ket thuc',
      'ngay ket thuc van chuyen ngay thang nam',
      'ngay xuat canh',
      'exit date',
    ],
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

  // Ghi rõ hai lựa chọn ngay trên biểu mẫu: ô này quyết định toàn bộ số tiền của tờ
  // khai, mà chỉ ghi "Tiền tệ" thì người điền có thể viết "đồng", "đô", "$"...
  {
    key: 'currency',
    label: 'Tiền tệ (USD hoặc VND)',
    section: 'Tài chính',
    synonyms: ['tien te', 'tien te usd hoac vnd', 'loai tien', 'dong tien', 'currency'],
  },
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
  // Nhãn có ví dụ kèm dấu phân cách nghìn.
  //
  // Đo được: số tiền viết liền "5000000" bị mô hình đọc ảnh đếm thiếu một chữ số 0
  // (ra 500.000 - sai mười lần), lặp lại ở mọi lần thử và cả khi hỏi từng chữ số; cùng
  // số đó viết "5.000.000" thì đọc đúng ngay. Mô hình yếu ở chỗ đếm một dãy ký tự
  // giống nhau, mà dấu phân cách thì chia dãy đó thành từng nhóm ba. Hướng người điền
  // viết có dấu là cách chữa rẻ nhất và hiệu quả nhất.
  {
    key: 'unitPrice',
    label: 'Đơn giá (ví dụ 5.000.000)',
    synonyms: ['don gia', 'don gia vi du 5 000 000', 'gia', 'unit price', 'price', 'don gia usd'],
  },
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
  // Liệt kê sẵn bốn lựa chọn trên tiêu đề cột: hệ thống chỉ có bốn phương thức, mà
  // cột trống thì người điền viết đủ kiểu ("đường bay", "máy bay", "HK") và mỗi cách
  // viết lạ là một lần đọc sai.
  {
    key: 'transportType',
    label: 'Loại vận chuyển (hàng không / biển / sắt / bộ)',
    synonyms: [
      'loai van chuyen',
      'loai van chuyen hang khong bien sat bo',
      'phuong thuc',
      'phuong thuc van chuyen',
      'transport',
    ],
  },
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

/**
 * Chuẩn hóa loại vận chuyển về enum AIR/SEA/RAIL/ROAD.
 *
 * Danh sách cách viết phải rộng, vì đây là ô người ta điền TAY: cùng một phương
 * thức mà mỗi người viết một kiểu ("đường bay", "hàng không", "máy bay", "HK"). Bỏ
 * sót một cách viết thì giá trị bị coi như không đọc được - và trước đây bên gọi lại
 * mặc định về ROAD, nên một lô hàng đi máy bay bị ghi thành đường bộ, kéo theo phí
 * vận chuyển tính sai (biểu giá hàng không đắt hơn đường bộ hơn ba lần).
 *
 * Thứ tự kiểm tra có ý nghĩa: xét cụm dài trước cụm ngắn, vì "đường sắt" và "đường
 * bộ" chỉ khác nhau ở từ cuối.
 */
export function normalizeTransport(value: unknown): 'AIR' | 'SEA' | 'RAIL' | 'ROAD' | undefined {
  const raw = String(value ?? '').trim().toUpperCase();
  if (['AIR', 'SEA', 'RAIL', 'ROAD'].includes(raw)) return raw as any;
  const n = normalizeLabel(value);
  if (!n) return undefined;

  // Hàng không: "đường bay" là cách viết rất hay gặp mà trước đây không nhận ra.
  if (/(hang khong|hkhong|duong bay|duong khong|may bay|tau bay|phi co|phi hanh|\bair\b|\bhk\b|\bavia\b)/.test(n)) return 'AIR';
  // Đường biển / đường thuỷ.
  if (/(duong bien|duong thuy|duong song|tau bien|tau thuy|\bbien\b|\bthuy\b|\bsea\b|\bocean\b|\bship\b)/.test(n)) return 'SEA';
  // Đường sắt.
  if (/(duong sat|duong ray|tau lua|tau hoa|hoa xa|xe lua|\bsat\b|\bray\b|\brail\b|\btrain\b)/.test(n)) return 'RAIL';
  // Đường bộ.
  if (/(duong bo|xe tai|xe container|\bo to\b|oto|xe dau keo|\bbo\b|\bxe\b|\broad\b|\btruck\b)/.test(n)) return 'ROAD';

  // Cuối cùng: so khớp gần với bốn nhãn chuẩn.
  //
  // Mô hình đọc ảnh trả về chữ méo chứ không phải chữ khác nghĩa: đã gặp "Dương viễn"
  // cho "Đường biển" - lệch đúng một ký tự. Bắt được những trường hợp này thì đỡ hẳn
  // một lượt hỏi lại. Ngưỡng 0,8 đủ chặt để "Đường Vận tải" (chỉ giống 0,62) vẫn bị
  // coi là không đọc được, thay vì bị gán bừa vào một phương thức.
  return closestTransport(n, 0.8);
}

/** Khoảng cách Levenshtein, dùng để so hai chuỗi ngắn. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = previous[j];
      previous[j] = Math.min(
        previous[j] + 1, // xoá
        previous[j - 1] + 1, // thêm
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1), // thay
      );
      diagonal = current;
    }
  }
  return previous[b.length];
}

/** Nhãn phương thức gần nhất với chuỗi đã chuẩn hoá, nếu đủ giống. */
function closestTransport(normalized: string, threshold: number): 'AIR' | 'SEA' | 'RAIL' | 'ROAD' | undefined {
  let best: { code: 'AIR' | 'SEA' | 'RAIL' | 'ROAD'; score: number } | undefined;
  for (const choice of TRANSPORT_CHOICES) {
    const label = normalizeLabel(choice.label);
    const score = 1 - editDistance(normalized, label) / Math.max(normalized.length, label.length);
    if (!best || score > best.score) best = { code: choice.code, score };
  }
  return best && best.score >= threshold ? best.code : undefined;
}

/** Nhãn tiếng Việt của bốn phương thức, dùng để hỏi lại mô hình theo dạng chọn một. */
export const TRANSPORT_CHOICES: { code: 'AIR' | 'SEA' | 'RAIL' | 'ROAD'; label: string }[] = [
  { code: 'AIR', label: 'Đường hàng không' },
  { code: 'SEA', label: 'Đường biển' },
  { code: 'RAIL', label: 'Đường sắt' },
  { code: 'ROAD', label: 'Đường bộ' },
];

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
