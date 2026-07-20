# Plan: Hệ thống Permission cho Clothes Shop API

## Tổng quan

Setup hệ thống phân quyền (permission-based authorization) cho toàn bộ API. Mỗi API endpoint sẽ yêu cầu một hoặc nhiều permission code. User sẽ có danh sách permissions (lưu trong DB). Guard sẽ kiểm tra permissions trước khi cho phép truy cập.

## Kiến trúc

```
Request → JwtAuthGuard (kiểm tra JWT) → PermissionsGuard (kiểm tra permission) → Controller
```

- **JwtAuthGuard**: chạy trước, xác thực JWT, gắn `request.user`
- **PermissionsGuard**: chạy sau, đọc `@Permissions()` metadata trên route, kiểm tra user có đủ permission không
- **Role `admin`**: tự động có tất cả permissions (không cần khai báo trong DB)
- **Role `user`**: phải có permission được gán trong field `permissions` (JSON array)

## Các file sẽ tạo mới

### 1. `src/common/permissions/permissions.constant.ts`
File định nghĩa tất cả permissions dạng enum số, nhóm theo module.

```typescript
export enum Permission {
  // Auth / User (10xx)
  AUTH_ME = 1000,
  AUTH_REFRESH = 1001,

  // Cart (20xx)
  CART_VIEW = 2000,
  CART_ADD_ITEM = 2001,
  CART_UPDATE_ITEM = 2002,
  CART_REMOVE_ITEM = 2003,
  CART_CLEAR = 2004,

  // Order (30xx)
  ORDER_VIEW_LIST = 3000,
  ORDER_VIEW_DETAIL = 3001,
  ORDER_CREATE = 3002,
  ORDER_CANCEL = 3003,

  // Address (40xx)
  ADDRESS_VIEW = 4000,
  ADDRESS_CREATE = 4001,
  ADDRESS_UPDATE = 4002,
  ADDRESS_DELETE = 4003,

  // Wishlist (50xx)
  WISHLIST_VIEW = 5000,
  WISHLIST_ADD = 5001,
  WISHLIST_REMOVE = 5002,
  WISHLIST_CHECK = 5003,
}

// Permission mặc định cho role 'user'
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
```

### 2. `src/common/decorator/permissions.decorator.ts`
Decorator `@Permissions()` để gắn permission yêu cầu lên route handler.

```typescript
export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
```

### 3. `src/common/guards/permissions.guard.ts`
`PermissionsGuard` implements `CanActivate`:
- Nếu route có `@Public()` → skip (return true)
- Nếu route có `@Permissions(...)` → kiểm tra user có ít nhất 1 permission trong danh sách không
- Nếu route không có `@Permissions()` và không `@Public()` → **từ chối** (force explicit)
- Admin role → luôn cho phép tất cả

### 4. `src/migrations/XXXX-AddUserPermissions.ts`
Migration thêm cột `permissions` vào bảng `users`:
```sql
ALTER TABLE "users" ADD COLUMN "permissions" JSONB NOT NULL DEFAULT '[]';
```

## Các file sẽ sửa

### 5. `src/modules/user/user.entity.ts`
Thêm column:
```typescript
@Column({ type: 'jsonb', default: [] })
permissions: number[];
```

### 6. `src/modules/auth/auth.service.ts`
- Khi tạo user mới (`googleLogin`): set `permissions: DEFAULT_USER_PERMISSIONS`
- Khi return `sanitizeUser`: thêm field `permissions`

### 7. `src/modules/auth/jwt.strategy.ts`
- Không cần sửa (user đã được load từ DB với đầy đủ permissions)

### 8. `src/main.module.ts`
Thêm `PermissionsGuard` vào providers:
```typescript
{
  provide: APP_GUARD,
  useClass: PermissionsGuard,
},
```
(Phải đặt sau `JwtAuthGuard` — NestJS sẽ chạy theo thứ tự khai báo)

### 9. `src/common/exceptions/error-codes.ts`
Thêm error code cho permission:
```typescript
export enum EPermissionErrorCode {
  PERMISSION_DENIED = 9001,
  NO_PERMISSION_DEFINED = 9002,
}
```

### 10. Các Controller — Thêm `@Permissions(...)` decorator

| Controller | Endpoint | Permission(s) |
|---|---|---|
| **AuthController** | `GET /api/auth/me` | `AUTH_ME` |
| **AuthController** | `POST /api/auth/refresh` | `@Public()` giữ nguyên |
| **AuthController** | `POST /api/auth/google` | `@Public()` giữ nguyên |
| **CartController** | `GET /api/cart` | `CART_VIEW` |
| **CartController** | `POST /api/cart/items` | `CART_ADD_ITEM` |
| **CartController** | `PATCH /api/cart/items/:itemId` | `CART_UPDATE_ITEM` |
| **CartController** | `DELETE /api/cart/items/:itemId` | `CART_REMOVE_ITEM` |
| **CartController** | `DELETE /api/cart/clear` | `CART_CLEAR` |
| **OrderController** | `GET /api/orders` | `ORDER_VIEW_LIST` |
| **OrderController** | `GET /api/orders/:orderId` | `ORDER_VIEW_DETAIL` |
| **OrderController** | `POST /api/orders` | `ORDER_CREATE` |
| **OrderController** | `PATCH /api/orders/:orderId/cancel` | `ORDER_CANCEL` |
| **AddressController** | `GET /api/addresses` | `ADDRESS_VIEW` |
| **AddressController** | `POST /api/addresses` | `ADDRESS_CREATE` |
| **AddressController** | `PATCH /api/addresses/:id` | `ADDRESS_UPDATE` |
| **AddressController** | `DELETE /api/addresses/:id` | `ADDRESS_DELETE` |
| **WishlistController** | `GET /api/wishlist` | `WISHLIST_VIEW` |
| **WishlistController** | `POST /api/wishlist/:productId` | `WISHLIST_ADD` |
| **WishlistController** | `DELETE /api/wishlist/:productId` | `WISHLIST_REMOVE` |
| **WishlistController** | `GET /api/wishlist/check/:productId` | `WISHLIST_CHECK` |

Các controller `@Public()` giữ nguyên: Product, Category, Collection, Review, Shipping, SizeGuide.

## Luồng hoạt động

1. **Tạo user mới** (Google login lần đầu) → tự động gán `DEFAULT_USER_PERMISSIONS` + role `user`
2. **Admin**: set role = `admin` → tự động pass tất cả permission checks
3. **User thường**: permissions được lưu trong DB, có thể custom qua admin tool sau này
4. **Mỗi request**: JwtAuthGuard xác thực → PermissionsGuard kiểm tra permission → Controller xử lý

## Migration strategy

- Migration mới: `AddUserPermissions<Timestamp>` thêm cột `permissions JSONB DEFAULT '[]'`
- User hiện có: sau migration, permissions = `[]` (rỗng). Cần chạy script bổ sung `DEFAULT_USER_PERMISSIONS` cho các user có role = `user` (thêm query trong migration).
