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
  PRODUCT_SIZES_REQUIRED = 1006,
  PRODUCT_COLORS_REQUIRED = 1007,
  PRODUCT_IMAGES_REQUIRED = 1008,
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
}

// ============================================
// USER MODULE ERRORS (14xx)
// ============================================
export enum EUserErrorCode {
  USER_NOT_FOUND = 1401,
  USER_CANNOT_MODIFY_SELF = 1402,
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
  [EProductErrorCode.PRODUCT_SIZES_REQUIRED]: 'Product must have at least one size',
  [EProductErrorCode.PRODUCT_COLORS_REQUIRED]: 'Product must have at least one color',
  [EProductErrorCode.PRODUCT_IMAGES_REQUIRED]: 'Product must have at least one image',
  [EProductErrorCode.PRODUCT_INVALID_PRICE]: 'originalPrice must be greater than or equal to price',
  [ECategoryErrorCode.CATEGORY_NOT_FOUND]: 'Category not found',
  [ECategoryErrorCode.CATEGORY_SLUG_DUPLICATE]: 'Category slug already exists',
  [ECategoryErrorCode.CATEGORY_SUBSLUG_DUPLICATE]: 'Subcategory slug must be unique within a category',
  [ECategoryErrorCode.CATEGORY_HAS_PRODUCTS]: 'Cannot delete category — products still reference it',
  [ECollectionErrorCode.COLLECTION_NOT_FOUND]: 'Collection not found',
  [ECollectionErrorCode.COLLECTION_SLUG_DUPLICATE]: 'Collection slug already exists',
  [ECollectionErrorCode.COLLECTION_PRODUCT_NOT_FOUND]: 'One or more products not found',
  [EOrderErrorCode.ORDER_NOT_FOUND]: 'Order not found',
  [EOrderErrorCode.ORDER_STATUS_INVALID_TRANSITION]: 'Invalid status transition',
  [EUserErrorCode.USER_NOT_FOUND]: 'User not found',
  [EUserErrorCode.USER_CANNOT_MODIFY_SELF]: 'Cannot modify your own role or status',
};
