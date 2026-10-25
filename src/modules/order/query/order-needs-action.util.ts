import { SelectQueryBuilder } from 'typeorm';

/**
 * Đơn cần admin thao tác tiếp (alias `o` = orders): `pending` hoặc `confirmed`, trừ đơn `pending` chưa thanh toán đang có mã QR còn hạn
 * (khách đang chuyển khoản, admin chưa phải làm gì). Đơn shipping/delivered/completed/cancelled không tính.
 * MỘT điều kiện dùng chung cho bộ lọc `needsAction` của danh sách và con số ở menu admin, nên hai bên luôn khớp nhau.
 */
export const ORDER_NEEDS_ACTION_SQL = `(o.status IN ('pending', 'confirmed') AND NOT (o.status = 'pending' AND o.payment_status = 'unpaid' AND EXISTS (SELECT 1 FROM payment_attempts pa WHERE pa.order_id = o.id AND pa.status = 'PENDING' AND pa.expires_at > now())))`;

export function applyOrderNeedsActionFilter<T extends object>(qb: SelectQueryBuilder<T>): SelectQueryBuilder<T> {
  return qb.andWhere(ORDER_NEEDS_ACTION_SQL);
}
