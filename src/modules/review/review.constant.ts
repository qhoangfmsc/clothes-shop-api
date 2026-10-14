/**
 * Trạng thái đánh giá (`reviews.status`)
 * - PUBLISHED: hiển thị công khai (đăng ngay khi gửi, kiểm duyệt sau)
 * - HIDDEN: admin ẩn vì vi phạm (luôn kèm `moderation_note`); chỉ tác giả và admin thấy
 */
export const REVIEW_STATUSES = ['PUBLISHED', 'HIDDEN'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Cảm nhận về form/size: nhỏ hơn, đúng size, rộng hơn so với size khách đã mua */
export const REVIEW_FITS = ['small', 'true_to_size', 'large'] as const;
export type ReviewFit = (typeof REVIEW_FITS)[number];

/** Chỉ đơn đã giao hoặc hoàn tất mới được đánh giá */
export const REVIEWABLE_ORDER_STATUSES: readonly string[] = ['delivered', 'completed'];

/** Đơn đã thu tiền (kể cả đã hoàn): bằng chứng khách thực sự mua hàng */
export const REVIEWABLE_PAYMENT_STATUSES: readonly string[] = ['paid', 'refunded'];

/** Số ngày kể từ lúc giao (`orders.delivered_at`) khách còn viết được đánh giá */
export const REVIEW_WINDOW_DAYS = 30;

/** Số ngày kể từ lúc gửi khách còn sửa được đánh giá (và chỉ sửa một lần) */
export const REVIEW_EDIT_WINDOW_DAYS = 30;

/** Số ảnh tối đa của một đánh giá */
export const REVIEW_MAX_IMAGES = 5;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
