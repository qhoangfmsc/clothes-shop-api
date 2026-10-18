# wishlist (`src/modules/wishlist`)

> Cập nhật lần cuối: 2026-10-16

## 1. Tổng quan

Module danh sách yêu thích của người dùng đã đăng nhập: thêm, bỏ, xem và kiểm tra một sản phẩm có nằm trong wishlist hay không.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/wishlist` |
| Route prefix | `/api/wishlist` |
| Bảng DB | `wishlists` |
| Module phụ thuộc | `product` (entity `Product`, `presentProduct`); `currency` (`CurrencyService.getVndPerUsd`, xem [currency](currency.md)) |
| Export | không |

## 2. Mục đích & nghiệp vụ phục vụ

Cho khách lưu lại các sản phẩm quan tâm và hiển thị trạng thái "đã yêu thích" trên trang sản phẩm. Dữ liệu luôn theo `user.id` của token, không nhận user id từ client.

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Wishlist | `wishlist.controller.ts` | `/api/wishlist` | JWT + permission | Xem, thêm, xoá, kiểm tra |

## 4. Chi tiết

### 4.1 API

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/wishlist` | `WISHLIST_VIEW` | Toàn bộ wishlist (không phân trang) |
| POST | `/api/wishlist/:productId` | `WISHLIST_ADD` | Thêm sản phẩm |
| DELETE | `/api/wishlist/:productId` | `WISHLIST_REMOVE` | Bỏ sản phẩm |
| GET | `/api/wishlist/check/:productId` | `WISHLIST_CHECK` | Kiểm tra có trong wishlist không |

Response:

- `GET /` → `{ data: Wishlist[] (kèm product, mới nhất trước), total }`; `product` có dạng sản phẩm của [product](product.md) (`priceVnd`, `priceUsd`, `originalPriceVnd`, `originalPriceUsd`, USD theo tỷ giá hiện tại).
- `POST /:productId` → `{ data: Wishlist, created: boolean }` (`created = false` nếu đã tồn tại từ trước).
- `DELETE /:productId` → `{ success: true }`.
- `GET /check/:productId` → `{ inWishlist: boolean }`.

### 4.2 Dữ liệu

Bảng `wishlists` (entity `Wishlist`, không extends `BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 sinh ở `@BeforeInsert` |
| `user_id` | varchar(16) | FK → `users(id)` ON DELETE CASCADE; index `IDX_wishlists_user_id` |
| `product_id` | varchar(16) | FK → `products(id)` ON DELETE CASCADE; index `IDX_wishlists_product_id` |
| `created_at` | timestamptz | |

UNIQUE `(user_id, product_id)`.

### 4.3 Validation (3 tầng)

- **DTO**: không có DTO (tham số là path param `productId`).
- **Service**: `add` kiểm tra sản phẩm tồn tại; kiểm tra đã có thì trả bản ghi cũ.
- **DB**: UNIQUE `(user_id, product_id)`, hai FK CASCADE.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

- `add`: sản phẩm không tồn tại → `PRODUCT_NOT_FOUND (1001)`, HTTP 404; đã có bản ghi → trả bản ghi đó với `created: false`; chưa có → tạo và trả `created: true`.
- `remove`: idempotent — không có bản ghi vẫn trả `{ success: true }`.
- `check`: chỉ trả có/không.

### 4.5 Error code

Không có error code riêng của module; sản phẩm không tồn tại trả `EProductErrorCode.PRODUCT_NOT_FOUND (1001)`, HTTP 404.

### 4.6 Phụ thuộc & cấu hình

`TypeOrmModule.forFeature([Wishlist, Product])`; `CurrencyModule`. Không có biến môi trường.

### 4.7 Test

Chưa có test.

### 4.8 Lưu ý hiện trạng

- `add` chỉ kiểm tra sản phẩm tồn tại, không kiểm tra `status`; `findAll` trả kèm sản phẩm kể cả `disabled`.
- Không có `GET /api/wishlist/:productId`, nên route `check/:productId` không xung đột với route khác.
