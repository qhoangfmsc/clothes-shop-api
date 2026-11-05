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

/** Đơn kèm dòng hàng và sản phẩm hiện tại (kèm category/subcategory) của từng dòng — mọi response đơn cùng một hình dạng */
export const ORDER_RELATIONS = ['items', 'items.product', 'items.product.category', 'items.product.subcategory'];
