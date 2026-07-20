# Plan: Admin API — CRUD quản lý sản phẩm, danh mục, bộ sưu tập, đơn hàng, người dùng

## Tổng quan

Xây dựng admin API endpoints (`/api/admin/*`) cho phép admin (role='admin') quản lý toàn bộ hệ thống. Admin controller được đặt trong từng module hiện có, dùng chung service.

## Kiến trúc

```
src/modules/
├── product/
│   ├── product.controller.ts        # [có sẵn] GET /api/products (public)
│   ├── admin-product.controller.ts  # [MỚI] POST/PATCH/DELETE /api/admin/products
│   ├── product.service.ts           # [SỬA] thêm create/update/delete
│   ├── dtos/
│   │   └── product.dto.ts           # [MỚI] CreateProductDto, UpdateProductDto
│   └── product.module.ts            # [SỬA] thêm AdminProductController
├── category/
│   ├── category.controller.ts       # [có sẵn]
│   ├── admin-category.controller.ts # [MỚI] POST/PATCH/DELETE /api/admin/categories
│   ├── category.service.ts          # [SỬA] thêm create/update/delete
│   ├── dtos/
│   │   └── category.dto.ts          # [MỚI] CreateCategoryDto, UpdateCategoryDto
│   └── category.module.ts           # [SỬA]
├── collection/
│   ├── collection.controller.ts     # [có sẵn]
│   ├── admin-collection.controller.ts # [MỚI] POST/PATCH/DELETE /api/admin/collections
│   ├── collection.service.ts        # [SỬA] thêm create/update/delete
│   ├── dtos/
│   │   └── collection.dto.ts        # [MỚI] CreateCollectionDto, UpdateCollectionDto
│   └── collection.module.ts         # [SỬA]
├── order/
│   ├── order.controller.ts          # [có sẵn]
│   ├── admin-order.controller.ts    # [MỚI] GET/PATCH /api/admin/orders
│   ├── order.service.ts             # [SỬA] thêm findAllAdmin, findOneAdmin, updateStatus
│   ├── dtos/
│   │   ├── order.dto.ts             # [có sẵn] CreateOrderDto
│   │   └── admin-order.dto.ts       # [MỚI] UpdateOrderStatusDto
│   └── order.module.ts              # [SỬA]
└── user/
    ├── user.entity.ts               # [có sẵn]
    ├── user.service.ts              # [MỚI] findAll, findOne, update
    ├── admin-user.controller.ts     # [MỚI] GET/PATCH /api/admin/users
    ├── dtos/
    │   └── user.dto.ts              # [MỚI] UpdateUserDto
    └── user.module.ts               # [SỬA] thêm service + controller
```

## Permission codes mới

Thêm vào `Permission` enum:

```typescript
// PRODUCT ADMIN (60xx)
PRODUCT_CREATE = 6000,
PRODUCT_UPDATE = 6001,
PRODUCT_DELETE = 6002,

// CATEGORY ADMIN (70xx)
CATEGORY_CREATE = 7000,
CATEGORY_UPDATE = 7001,
CATEGORY_DELETE = 7002,

// COLLECTION ADMIN (80xx)
COLLECTION_CREATE = 8000,
COLLECTION_UPDATE = 8001,
COLLECTION_DELETE = 8002,

// ORDER ADMIN (90xx)
ORDER_ADMIN_VIEW = 9000,
ORDER_ADMIN_UPDATE_STATUS = 9001,

// USER ADMIN (100xx)
USER_ADMIN_VIEW = 10000,
USER_ADMIN_UPDATE = 10001,
```

Admin (`role='admin'`) tự động pass tất cả → không cần thêm `DEFAULT_USER_PERMISSIONS`.

## Chi tiết từng module

### 1. Product Admin (`/api/admin/products`)

**Service methods thêm vào `ProductService`:**
- `create(dto)` → tạo product mới, tự động sinh SKU nếu không có
- `update(id, dto)` → update product, tìm bằng id, throw NotFoundException nếu không có
- `delete(id)` → xoá cứng (hard delete) khỏi DB, throw NotFoundException nếu không có

**AdminProductController:**
| Method | Endpoint | Permission |
|---|---|---|
| POST | `/api/admin/products` | PRODUCT_CREATE |
| PATCH | `/api/admin/products/:id` | PRODUCT_UPDATE |
| DELETE | `/api/admin/products/:id` | PRODUCT_DELETE |

**DTOs (`product.dto.ts`):**
- `CreateProductDto` — slug, sku?, name, price, originalPrice?, images, category, subcategory, badge?, description, material, care, sizes, colors, tags, status?
- `UpdateProductDto` — tất cả field optional

### 2. Category Admin (`/api/admin/categories`)

**Service methods thêm vào `CategoryService`:**
- `create(dto)` → tạo category kèm subcategories (cascade save)
- `update(id, dto)` → update category + subcategories (xoá sub cũ, tạo lại — đơn giản nhất với cascade)
- `delete(id)` → xoá category (cascade xoá subcategories)

**AdminCategoryController:**
| Method | Endpoint | Permission |
|---|---|---|
| POST | `/api/admin/categories` | CATEGORY_CREATE |
| PATCH | `/api/admin/categories/:id` | CATEGORY_UPDATE |
| DELETE | `/api/admin/categories/:id` | CATEGORY_DELETE |

**DTOs (`category.dto.ts`):**
- `CreateSubCategoryDto` — slug, label, description?, count?
- `CreateCategoryDto` — slug, title, description?, subcategories: CreateSubCategoryDto[]
- `UpdateCategoryDto` — PartialType của CreateCategoryDto

### 3. Collection Admin (`/api/admin/collections`)

**Service methods thêm vào `CollectionService`:**
- `create(dto)` → tạo collection
- `update(id, dto)` → update collection
- `delete(id)` → xoá collection

**AdminCollectionController:**
| Method | Endpoint | Permission |
|---|---|---|
| POST | `/api/admin/collections` | COLLECTION_CREATE |
| PATCH | `/api/admin/collections/:id` | COLLECTION_UPDATE |
| DELETE | `/api/admin/collections/:id` | COLLECTION_DELETE |

**DTOs (`collection.dto.ts`):**
- `CreateCollectionDto` — slug, name, subtitle?, description?, image, productIds?, season?
- `UpdateCollectionDto` — PartialType

### 4. Order Admin (`/api/admin/orders`)

**Service methods thêm vào `OrderService`:**
- `findAllAdmin(query?)` → tất cả orders (không scope userId), có pagination, filter theo status
- `findOneAdmin(orderId)` → chi tiết order bất kỳ (không check userId)
- `updateStatus(orderId, status)` → cập nhật trạng thái đơn hàng

**AdminOrderController:**
| Method | Endpoint | Permission |
|---|---|---|
| GET | `/api/admin/orders` | ORDER_ADMIN_VIEW |
| GET | `/api/admin/orders/:orderId` | ORDER_ADMIN_VIEW |
| PATCH | `/api/admin/orders/:orderId/status` | ORDER_ADMIN_UPDATE_STATUS |

**DTOs (`admin-order.dto.ts`):**
- `UpdateOrderStatusDto` — status: 'pending' | 'confirmed' | 'shipping' | 'delivered' | 'completed' | 'cancelled'

### 5. User Admin (`/api/admin/users`)

**UserService (MỚI hoàn toàn):**
- `findAll(query?)` → danh sách users, pagination, filter theo role/status
- `findOne(id)` → chi tiết user
- `update(id, dto)` → cập nhật role, status, permissions

**AdminUserController:**
| Method | Endpoint | Permission |
|---|---|---|
| GET | `/api/admin/users` | USER_ADMIN_VIEW |
| GET | `/api/admin/users/:id` | USER_ADMIN_VIEW |
| PATCH | `/api/admin/users/:id` | USER_ADMIN_UPDATE |

**DTOs (`user.dto.ts`):**
- `UpdateUserDto` — role?, status?, permissions? (tất cả optional)

## Danh sách file đầy đủ

### File mới (13 files)

| # | File | Mô tả |
|---|---|---|
| 1 | `src/modules/product/dtos/product.dto.ts` | CreateProductDto, UpdateProductDto |
| 2 | `src/modules/product/admin-product.controller.ts` | AdminProductController |
| 3 | `src/modules/category/dtos/category.dto.ts` | CreateCategoryDto, CreateSubCategoryDto, UpdateCategoryDto |
| 4 | `src/modules/category/admin-category.controller.ts` | AdminCategoryController |
| 5 | `src/modules/collection/dtos/collection.dto.ts` | CreateCollectionDto, UpdateCollectionDto |
| 6 | `src/modules/collection/admin-collection.controller.ts` | AdminCollectionController |
| 7 | `src/modules/order/dtos/admin-order.dto.ts` | UpdateOrderStatusDto |
| 8 | `src/modules/order/admin-order.controller.ts` | AdminOrderController |
| 9 | `src/modules/user/dtos/user.dto.ts` | UpdateUserDto |
| 10 | `src/modules/user/user.service.ts` | UserService |
| 11 | `src/modules/user/admin-user.controller.ts` | AdminUserController |

### File sửa (10 files)

| # | File | Thay đổi |
|---|---|---|
| 12 | `src/common/permissions/permissions.constant.ts` | Thêm 12 permission codes mới (60xx-100xx) |
| 13 | `src/modules/product/product.service.ts` | Thêm create, update, delete |
| 14 | `src/modules/product/product.module.ts` | Thêm AdminProductController |
| 15 | `src/modules/category/category.service.ts` | Thêm create, update, delete |
| 16 | `src/modules/category/category.module.ts` | Thêm AdminCategoryController |
| 17 | `src/modules/collection/collection.service.ts` | Thêm create, update, delete |
| 18 | `src/modules/collection/collection.module.ts` | Thêm AdminCollectionController |
| 19 | `src/modules/order/order.service.ts` | Thêm findAllAdmin, findOneAdmin, updateStatus |
| 20 | `src/modules/order/order.module.ts` | Thêm AdminOrderController |
| 21 | `src/modules/user/user.module.ts` | Thêm UserService, AdminUserController |

## Luồng hoạt động

```
User login (Google) → JWT token
  → role='admin' → PermissionsGuard tự động pass mọi permission
  → Gọi POST/PATCH/DELETE /api/admin/* → Admin controller xử lý
```

## Lưu ý kỹ thuật

1. **Không cần migration mới** — tất cả bảng đã có sẵn từ schema hiện tại
2. **Product.category/subcategory là string slugs** — admin nên validate slugs tồn tại trong bảng categories
3. **Category dùng cascade** — khi create/update category, subcategories được tự động insert/update/delete qua `cascade: true`
4. **Collection.productIds** — là mảng string IDs, admin gửi trực tiếp mảng ID sản phẩm
5. **Order status flow**: pending → confirmed → shipping → delivered → completed (có thể cancel từ pending)
