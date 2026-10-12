/** Giá trị enum dùng chung giữa DTO create/update và query filter — khai báo 1 chỗ, không lặp literal */
export const ACTIVE_STATUSES = ['active', 'disabled'] as const;
export const USER_ROLES = ['user', 'admin'] as const;
/** Badge của product: new, sale, bestseller + trạng thái bán: sold_out (hết hàng), limited, custom_order (đặt thiết kế) */
export const PRODUCT_BADGES = ['new', 'sale', 'bestseller', 'sold_out', 'limited', 'custom_order'] as const;
