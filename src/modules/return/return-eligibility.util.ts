import { MS_PER_DAY, RETURNABLE_ORDER_STATUSES } from './return.constant';

export type ReturnIneligibleReason = 'ORDER_NOT_PAID' | 'ORDER_NOT_DELIVERED' | 'RETURN_WINDOW_EXPIRED' | 'NOTHING_TO_RETURN';

export interface ReturnEligibility {
  eligible: boolean;
  /** `null` khi `eligible = true` */
  reason: ReturnIneligibleReason | null;
  /** Hạn cuối gửi yêu cầu trả hàng (`delivered_at` + số ngày của chính sách đổi trả); `null` nếu đơn chưa giao */
  deadline: Date | null;
  returnWindowDays: number;
  items: { orderItemId: string; quantity: number; returnableQuantity: number }[];
}

export const RETURN_INELIGIBLE_MESSAGES: Record<ReturnIneligibleReason, string> = {
  ORDER_NOT_PAID: 'Only paid orders can be returned',
  ORDER_NOT_DELIVERED: 'Only delivered orders can be returned',
  RETURN_WINDOW_EXPIRED: 'The return period for this order has ended',
  NOTHING_TO_RETURN: 'Every item of this order is already covered by a return request',
};

/**
 * Đơn có trả hàng được không và còn trả được bao nhiêu từng dòng. Thuần tính toán (không đọc DB) để dùng chung cho
 * tra cứu của khách và lúc tạo yêu cầu.
 * @param activeQuantities số lượng đã nằm trong các yêu cầu còn hiệu lực, theo `order_items.id`
 */
export function computeReturnEligibility(params: {
  order: { paymentStatus: string; status: string; deliveredAt: Date | null };
  items: { id: string; quantity: number }[];
  activeQuantities: Map<string, number>;
  returnWindowDays: number;
  now?: Date;
}): ReturnEligibility {
  const { order, items, activeQuantities, returnWindowDays } = params;
  const now = params.now ?? new Date();

  const returnable = items.map((item) => ({
    orderItemId: item.id,
    quantity: item.quantity,
    returnableQuantity: Math.max(0, item.quantity - (activeQuantities.get(item.id) ?? 0)),
  }));
  const deadline = order.deliveredAt ? new Date(order.deliveredAt.getTime() + returnWindowDays * MS_PER_DAY) : null;

  let reason: ReturnIneligibleReason | null = null;
  if (order.paymentStatus !== 'paid') reason = 'ORDER_NOT_PAID';
  else if (!RETURNABLE_ORDER_STATUSES.includes(order.status) || !deadline) reason = 'ORDER_NOT_DELIVERED';
  else if (now.getTime() > deadline.getTime()) reason = 'RETURN_WINDOW_EXPIRED';
  else if (!returnable.some((item) => item.returnableQuantity > 0)) reason = 'NOTHING_TO_RETURN';

  return { eligible: reason === null, reason, deadline, returnWindowDays, items: returnable };
}
