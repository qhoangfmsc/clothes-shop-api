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
}

// ============================================
// CATEGORY MODULE ERRORS (11xx)
// ============================================
export enum ECategoryErrorCode {
  CATEGORY_NOT_FOUND = 1101,
}

// ============================================
// COLLECTION MODULE ERRORS (12xx)
// ============================================
export enum ECollectionErrorCode {
  COLLECTION_NOT_FOUND = 1201,
}

// ============================================
// ERROR MESSAGES - Map error code to message
// ============================================
export const ErrorMessages: Record<number, string> = {
  [EProductErrorCode.PRODUCT_NOT_FOUND]: 'Product not found',
  [ECategoryErrorCode.CATEGORY_NOT_FOUND]: 'Category not found',
  [ECollectionErrorCode.COLLECTION_NOT_FOUND]: 'Collection not found',
};
