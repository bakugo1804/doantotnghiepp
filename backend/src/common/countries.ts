/**
 * Bảng quy đổi tên quốc gia -> mã ISO 3166-1 alpha-2.
 *
 * Cơ sở dữ liệu chỉ lưu mã ("CN"), và thuế suất VAT lẫn phí vận chuyển đều tra
 * theo mã đó. Nhưng người khai điền tay vào biểu mẫu thì viết "Trung Quốc" hoặc
 * "China" - để nguyên thì bản ghi mang giá trị vô nghĩa và rơi về mức VAT mặc
 * định. Danh sách này giữ khớp với COUNTRIES ở frontend/src/lib/reference-data.ts.
 */

import { normalizeLabel } from './customs-form';

const COUNTRY_NAMES: Record<string, string[]> = {
  VN: ['Việt Nam', 'Vietnam', 'Viet Nam'],
  CN: ['Trung Quốc', 'China'],
  US: ['Hoa Kỳ', 'Mỹ', 'United States', 'USA', 'US'],
  KR: ['Hàn Quốc', 'South Korea', 'Korea'],
  JP: ['Nhật Bản', 'Japan'],
  TH: ['Thái Lan', 'Thailand'],
  SG: ['Singapore'],
  MY: ['Malaysia'],
  ID: ['Indonesia'],
  PH: ['Philippines'],
  KH: ['Campuchia', 'Cambodia'],
  LA: ['Lào', 'Laos'],
  MM: ['Myanmar'],
  IN: ['Ấn Độ', 'India'],
  TW: ['Đài Loan', 'Taiwan'],
  HK: ['Hồng Kông', 'Hong Kong'],
  AU: ['Úc', 'Australia'],
  NZ: ['New Zealand'],
  EU: ['Liên minh châu Âu', 'European Union', 'Châu Âu'],
  DE: ['Đức', 'Germany'],
  FR: ['Pháp', 'France'],
  IT: ['Ý', 'Italy'],
  NL: ['Hà Lan', 'Netherlands'],
  ES: ['Tây Ban Nha', 'Spain'],
  GB: ['Anh', 'United Kingdom', 'UK', 'England'],
  RU: ['Nga', 'Russia'],
  CA: ['Canada'],
  MX: ['Mexico'],
  BR: ['Brazil'],
  AE: ['UAE', 'Các Tiểu vương quốc Ả Rập Thống nhất'],
  SA: ['Ả Rập Xê Út', 'Saudi Arabia'],
  TR: ['Thổ Nhĩ Kỳ', 'Turkey'],
  ZA: ['Nam Phi', 'South Africa'],
};

const LOOKUP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [code, names] of Object.entries(COUNTRY_NAMES)) {
    map[normalizeLabel(code)] = code;
    for (const name of names) map[normalizeLabel(name)] = code;
  }
  return map;
})();

/**
 * Đưa một giá trị quốc gia bất kỳ về mã ISO.
 * Trả về undefined khi không nhận ra, để bên gọi tự quyết định giá trị mặc định
 * thay vì lưu nhầm một chuỗi tự do vào cột mã quốc gia.
 */
export function normalizeCountryCode(value: unknown): string | undefined {
  const raw = String(value ?? '').trim();
  if (!raw) return undefined;
  return LOOKUP[normalizeLabel(raw)];
}
