/**
 * Quy trình xử lý tờ khai hải quan.
 *
 * Trước đây API nhận thẳng bất kỳ trạng thái nào gửi lên, nên một tờ khai còn ở
 * dạng nháp có thể nhảy vào "Hoàn thành" mà chưa qua bước duyệt nào, và người
 * chỉ có quyền xem cũng ký duyệt được. Hai bảng dưới đây khoá lại cả hai lỗ hổng
 * đó: đi đâu được (luồng) và ai được đi (vai trò).
 */

export type CustomsStatus = 'DRAFT' | 'SUBMITTED' | 'PROCESSING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

/** Từ mỗi trạng thái chỉ được chuyển sang những trạng thái liệt kê ở đây. */
export const ALLOWED_TRANSITIONS: Record<CustomsStatus, CustomsStatus[]> = {
  // Nháp: hoàn thiện rồi nộp, hoặc để nguyên.
  DRAFT: ['SUBMITTED'],
  // Đã nộp: cán bộ tiếp nhận đưa vào xử lý, hoặc trả lại nếu hồ sơ sai.
  SUBMITTED: ['PROCESSING', 'REJECTED', 'DRAFT'],
  // Đang xử lý: kết luận duyệt hoặc từ chối.
  PROCESSING: ['APPROVED', 'REJECTED'],
  // Đã duyệt: thông quan xong thì kết thúc hồ sơ.
  APPROVED: ['COMPLETED'],
  // Bị từ chối: doanh nghiệp sửa lại và nộp lần nữa.
  REJECTED: ['DRAFT'],
  // Hoàn thành là trạng thái kết thúc, không mở lại.
  COMPLETED: [],
};

/** Vai trò được phép đưa tờ khai sang trạng thái tương ứng. */
export const TRANSITION_ROLES: Record<CustomsStatus, string[]> = {
  DRAFT: ['ADMIN', 'DIRECTOR', 'STAFF'],
  SUBMITTED: ['ADMIN', 'DIRECTOR', 'STAFF'],
  PROCESSING: ['ADMIN', 'DIRECTOR', 'STAFF'],
  // Duyệt và từ chối là quyết định có hiệu lực pháp lý - chỉ cấp quản lý trở lên.
  APPROVED: ['ADMIN', 'DIRECTOR'],
  REJECTED: ['ADMIN', 'DIRECTOR'],
  COMPLETED: ['ADMIN', 'DIRECTOR'],
};

export const STATUS_LABELS: Record<CustomsStatus, string> = {
  DRAFT: 'Nháp',
  SUBMITTED: 'Đã nộp',
  PROCESSING: 'Đang xử lý',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  COMPLETED: 'Hoàn thành',
};

export function isValidStatus(value: string): value is CustomsStatus {
  return Object.prototype.hasOwnProperty.call(ALLOWED_TRANSITIONS, value);
}

export function canTransition(from: CustomsStatus, to: CustomsStatus) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function canRoleSet(role: string, to: CustomsStatus) {
  return TRANSITION_ROLES[to].includes(role);
}

/** Các bước hợp lệ tiếp theo cho một vai trò cụ thể - dùng để dựng nút bấm trên giao diện. */
export function nextStatusesFor(from: CustomsStatus, role: string): CustomsStatus[] {
  return ALLOWED_TRANSITIONS[from].filter((status) => canRoleSet(role, status));
}
