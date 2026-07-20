/**
 * Permission System
 *
 * Mỗi permission là một mã số duy nhất, nhóm theo module.
 * Format: [MM][SS]
 * - MM: Module prefix (2 chữ số)
 * - SS: Sequence trong module (2 chữ số)
 *
 * Sử dụng trong controller:
 *   @Permissions(Permission.CART_VIEW)
 *   @Get()
 *   getCart() { ... }
 */

export enum Permission {
  // ============================================
  // AUTH / USER MODULE (10xx)
  // ============================================
  AUTH_ME = 1000,
  AUTH_REFRESH = 1001,

  // ============================================
  // CART MODULE (20xx)
  // ============================================
  CART_VIEW = 2000,
  CART_ADD_ITEM = 2001,
  CART_UPDATE_ITEM = 2002,
  CART_REMOVE_ITEM = 2003,
  CART_CLEAR = 2004,

  // ============================================
  // ORDER MODULE (30xx)
  // ============================================
  ORDER_VIEW_LIST = 3000,
  ORDER_VIEW_DETAIL = 3001,
  ORDER_CREATE = 3002,
  ORDER_CANCEL = 3003,

  // ============================================
  // ADDRESS MODULE (40xx)
  // ============================================
  ADDRESS_VIEW = 4000,
  ADDRESS_CREATE = 4001,
  ADDRESS_UPDATE = 4002,
  ADDRESS_DELETE = 4003,

  // ============================================
  // WISHLIST MODULE (50xx)
  // ============================================
  WISHLIST_VIEW = 5000,
  WISHLIST_ADD = 5001,
  WISHLIST_REMOVE = 5002,
  WISHLIST_CHECK = 5003,

  // ============================================
  // PRODUCT ADMIN (60xx)
  // ============================================
  PRODUCT_CREATE = 6000,
  PRODUCT_UPDATE = 6001,
  PRODUCT_DELETE = 6002,

  // ============================================
  // CATEGORY ADMIN (70xx)
  // ============================================
  CATEGORY_CREATE = 7000,
  CATEGORY_UPDATE = 7001,
  CATEGORY_DELETE = 7002,

  // ============================================
  // COLLECTION ADMIN (80xx)
  // ============================================
  COLLECTION_CREATE = 8000,
  COLLECTION_UPDATE = 8001,
  COLLECTION_DELETE = 8002,

  // ============================================
  // ORDER ADMIN (90xx)
  // ============================================
  ORDER_ADMIN_VIEW = 9000,
  ORDER_ADMIN_UPDATE_STATUS = 9001,

  // ============================================
  // USER ADMIN (100xx)
  // ============================================
  USER_ADMIN_VIEW = 10000,
  USER_ADMIN_UPDATE = 10001,
}

/**
 * Permissions mặc định cho role 'user' (customer thông thường).
 * Admin (role='admin') tự động có tất cả permissions, không cần khai báo ở đây.
 */
export const DEFAULT_USER_PERMISSIONS: Permission[] = [
  Permission.AUTH_ME,
  Permission.AUTH_REFRESH,

  Permission.CART_VIEW,
  Permission.CART_ADD_ITEM,
  Permission.CART_UPDATE_ITEM,
  Permission.CART_REMOVE_ITEM,
  Permission.CART_CLEAR,

  Permission.ORDER_VIEW_LIST,
  Permission.ORDER_VIEW_DETAIL,
  Permission.ORDER_CREATE,
  Permission.ORDER_CANCEL,

  Permission.ADDRESS_VIEW,
  Permission.ADDRESS_CREATE,
  Permission.ADDRESS_UPDATE,
  Permission.ADDRESS_DELETE,

  Permission.WISHLIST_VIEW,
  Permission.WISHLIST_ADD,
  Permission.WISHLIST_REMOVE,
  Permission.WISHLIST_CHECK,
];
