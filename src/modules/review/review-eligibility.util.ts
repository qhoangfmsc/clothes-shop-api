import {
  MS_PER_DAY,
  REVIEW_EDIT_WINDOW_DAYS,
  REVIEW_WINDOW_DAYS,
  REVIEWABLE_ORDER_STATUSES,
  REVIEWABLE_PAYMENT_STATUSES,
} from './review.constant';

export type ReviewIneligibleReason = 'ORDER_NOT_PAID' | 'ORDER_NOT_DELIVERED' | 'REVIEW_WINDOW_EXPIRED' | 'PRODUCT_REMOVED';

export const REVIEW_INELIGIBLE_MESSAGES: Record<ReviewIneligibleReason, string> = {
  ORDER_NOT_PAID: 'Only items of paid orders can be reviewed',
  ORDER_NOT_DELIVERED: 'Only items of delivered orders can be reviewed',
  REVIEW_WINDOW_EXPIRED: 'The review period for this order has ended',
  PRODUCT_REMOVED: 'This product is no longer available for review',
};

export interface ReviewEligibility {
  eligible: boolean;
  /** `null` khi `eligible = true` */
  reason: ReviewIneligibleReason | null;
  /** Hạn cuối viết đánh giá (`delivered_at` + `REVIEW_WINDOW_DAYS`); `null` nếu đơn chưa giao */
  deadline: Date | null;
}

/** Dòng hàng của đơn có đánh giá được không. Thuần tính toán (không đọc DB); "đã đánh giá chưa" kiểm tra riêng ở service */
export function computeReviewEligibility(params: {
  order: { paymentStatus: string; status: string; deliveredAt: Date | null };
  item: { productId: string | null };
  now?: Date;
}): ReviewEligibility {
  const { order, item } = params;
  const now = params.now ?? new Date();
  const deadline = order.deliveredAt ? new Date(order.deliveredAt.getTime() + REVIEW_WINDOW_DAYS * MS_PER_DAY) : null;

  let reason: ReviewIneligibleReason | null = null;
  if (!REVIEWABLE_PAYMENT_STATUSES.includes(order.paymentStatus)) reason = 'ORDER_NOT_PAID';
  else if (!REVIEWABLE_ORDER_STATUSES.includes(order.status) || !deadline) reason = 'ORDER_NOT_DELIVERED';
  else if (now.getTime() > deadline.getTime()) reason = 'REVIEW_WINDOW_EXPIRED';
  else if (!item.productId) reason = 'PRODUCT_REMOVED';

  return { eligible: reason === null, reason, deadline };
}

/** Hạn cuối khách còn sửa được đánh giá (tính từ lúc gửi) */
export const editDeadline = (createdAt: Date) => new Date(createdAt.getTime() + REVIEW_EDIT_WINDOW_DAYS * MS_PER_DAY);

export type ReviewEditBlock = 'HIDDEN' | 'ALREADY_EDITED' | 'EDIT_WINDOW_EXPIRED';

export const REVIEW_EDIT_BLOCK_MESSAGES: Record<ReviewEditBlock, string> = {
  HIDDEN: 'A hidden review cannot be edited',
  ALREADY_EDITED: 'A review can only be edited once',
  EDIT_WINDOW_EXPIRED: 'The edit period of this review has ended',
};

/** Vì sao khách không sửa được đánh giá; `null` = sửa được (chưa sửa lần nào, còn trong hạn sửa, chưa bị ẩn) */
export function reviewEditBlock(
  review: { createdAt: Date; editedAt: Date | null; status: string },
  now: Date = new Date(),
): ReviewEditBlock | null {
  if (review.status !== 'PUBLISHED') return 'HIDDEN';
  if (review.editedAt) return 'ALREADY_EDITED';
  if (now.getTime() > editDeadline(review.createdAt).getTime()) return 'EDIT_WINDOW_EXPIRED';
  return null;
}

/** Đánh giá không được chứa liên kết (như quy định nội dung của Amazon/ASOS): `http(s)://…` hoặc `www.…` */
const LINK_PATTERN = /(https?:\/\/|www\.)\S+/i;
export const containsLink = (...texts: (string | undefined | null)[]) => texts.some((text) => !!text && LINK_PATTERN.test(text));
