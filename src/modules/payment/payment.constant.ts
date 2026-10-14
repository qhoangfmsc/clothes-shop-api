/** Trạng thái phiên thanh toán (`payment_attempts.status`) — cũng là giá trị API status trả về */
export const PAYMENT_ATTEMPT_STATUSES = ['PENDING', 'PAID', 'EXPIRED', 'CANCELLED'] as const;
export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number];

/**
 * Kết quả đối chiếu một giao dịch ngân hàng (`payment_transactions.verification_status`)
 * - MATCHED: khớp phiên, đúng tiền, đúng hạn → đơn được đánh dấu paid
 * - UNMATCHED: không có mã `DH...` hoặc mã không thuộc phiên nào
 * - ACCOUNT_MISMATCH: tiền vào tài khoản khác tài khoản cấu hình / tài khoản của phiên
 * - AMOUNT_MISMATCH: sai số tiền so với phiên
 * - LATE: đúng tiền nhưng phiên đã hết hạn — chỉ ghi nhận để đối soát
 * - NOT_PAYABLE: phiên/đơn không còn nhận thanh toán (đơn đã huỷ, phiên bị huỷ)
 * - DUPLICATE_PAYMENT: phiên/đơn đã được thanh toán trước đó (tiền đến lần 2)
 * - IGNORED: không phải giao dịch tiền vào
 * - MANUALLY_CONFIRMED: admin xác nhận thủ công (giao dịch được gắn vào đơn, hoặc ghi mới khi webhook không tới)
 */
export const PAYMENT_VERIFICATION_STATUSES = [
  'MATCHED',
  'UNMATCHED',
  'ACCOUNT_MISMATCH',
  'AMOUNT_MISMATCH',
  'LATE',
  'NOT_PAYABLE',
  'DUPLICATE_PAYMENT',
  'IGNORED',
  'MANUALLY_CONFIRMED',
] as const;
export type PaymentVerificationStatus = (typeof PAYMENT_VERIFICATION_STATUSES)[number];

export const PAYMENT_PROVIDER_SEPAY = 'sepay';
/** Giao dịch admin tự ghi khi không lấy được mã giao dịch SePay (vd chỉ có sao kê ngân hàng) */
export const PAYMENT_PROVIDER_MANUAL = 'manual';
export const MANUAL_CONFIRM_PROVIDERS = [PAYMENT_PROVIDER_SEPAY, PAYMENT_PROVIDER_MANUAL] as const;

/** Giao dịch có các trạng thái này mới được admin gắn vào đơn: tiền có thể đã về nhưng hệ thống chưa tự xác nhận */
export const CONFIRMABLE_VERIFICATION_STATUSES: readonly PaymentVerificationStatus[] = [
  'UNMATCHED',
  'AMOUNT_MISMATCH',
  'LATE',
  'NOT_PAYABLE',
];

/**
 * Yêu cầu hoàn tiền (`refunds.status`)
 * - REQUESTED: chờ cửa hàng chuyển khoản trả khách
 * - COMPLETED: admin đã chuyển và ghi mã giao dịch hoàn
 * - REJECTED: admin từ chối hoàn (có ghi lý do); có thể tạo lại yêu cầu mới
 */
export const REFUND_STATUSES = ['REQUESTED', 'COMPLETED', 'REJECTED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** Vì sao phải hoàn: admin huỷ đơn đã trả (`ADMIN_CANCELLED`; khách không tự huỷ đơn đã trả) hoặc khách trả hàng đã nhận (`RETURN`) */
export const REFUND_REASONS = ['ADMIN_CANCELLED', 'RETURN'] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

/** QR hết hạn sau 30 phút kể từ lúc tạo phiên */
export const PAYMENT_QR_TTL_MS = 30 * 60 * 1000;

/** Nội dung chuyển khoản = PREFIX + 8 ký tự ngẫu nhiên (bỏ I, O, 0, 1 dễ nhầm), vd `DHG29JR5A8`; duy nhất cho từng phiên */
export const TRANSFER_CODE_BODY_LENGTH = 8;
export const TRANSFER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const TRANSFER_CODE_MAX_GENERATE_ATTEMPTS = 5;
export const DEFAULT_TRANSFER_PREFIX = 'DH';

/** Ảnh VietQR theo tài liệu SePay (`acc`, `bank`, `amount`, `des`) */
export const VIETQR_IMAGE_URL = 'https://vietqr.app/img';

/** Chữ ký SePay: header timestamp lệch quá 300 giây so với giờ server bị từ chối (chống replay) */
export const SEPAY_SIGNATURE_TOLERANCE_SECONDS = 300;
