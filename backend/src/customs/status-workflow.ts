/**
 * Quy trình xử lý tờ khai hải quan.
 *
 * Trước đây API nhận thẳng bất kỳ trạng thái nào gửi lên, nên một tờ khai còn ở
 * dạng nháp có thể nhảy vào "Hoàn thành" mà chưa qua bước duyệt nào, và người
 * chỉ có quyền xem cũng ký duyệt được. Hai bảng dưới đây khoá lại cả hai lỗ hổng
 * đó: đi đâu được (luồng) và ai được đi (vai trò).
 */

export type CustomsStatus = 'DRAFT' | 'SUBMITTED' | 'PROCESSING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

/**
 * Từ mỗi trạng thái chỉ được chuyển sang những trạng thái liệt kê ở đây.
 *
 * Quy trình có cả bước lùi, không chỉ bước tiến: người duyệt bấm nhầm, hoặc phát
 * hiện thiếu chứng từ sau khi đã duyệt, thì phải kéo hồ sơ về bước trước để xử lý
 * lại. Trước đây chỉ có bước tiến nên một cái bấm nhầm là hồ sơ mắc kẹt vĩnh viễn
 * ở trạng thái sai và cách duy nhất để sửa là xoá cả tờ khai đi làm lại.
 */
export const ALLOWED_TRANSITIONS: Record<CustomsStatus, CustomsStatus[]> = {
  // Nháp: hoàn thiện rồi nộp.
  DRAFT: ['SUBMITTED'],
  // Đã nộp: đưa vào xử lý, trả lại nếu hồ sơ sai, hoặc rút về nháp.
  SUBMITTED: ['PROCESSING', 'REJECTED', 'DRAFT'],
  // Đang xử lý: kết luận duyệt / từ chối, hoặc trả về "Đã nộp" nếu bấm nhầm.
  PROCESSING: ['APPROVED', 'REJECTED', 'SUBMITTED'],
  // Đã duyệt: thông quan xong thì kết thúc; phát hiện sai thì mở lại để xử lý
  // hoặc chuyển sang từ chối.
  APPROVED: ['COMPLETED', 'PROCESSING', 'REJECTED'],
  // Bị từ chối: doanh nghiệp sửa lại và nộp lần nữa, hoặc mở lại để xử lý tiếp.
  REJECTED: ['DRAFT', 'PROCESSING'],
  // Hoàn thành: chỉ cấp quản lý mở lại được (xem TRANSITION_ROLES), nhưng phải
  // mở được - hồ sơ đã đóng vẫn có thể cần đính chính.
  COMPLETED: ['APPROVED'],
};

/**
 * Bước lùi (trái chiều quy trình) - chỉ để giao diện gắn nhãn và màu khác với
 * bước tiến, người bấm phải thấy rõ mình đang kéo hồ sơ về sau.
 */
const WORKFLOW_ORDER: CustomsStatus[] = ['DRAFT', 'SUBMITTED', 'PROCESSING', 'APPROVED', 'COMPLETED'];

export function isBackwardTransition(from: CustomsStatus, to: CustomsStatus): boolean {
  const fromIndex = WORKFLOW_ORDER.indexOf(from);
  const toIndex = WORKFLOW_ORDER.indexOf(to);
  // REJECTED không nằm trên trục quy trình nên không tính là tiến hay lùi.
  if (fromIndex < 0 || toIndex < 0) return false;
  return toIndex < fromIndex;
}

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

/**
 * Trạng thái đã mang hiệu lực quyết định: kéo hồ sơ ra khỏi đây là đảo ngược một
 * quyết định đã ký, nên dù đích đến có cho phép STAFF thì bước lùi vẫn phải là
 * cấp quản lý.
 */
const DECIDED_STATUSES: CustomsStatus[] = ['APPROVED', 'COMPLETED'];
const MANAGER_ROLES = ['ADMIN', 'DIRECTOR'];

export function canRoleSet(role: string, to: CustomsStatus, from?: CustomsStatus) {
  if (from && DECIDED_STATUSES.includes(from) && !MANAGER_ROLES.includes(role)) return false;
  return TRANSITION_ROLES[to].includes(role);
}

/** Các bước hợp lệ tiếp theo cho một vai trò cụ thể - dùng để dựng nút bấm trên giao diện. */
export function nextStatusesFor(from: CustomsStatus, role: string): CustomsStatus[] {
  return ALLOWED_TRANSITIONS[from].filter((status) => canRoleSet(role, status, from));
}
