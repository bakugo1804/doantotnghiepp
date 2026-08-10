/**
 * Quy tắc tên đăng nhập, khai báo một chỗ để đăng ký, sửa hồ sơ và quản trị
 * người dùng cùng áp một chuẩn.
 */

/**
 * Độ dài mật khẩu tối thiểu, khai báo một chỗ cho cả đăng ký lẫn đăng nhập.
 *
 * Trước đây đăng ký bắt 8 ký tự còn đăng nhập chỉ bắt 6: người dùng đặt mật khẩu
 * 6 ký tự qua trang quản trị thì đăng nhập được, nhưng không thể tự đăng ký một
 * tài khoản dùng chính mật khẩu đó.
 */
export const PASSWORD_MIN_LENGTH = 6;

export const PASSWORD_RULE_MESSAGE = `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`;

/** Bắt đầu bằng chữ cái, dài 3-30 ký tự, chỉ gồm chữ thường, số, dấu chấm, gạch dưới, gạch ngang. */
export const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,29}$/;

export const USERNAME_RULE_MESSAGE =
  'Tên đăng nhập bắt đầu bằng chữ cái, dài 3-30 ký tự, chỉ gồm chữ thường, số và các ký tự . _ -';

/**
 * Chuẩn hoá trước khi lưu và trước khi tra cứu.
 *
 * Người dùng hay gõ "Admin" hoặc " admin ", nếu lưu nguyên trạng thì ràng buộc
 * UNIQUE vẫn cho phép tồn tại song song "Admin" và "admin" - hai tài khoản khác
 * nhau mà nhìn bằng mắt thì giống hệt.
 */
export function normalizeUsername(value: string) {
  return (value || '').trim().toLowerCase();
}

/** Gợi ý tên đăng nhập từ email khi người dùng để trống ô này. */
export function suggestUsernameFromEmail(email: string) {
  const base = normalizeUsername(email.split('@')[0]).replace(/[^a-z0-9._-]/g, '');
  if (USERNAME_PATTERN.test(base)) return base;
  // Không suy ra được thì trả chuỗi rỗng để tầng gọi tự quyết định.
  return '';
}
