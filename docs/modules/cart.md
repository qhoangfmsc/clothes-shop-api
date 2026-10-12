# cart (`src/modules/cart`)

> Cập nhật lần cuối: 2026-10-12

## 1. Tổng quan

Module giỏ hàng của người dùng đã đăng nhập. Mỗi user có tối đa một giỏ; giỏ chứa các dòng `cart_items` theo bộ ba sản phẩm–size–màu.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/cart` |
| Route prefix | `/api/cart` |
| Bảng DB | `carts`, `cart_items` |
| Module phụ thuộc | `product` (entity `Product`) |
| Export | `CartService` |

## 2. Mục đích & nghiệp vụ phục vụ

- Khách gom sản phẩm trước khi thanh toán: thêm, đổi số lượng, xoá từng dòng, xoá sạch.
- Giỏ là nguồn dữ liệu cho checkout của module [order](order.md) (order đọc `Cart`/`CartItem` trực tiếp bằng `EntityManager` và xoá các dòng đã đặt).
- Giỏ được tạo lười (lazy) ở lần thêm sản phẩm đầu tiên.

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Cart | `cart.controller.ts` | `/api/cart` | JWT + permission | Xem giỏ, thêm/sửa/xoá dòng, xoá sạch |

## 4. Chi tiết

### 4.1 API

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/cart` | `CART_VIEW` | Giỏ hiện tại |
| POST | `/api/cart/items` | `CART_ADD_ITEM` | Thêm sản phẩm |
| PATCH | `/api/cart/items/:itemId` | `CART_UPDATE_ITEM` | Đổi số lượng |
| DELETE | `/api/cart/items/:itemId` | `CART_REMOVE_ITEM` | Xoá một dòng |
| DELETE | `/api/cart/clear` | `CART_CLEAR` | Xoá toàn bộ dòng |

**POST `/api/cart/items`** — `AddToCartDto`:

| Field | Bắt buộc | Ràng buộc |
|---|---|---|
| `productId` | ✔ | string, not empty, ≤ 16 |
| `quantity` | | int, 1–99; mặc định 1 |
| `size` | | string ≤ 50; mặc định `''` |
| `color` | | string ≤ 100; mặc định `''` |

**PATCH `/api/cart/items/:itemId`** — `UpdateCartItemDto`: `quantity` int 1–99 (bắt buộc), **đặt** số lượng (không cộng dồn).

Response của `GET`, `POST`, `PATCH`, `DELETE items/:itemId`:

```json
{ "data": {
    "id": "<cartId>",
    "items": [{ "id", "productId", "product": {Product}, "quantity", "size", "color", "lineTotal" }],
    "subtotal": 0,
    "itemCount": 0
} }
```

`lineTotal = price hiện tại của sản phẩm × quantity`; `subtotal` = tổng `lineTotal`; `itemCount` = tổng `quantity`. Chưa có giỏ (hoặc sau `clear`) → `{ data: { items: [], subtotal: 0, itemCount: 0 } }`.

### 4.2 Dữ liệu

Bảng `carts` (entity `Cart extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `user_id` | varchar(16) | UNIQUE (`UQ_carts_user`); FK → `users(id)` ON DELETE CASCADE |
| `created_at`, `updated_at` | timestamptz | |

Bảng `cart_items` (entity `CartItem extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `cart_id` | varchar(16) | FK → `carts(id)` ON DELETE CASCADE; index `IDX_cart_items_cart_id` |
| `product_id` | varchar(16) | FK → `products(id)` ON DELETE CASCADE; index `IDX_cart_items_product_id` |
| `quantity` | int | default 1; CHECK `>= 1`; `CK_cart_items_quantity_max` CHECK `<= 99` |
| `size` | varchar(50) | default `''` |
| `color` | varchar(100) | default `''` |
| `created_at`, `updated_at` | timestamptz | |

UNIQUE `UQ_cart_items_unique` trên `(cart_id, product_id, size, color)`.

### 4.3 Validation (3 tầng)

- **DTO**: như 4.1 (`@IsInt`, `@Min(1)`, `@Max(99)`, `@MaxLength`).
- **Service**: sản phẩm tồn tại và `status === 'active'`; badge không thuộc `NON_ORDERABLE_BADGES`; dòng được tìm/sửa/xoá phải thuộc giỏ của chính user.
- **DB**: UNIQUE `(cart_id, product_id, size, color)`, CHECK `quantity` 1–99, FK CASCADE.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

**Thêm (`addItem`)**:
1. Lấy hoặc tạo giỏ của user.
2. Sản phẩm không tồn tại → `PRODUCT_NOT_FOUND (1001)`, HTTP 404; `status !== 'active'` → `400 Product is not available`.
3. Badge ∈ (`sold_out`, `custom_order`) → `ORDER_PRODUCT_NOT_ORDERABLE (1303)` (cùng mã với checkout).
4. Tìm dòng trùng `(cartId, productId, size, color)`: có → cộng dồn `quantity += (dto.quantity || 1)`; chưa có → tạo dòng mới.
5. Trả về giỏ đầy đủ như `GET`.

**Sửa số lượng / xoá dòng**: giỏ của user phải tồn tại (`404 Cart not found`), dòng phải thuộc giỏ đó (`404 Cart item not found`); xong trả lại giỏ đầy đủ.

**Xoá sạch**: xoá mọi `cart_items` của giỏ (giỏ vẫn được giữ), trả giỏ rỗng.

### 4.5 Error code

| Code | Tên | Khi nào |
|---|---|---|
| 1303 | `EOrderErrorCode.ORDER_PRODUCT_NOT_ORDERABLE` | Thêm sản phẩm có badge `sold_out` / `custom_order` (mã thuộc nhóm order, dùng chung với checkout) |
| 1001 | `EProductErrorCode.PRODUCT_NOT_FOUND` | `productId` không tồn tại khi thêm vào giỏ (HTTP 404) |

Các lỗi khác là HTTP thô: `NotFoundException` (`Cart not found`, `Cart item not found`), `BadRequestException` (`Product is not available`).

### 4.6 Phụ thuộc & cấu hình

- `TypeOrmModule.forFeature([Cart, CartItem, Product])`.
- Dùng `NON_ORDERABLE_BADGES` từ `@common/constants/enum-values.constant`.
- Không có biến môi trường.

### 4.7 Test

`cart.service.spec.ts` — `CartService.addItem`: sản phẩm badge `sold_out` / `custom_order` bị từ chối với `errorCode 1303` (HTTP 400, message chứa tên sản phẩm) và không lưu gì; sản phẩm không badge hoặc badge `new`/`sale`/`bestseller`/`limited` vẫn được thêm.

### 4.8 Lưu ý hiện trạng

- `size` và `color` là chuỗi tự do, không đối chiếu với `sizes`/`colors` của sản phẩm.
- Khi cộng dồn vào dòng đã có, service không kiểm tra trần 99; tổng vượt 99 sẽ bị CHECK `CK_cart_items_quantity_max` của DB từ chối (lỗi DB, chưa map sang error code).
- `updateItem` và `getCart` không kiểm tra lại `status`/badge của sản phẩm; việc đó chỉ thực hiện khi thêm và khi checkout.
- Giá trong giỏ lấy theo giá hiện tại của sản phẩm (không lưu snapshot); snapshot chỉ được tạo khi tạo đơn hàng.
