/**
 * Trạng thái yêu cầu trả hàng (`return_requests.status`)
 * - REQUESTED: khách vừa gửi, chờ cửa hàng duyệt
 * - APPROVED: cửa hàng đồng ý, khách gửi hàng về
 * - RECEIVED: cửa hàng đã nhận và kiểm hàng; đã có yêu cầu hoàn tiền tương ứng (module payment)
 * - REFUNDED: admin đã chuyển khoản hoàn tiền xong
 * - REJECTED: cửa hàng từ chối (có lý do)
 * - CANCELLED: khách tự huỷ yêu cầu
 */
export const RETURN_STATUSES = ['REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED', 'CANCELLED'] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

/** Yêu cầu còn hiệu lực: số lượng của nó đã được tính là "đang trả", khách không trả lại phần đó lần nữa */
export const ACTIVE_RETURN_STATUSES: readonly ReturnStatus[] = ['REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED'];

/** Khách còn huỷ được yêu cầu của mình khi chưa gửi hàng tới cửa hàng */
export const CUSTOMER_CANCELLABLE_RETURN_STATUSES: readonly ReturnStatus[] = ['REQUESTED', 'APPROVED'];

/** Admin còn từ chối được khi chưa nhận hàng */
export const REJECTABLE_RETURN_STATUSES: readonly ReturnStatus[] = ['REQUESTED', 'APPROVED'];

export const RETURN_REASONS = ['WRONG_SIZE', 'CHANGED_MIND', 'DEFECTIVE', 'WRONG_ITEM', 'OTHER'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

/** Đơn phải đã giao (`delivered`) hoặc hoàn tất (`completed`) mới trả hàng được */
export const RETURNABLE_ORDER_STATUSES = ['delivered', 'completed'];

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
