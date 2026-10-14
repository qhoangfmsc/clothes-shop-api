import { SelectQueryBuilder } from 'typeorm';
import { CONFIRMABLE_VERIFICATION_STATUSES } from './payment.constant';

/**
 * Giao dịch ngân hàng cần admin xử lý (alias `t` = payment_transactions, `a` = payment_attempts, `o` = orders; `a` và `o` là LEFT JOIN):
 * trạng thái admin gắn tay được (`CONFIRMABLE_VERIFICATION_STATUSES`) và chưa được xử lý, tức chưa gắn phiên nào, hoặc gắn vào phiên
 * mà đơn vẫn chưa thanh toán và chưa huỷ. `MATCHED`, `MANUALLY_CONFIRMED`, `DUPLICATE_PAYMENT`, `IGNORED`, `ACCOUNT_MISMATCH` không tính.
 * MỘT điều kiện dùng chung cho bộ lọc `needsReview` của danh sách và con số ở menu admin.
 */
export const TRANSACTION_NEEDS_REVIEW_SQL = `(t.verification_status IN (${CONFIRMABLE_VERIFICATION_STATUSES.map((status) => `'${status}'`).join(', ')}) AND (a.id IS NULL OR (o.payment_status = 'unpaid' AND o.status <> 'cancelled')))`;

export function applyTransactionNeedsReviewFilter<T extends object>(qb: SelectQueryBuilder<T>): SelectQueryBuilder<T> {
  return qb.andWhere(TRANSACTION_NEEDS_REVIEW_SQL);
}
