import type { OrderStatus } from '@common/constants/enum-values.constant';

/**
 * Chuyển trạng thái do admin thực hiện (`updateStatus`). Chuyển do hệ thống (thanh toán tự `pending → confirmed`, khách huỷ
 * `pending → cancelled`) nằm ở nơi gây ra chúng. `Record<OrderStatus, ...>` buộc khai báo đủ mọi trạng thái.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipping', 'cancelled'],
  shipping: ['delivered'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};
