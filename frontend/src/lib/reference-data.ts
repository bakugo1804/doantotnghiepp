/**
 * Danh mục tham chiếu dùng cho form khai báo.
 *
 * Trước đây các ô như xuất xứ, đơn vị tính đều là input tự do, nên mỗi người gõ
 * một kiểu ("CN", "China", "Trung Quốc", "trung quoc") và dữ liệu không thể gom
 * nhóm hay thống kê được. Chuyển sang chọn từ danh mục cố định để mọi bản ghi
 * dùng chung một bộ mã.
 */

export type Country = {
  /** Mã ISO 3166-1 alpha-2, cũng là giá trị lưu xuống cơ sở dữ liệu. */
  code: string;
  name: string;
  flag: string;
};

/** Các thị trường xuất nhập khẩu chính của Việt Nam, xếp Việt Nam lên đầu. */
export const COUNTRIES: Country[] = [
  { code: 'VN', name: 'Việt Nam', flag: '🇻🇳' },
  { code: 'CN', name: 'Trung Quốc', flag: '🇨🇳' },
  { code: 'US', name: 'Hoa Kỳ', flag: '🇺🇸' },
  { code: 'KR', name: 'Hàn Quốc', flag: '🇰🇷' },
  { code: 'JP', name: 'Nhật Bản', flag: '🇯🇵' },
  { code: 'TH', name: 'Thái Lan', flag: '🇹🇭' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'KH', name: 'Campuchia', flag: '🇰🇭' },
  { code: 'LA', name: 'Lào', flag: '🇱🇦' },
  { code: 'MM', name: 'Myanmar', flag: '🇲🇲' },
  { code: 'IN', name: 'Ấn Độ', flag: '🇮🇳' },
  { code: 'TW', name: 'Đài Loan', flag: '🇹🇼' },
  { code: 'HK', name: 'Hồng Kông', flag: '🇭🇰' },
  { code: 'AU', name: 'Úc', flag: '🇦🇺' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿' },
  { code: 'EU', name: 'Liên minh châu Âu', flag: '🇪🇺' },
  { code: 'DE', name: 'Đức', flag: '🇩🇪' },
  { code: 'FR', name: 'Pháp', flag: '🇫🇷' },
  { code: 'IT', name: 'Ý', flag: '🇮🇹' },
  { code: 'NL', name: 'Hà Lan', flag: '🇳🇱' },
  { code: 'ES', name: 'Tây Ban Nha', flag: '🇪🇸' },
  { code: 'GB', name: 'Anh', flag: '🇬🇧' },
  { code: 'RU', name: 'Nga', flag: '🇷🇺' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪' },
  { code: 'SA', name: 'Ả Rập Xê Út', flag: '🇸🇦' },
  { code: 'TR', name: 'Thổ Nhĩ Kỳ', flag: '🇹🇷' },
  { code: 'ZA', name: 'Nam Phi', flag: '🇿🇦' },
];

export const COUNTRY_BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

export const countryLabel = (code?: string | null) => {
  if (!code) return '—';
  const country = COUNTRY_BY_CODE.get(code.toUpperCase());
  return country ? `${country.flag} ${country.name}` : code;
};

/**
 * Thuế suất VAT nhập khẩu theo nước xuất xứ.
 * Giữ khớp với backend/src/customs/financial-rules.ts - lệch nhau thì con số xem
 * trước trên form sẽ khác con số thực tế được lưu.
 */
export const VAT_BY_COUNTRY: Record<string, number> = {
  VN: 10, TH: 7, SG: 9, MY: 8, CN: 13, KR: 10, JP: 10, US: 8, EU: 20,
};

export const getVatRateByCountry = (code?: string) => VAT_BY_COUNTRY[(code || 'VN').toUpperCase()] ?? 10;

/** Đơn vị tính theo thông lệ khai báo hải quan. */
export const UNITS = [
  'cái', 'chiếc', 'bộ', 'đôi', 'tá', 'kiện', 'hộp', 'thùng', 'bao', 'cuộn',
  'kg', 'tấn', 'gram', 'lít', 'mét', 'm2', 'm3', 'pallet', 'container',
] as const;

export const CURRENCIES = [
  { code: 'USD', name: 'Đô la Mỹ', symbol: '$' },
  { code: 'VND', name: 'Việt Nam Đồng', symbol: '₫' },
] as const;

/** Nhóm mã HS hay gặp, dùng làm gợi ý khi nhập vật tư. */
export const HS_CODE_SUGGESTIONS: { code: string; label: string }[] = [
  { code: '8471.30', label: 'Máy tính xách tay' },
  { code: '8517.12', label: 'Điện thoại di động' },
  { code: '8528.72', label: 'Tivi màu' },
  { code: '8708.29', label: 'Phụ tùng ô tô' },
  { code: '7208.51', label: 'Thép tấm cán nóng' },
  { code: '3926.90', label: 'Sản phẩm nhựa khác' },
  { code: '5208.39', label: 'Vải cotton dệt thoi' },
  { code: '6109.10', label: 'Áo phông cotton' },
  { code: '6403.99', label: 'Giày dép da' },
  { code: '1905.90', label: 'Bánh kẹo các loại' },
  { code: '0901.21', label: 'Cà phê đã rang' },
  { code: '1006.30', label: 'Gạo đã xát' },
  { code: '3004.90', label: 'Dược phẩm đóng gói' },
  { code: '9403.60', label: 'Đồ gỗ nội thất' },
];

/** Cảng và cửa khẩu chính, dùng gợi ý cho điểm đi/điểm đến của từng chặng. */
export const LOCATION_SUGGESTIONS: Record<string, string[]> = {
  SEA: ['Cảng Hải Phòng', 'Cảng Cát Lái (TP.HCM)', 'Cảng Đà Nẵng', 'Cảng Cái Mép', 'Shanghai', 'Ningbo', 'Busan', 'Singapore', 'Port Klang', 'Laem Chabang'],
  AIR: ['Nội Bài (HAN)', 'Tân Sơn Nhất (SGN)', 'Đà Nẵng (DAD)', 'Incheon (ICN)', 'Narita (NRT)', 'Pudong (PVG)', 'Changi (SIN)', 'Suvarnabhumi (BKK)'],
  ROAD: ['Cửa khẩu Hữu Nghị (Lạng Sơn)', 'Cửa khẩu Móng Cái (Quảng Ninh)', 'Cửa khẩu Lào Cai', 'Cửa khẩu Mộc Bài (Tây Ninh)', 'Cửa khẩu Cầu Treo (Hà Tĩnh)', 'Bangkok', 'Phnom Penh'],
  RAIL: ['Ga Yên Viên (Hà Nội)', 'Ga Đồng Đăng (Lạng Sơn)', 'Ga Lào Cai', 'Ga Sóng Thần (Bình Dương)', 'Nanning', 'Kunming'],
};
