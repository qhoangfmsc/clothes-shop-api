import { PaymentAttemptStatus } from './payment.constant';

/**
 * Trạng thái hiệu lực của một phiên thanh toán khi đọc (không phụ thuộc việc DB đã được cập nhật chưa):
 * phiên `PENDING` của đơn đã huỷ → `CANCELLED`; phiên `PENDING` quá hạn → `EXPIRED`; còn lại giữ nguyên.
 * Dùng chung cho `getStatus` và danh sách phiên của khách để hai nơi luôn cùng quy tắc.
 */
export function resolveAttemptStatus(
  attempt: { status: PaymentAttemptStatus; expiresAt: Date },
  orderStatus: string,
  nowMs: number = Date.now(),
): PaymentAttemptStatus {
  if (attempt.status !== 'PENDING') return attempt.status;
  if (orderStatus === 'cancelled') return 'CANCELLED';
  if (attempt.expiresAt.getTime() <= nowMs) return 'EXPIRED';
  return 'PENDING';
}
