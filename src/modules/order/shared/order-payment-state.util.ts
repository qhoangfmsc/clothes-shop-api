import { EntityManager } from 'typeorm';
import { Order } from './order.entity';

/** Chuyển trạng thái thanh toán của đơn do module order sở hữu; payment gọi trong transaction đã khoá đơn (order → bản ghi con). */

/** Đơn được thanh toán: `paid` + `paid_at`; đơn đang `pending` tự sang `confirmed`, đơn đã đi tiếp (confirmed, shipping...) giữ nguyên */
export async function markOrderPaid(manager: EntityManager, orderId: string, paidAt: Date): Promise<void> {
  await manager.update(Order, { id: orderId }, { paymentStatus: 'paid', paidAt });
  await manager.update(Order, { id: orderId, status: 'pending' }, { status: 'confirmed' });
}

/** Đã hoàn đủ số tiền khách trả */
export async function markOrderRefunded(manager: EntityManager, orderId: string): Promise<void> {
  await manager.update(Order, { id: orderId }, { paymentStatus: 'refunded' });
}
