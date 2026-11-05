export const REFUND_STATUSES = ['REQUESTED', 'COMPLETED', 'REJECTED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** Vì sao phải hoàn: admin huỷ đơn đã trả (`ADMIN_CANCELLED`; khách không tự huỷ đơn đã trả) hoặc khách trả hàng đã nhận (`RETURN`) */
export const REFUND_REASONS = ['ADMIN_CANCELLED', 'RETURN'] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];
