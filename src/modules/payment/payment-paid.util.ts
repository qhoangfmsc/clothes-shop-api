import { EntityManager } from 'typeorm';
import { Order } from '../order/order.entity';
import { PaymentAttempt } from './payment-attempt.entity';

/**
 * Hiệu ứng lên đơn khi một khoản thanh toán được xác nhận (webhook khớp hoặc admin xác nhận thủ công) — một chỗ duy nhất:
 * - `payment_status = paid`, `paid_at`
 * - đơn đang `pending` (chờ cửa hàng xác nhận) được tự chuyển `confirmed`; đơn đã đi tiếp (confirmed, shipping...) giữ nguyên
 * - mọi phiên `PENDING` khác của đơn không còn hiệu lực → `CANCELLED`
 * Gọi SAU khi phiên được thanh toán đã được lưu `PAID` (phiên đó không bị ảnh hưởng bởi bước huỷ).
 */
export async function applyOrderPaid(manager: EntityManager, orderId: string, paidAt: Date): Promise<void> {
  await manager.update(Order, { id: orderId }, { paymentStatus: 'paid', paidAt });
  await manager.update(Order, { id: orderId, status: 'pending' }, { status: 'confirmed' });
  await manager.update(PaymentAttempt, { orderId, status: 'PENDING' }, { status: 'CANCELLED' });
}
