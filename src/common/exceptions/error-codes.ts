/**
 * Error Code System
 *
 * Format: [MM][EE] - 4 chữ số
 * - MM: Module prefix (2 chữ số) - unique cho mỗi module
 * - EE: Error code trong module (2 chữ số) - mô tả lỗi cụ thể
 */

// ============================================
// PRODUCT MODULE ERRORS (10xx)
// ============================================
export enum EProductErrorCode {
  PRODUCT_NOT_FOUND = 1001,
  PRODUCT_SLUG_DUPLICATE = 1002,
  PRODUCT_SKU_DUPLICATE = 1003,
  PRODUCT_CATEGORY_NOT_FOUND = 1004,
  PRODUCT_SUBCATEGORY_MISMATCH = 1005,
  PRODUCT_INVALID_PRICE = 1009,
}

// ============================================
// CATEGORY MODULE ERRORS (11xx)
// ============================================
export enum ECategoryErrorCode {
  CATEGORY_NOT_FOUND = 1101,
  CATEGORY_SLUG_DUPLICATE = 1102,
  CATEGORY_SUBSLUG_DUPLICATE = 1103,
  CATEGORY_HAS_PRODUCTS = 1104,
  CATEGORY_SUBCATEGORY_HAS_PRODUCTS = 1105,
  CATEGORY_REORDER_DUPLICATE_ID = 1106,
  CATEGORY_REORDER_INCOMPLETE = 1107,
  CATEGORY_PRIORITY_OUT_OF_RANGE = 1108,
}

// ============================================
// COLLECTION MODULE ERRORS (12xx)
// ============================================
export enum ECollectionErrorCode {
  COLLECTION_NOT_FOUND = 1201,
  COLLECTION_SLUG_DUPLICATE = 1202,
  COLLECTION_PRODUCT_NOT_FOUND = 1203,
}

// ============================================
// ORDER MODULE ERRORS (13xx)
// ============================================
export enum EOrderErrorCode {
  ORDER_NOT_FOUND = 1301,
  ORDER_STATUS_INVALID_TRANSITION = 1302,
  ORDER_PRODUCT_NOT_ORDERABLE = 1303,
  ORDER_ADDRESS_REQUIRED = 1304,
  ORDER_PICKUP_CONTACT_REQUIRED = 1305,
  ORDER_PICKUP_CONTACT_NOT_ALLOWED = 1306,
  ORDER_CANCEL_PAID_NOT_ALLOWED = 1307,
}

// ============================================
// USER MODULE ERRORS (14xx)
// ============================================
export enum EUserErrorCode {
  USER_NOT_FOUND = 1401,
  USER_CANNOT_MODIFY_SELF = 1402,
}

// ============================================
// SITE CONFIG MODULE ERRORS (15xx)
// ============================================
export enum ESiteConfigErrorCode {
  SITE_CONFIG_NOT_FOUND = 1501,
  SITE_CONFIG_KEY_INVALID = 1502,
  SITE_CONFIG_VALUE_INVALID = 1503,
}

// ============================================
// MEDIA MODULE ERRORS (16xx)
// ============================================
export enum EMediaErrorCode {
  MEDIA_NOT_CONFIGURED = 1601,
  MEDIA_FILE_REQUIRED = 1602,
  MEDIA_INVALID_TYPE = 1603,
  MEDIA_FILE_NOT_FOUND = 1604,
  MEDIA_STORAGE_ERROR = 1605,
  MEDIA_FILE_TOO_LARGE = 1606,
}

// ============================================
// PAYMENT MODULE ERRORS (17xx)
// ============================================
export enum EPaymentErrorCode {
  PAYMENT_NOT_CONFIGURED = 1701,
  PAYMENT_ORDER_NOT_PAYABLE = 1702,
  PAYMENT_ATTEMPT_NOT_FOUND = 1703,
  PAYMENT_INVALID_SIGNATURE = 1704,
  PAYMENT_INVALID_PAYLOAD = 1705,
  PAYMENT_CODE_GENERATION_FAILED = 1706,
  PAYMENT_CONFIRM_INPUT_INVALID = 1707,
  PAYMENT_TRANSACTION_NOT_FOUND = 1708,
  PAYMENT_TRANSACTION_NOT_CONFIRMABLE = 1709,
  PAYMENT_AMOUNT_MISMATCH = 1710,
  REFUND_NOT_FOUND = 1711,
  REFUND_NOT_ALLOWED = 1712,
  REFUND_NOT_PENDING = 1713,
  REFUND_REFERENCE_DUPLICATE = 1714,
}

// ============================================
// RETURN MODULE ERRORS (18xx)
// ============================================
export enum EReturnErrorCode {
  RETURN_NOT_FOUND = 1801,
  RETURN_NOT_ALLOWED = 1802,
  RETURN_ITEM_INVALID = 1803,
  RETURN_INVALID_STATE = 1804,
  RETURN_RECEIVE_INVALID = 1805,
}

// ============================================
// PERMISSION ERRORS (90xx)
// ============================================
export enum EPermissionErrorCode {
  PERMISSION_DENIED = 9001,
  NO_PERMISSION_DEFINED = 9002,
}

// ============================================
// ERROR MESSAGES - Map error code to message
// ============================================
export const ErrorMessages: Record<number, string> = {
  [EProductErrorCode.PRODUCT_NOT_FOUND]: 'Product not found',
  [EProductErrorCode.PRODUCT_SLUG_DUPLICATE]: 'Product slug already exists',
  [EProductErrorCode.PRODUCT_SKU_DUPLICATE]: 'Product SKU already exists',
  [EProductErrorCode.PRODUCT_CATEGORY_NOT_FOUND]: 'Category or subcategory not found',
  [EProductErrorCode.PRODUCT_SUBCATEGORY_MISMATCH]: 'Subcategory does not belong to the specified category',
  [EProductErrorCode.PRODUCT_INVALID_PRICE]: 'originalPrice must be greater than or equal to price',
  [ECategoryErrorCode.CATEGORY_NOT_FOUND]: 'Category not found',
  [ECategoryErrorCode.CATEGORY_SLUG_DUPLICATE]: 'Category slug already exists',
  [ECategoryErrorCode.CATEGORY_SUBSLUG_DUPLICATE]: 'Subcategory slug must be unique within a category',
  [ECategoryErrorCode.CATEGORY_HAS_PRODUCTS]: 'Cannot delete category — products still reference it',
  [ECategoryErrorCode.CATEGORY_SUBCATEGORY_HAS_PRODUCTS]: 'Cannot remove subcategory — products still reference it',
  [ECategoryErrorCode.CATEGORY_REORDER_DUPLICATE_ID]: 'Duplicate category id in reorder request',
  [ECategoryErrorCode.CATEGORY_REORDER_INCOMPLETE]: 'Reorder request must contain every category exactly once',
  [ECategoryErrorCode.CATEGORY_PRIORITY_OUT_OF_RANGE]: 'Priority is out of range',
  [ECollectionErrorCode.COLLECTION_NOT_FOUND]: 'Collection not found',
  [ECollectionErrorCode.COLLECTION_SLUG_DUPLICATE]: 'Collection slug already exists',
  [ECollectionErrorCode.COLLECTION_PRODUCT_NOT_FOUND]: 'One or more products not found',
  [EOrderErrorCode.ORDER_NOT_FOUND]: 'Order not found',
  [EOrderErrorCode.ORDER_STATUS_INVALID_TRANSITION]: 'Invalid status transition',
  [EOrderErrorCode.ORDER_PRODUCT_NOT_ORDERABLE]: 'Some products cannot be ordered (sold out or custom order)',
  [EOrderErrorCode.ORDER_ADDRESS_REQUIRED]: 'addressId is required for this shipping method',
  [EOrderErrorCode.ORDER_PICKUP_CONTACT_REQUIRED]: 'pickupContact is required for store-pickup when addressId is not sent',
  [EOrderErrorCode.ORDER_PICKUP_CONTACT_NOT_ALLOWED]: 'pickupContact is only allowed for store-pickup',
  [EOrderErrorCode.ORDER_CANCEL_PAID_NOT_ALLOWED]: 'This order has been paid and cannot be cancelled online — please contact the shop',
  [EUserErrorCode.USER_NOT_FOUND]: 'User not found',
  [EUserErrorCode.USER_CANNOT_MODIFY_SELF]: 'Cannot modify your own role or status',
  [ESiteConfigErrorCode.SITE_CONFIG_NOT_FOUND]: 'Site config not found',
  [ESiteConfigErrorCode.SITE_CONFIG_KEY_INVALID]: 'Invalid site config key',
  [ESiteConfigErrorCode.SITE_CONFIG_VALUE_INVALID]: 'Invalid site config value',
  [EMediaErrorCode.MEDIA_NOT_CONFIGURED]: 'Media storage is not configured',
  [EMediaErrorCode.MEDIA_FILE_REQUIRED]: 'Multipart field "file" is required',
  [EMediaErrorCode.MEDIA_INVALID_TYPE]: 'Unsupported file type — only JPEG, PNG, WebP, GIF, AVIF images are allowed',
  [EMediaErrorCode.MEDIA_FILE_NOT_FOUND]: 'Media file not found',
  [EMediaErrorCode.MEDIA_STORAGE_ERROR]: 'Media storage request failed',
  [EMediaErrorCode.MEDIA_FILE_TOO_LARGE]: 'File is too large for media storage',
  [EPaymentErrorCode.PAYMENT_NOT_CONFIGURED]: 'Payment is not configured',
  [EPaymentErrorCode.PAYMENT_ORDER_NOT_PAYABLE]: 'Order cannot be paid (already paid or cancelled)',
  [EPaymentErrorCode.PAYMENT_ATTEMPT_NOT_FOUND]: 'No payment session for this order',
  [EPaymentErrorCode.PAYMENT_INVALID_SIGNATURE]: 'Invalid webhook signature',
  [EPaymentErrorCode.PAYMENT_INVALID_PAYLOAD]: 'Invalid webhook payload',
  [EPaymentErrorCode.PAYMENT_CODE_GENERATION_FAILED]: 'Could not generate a unique transfer code',
  [EPaymentErrorCode.PAYMENT_CONFIRM_INPUT_INVALID]: 'Send either transactionId, or reference + amount',
  [EPaymentErrorCode.PAYMENT_TRANSACTION_NOT_FOUND]: 'Payment transaction not found',
  [EPaymentErrorCode.PAYMENT_TRANSACTION_NOT_CONFIRMABLE]: 'This transaction cannot be used to confirm the payment',
  [EPaymentErrorCode.PAYMENT_AMOUNT_MISMATCH]: 'Transaction amount does not match the amount of the payment session',
  [EPaymentErrorCode.REFUND_NOT_FOUND]: 'Refund not found',
  [EPaymentErrorCode.REFUND_NOT_ALLOWED]: 'This order cannot be refunded',
  [EPaymentErrorCode.REFUND_NOT_PENDING]: 'This refund has already been processed',
  [EPaymentErrorCode.REFUND_REFERENCE_DUPLICATE]: 'This bank reference is already used by another refund',
  [EReturnErrorCode.RETURN_NOT_FOUND]: 'Return request not found',
  [EReturnErrorCode.RETURN_NOT_ALLOWED]: 'This order cannot be returned',
  [EReturnErrorCode.RETURN_ITEM_INVALID]: 'Invalid items in the return request',
  [EReturnErrorCode.RETURN_INVALID_STATE]: 'This action is not allowed for the current status of the return request',
  [EReturnErrorCode.RETURN_RECEIVE_INVALID]: 'Invalid data to confirm the received goods',
};
