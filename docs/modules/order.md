# order (`src/modules/order`)

> Cập nhật lần cuối: 2026-10-12

## 1. Tổng quan

Module đơn hàng: khách checkout từ giỏ hàng, xem lịch sử/chi tiết đơn và huỷ đơn đang chờ; admin xem mọi đơn và chuyển trạng thái đơn theo luồng cho phép.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/order` |
| Route prefix | `/api/orders` (khách), `/api/admin/orders` (admin) |
| Bảng DB | `orders`, `order_items` |
| Module phụ thuộc | `cart` (entity `Cart`, `CartItem`), `address` (entity `Address`) — đọc trực tiếp qua `EntityManager` trong transaction; `product` (qua quan hệ của `CartItem`) |
| Export | không |

## 2. Mục đích & nghiệp vụ phục vụ

- Biến giỏ hàng (toàn bộ hoặc các dòng được chọn) thành một đơn hàng với snapshot sản phẩm, địa chỉ, phí ship.
- Cho khách theo dõi đơn của mình và huỷ khi còn `pending`.
- Cho admin vận hành đơn: tìm theo mã/SĐT/tên, lọc trạng thái/khách, và đẩy trạng thái qua các bước giao hàng.

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Khách | `order.controller.ts` | `/api/orders` | JWT + permission | List (lọc status), chi tiết, checkout, huỷ |
| Admin | `admin-order.controller.ts` | `/api/admin/orders` | JWT + permission | List toàn bộ, chi tiết, cập nhật trạng thái |

## 4. Chi tiết

### 4.1 API

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/orders` | `ORDER_VIEW_LIST` | Lịch sử đơn của user |
| GET | `/api/orders/:orderId` | `ORDER_VIEW_DETAIL` | Chi tiết 1 đơn của user |
| POST | `/api/orders` | `ORDER_CREATE` | Checkout từ giỏ |
| PATCH | `/api/orders/:orderId/cancel` | `ORDER_CANCEL` | Huỷ đơn `pending` |
| GET | `/api/admin/orders` | `ORDER_ADMIN_VIEW` | Danh sách mọi đơn |
| GET | `/api/admin/orders/:orderId` | `ORDER_ADMIN_VIEW` | Chi tiết bất kỳ đơn |
| PATCH | `/api/admin/orders/:orderId/status` | `ORDER_ADMIN_UPDATE_STATUS` | Đổi trạng thái |

**GET `/api/orders`** — `PublicOrderQueryDto` (extends `PaginationQueryDto`): `status` (`IsIn(ORDER_STATUSES)`), `sort` (whitelist `createdAt`; mặc định `-createdAt`). Response `paginated(...)`, mỗi đơn kèm `items`.

**GET `/api/orders/:orderId`** → `{ data: Order(+items) }`; đơn không thuộc user hoặc không có → `404 Order not found`.

**POST `/api/orders`** — `CreateOrderDto`:

| Field | Bắt buộc | Ràng buộc |
|---|---|---|
| `addressId` | ✔ | string, not empty, ≤ 16 |
| `shippingMethod` | | `IsIn(['standard','express','store-pickup'])`, ≤ 100; mặc định `standard` |
| `note` | | string ≤ 500 |
| `cartItemIds` | | mảng string, không rỗng, ≤ 100 phần tử, không trùng, mỗi phần tử not empty ≤ 16. Bỏ trống = đặt cả giỏ; có = chỉ đặt các dòng đó |

Response `{ data: Order(+items) }`.

**PATCH `/api/orders/:orderId/cancel`** → `{ data: Order(+items) }` sau khi huỷ.

**GET `/api/admin/orders`** — `AdminOrderQueryDto`:

| Param | Ràng buộc |
|---|---|
| `userId` | string ≤ 16, lọc theo `user_id` |
| `search` | ≤ 255; `ILIKE` trên mã đơn (`id`), `shipping_address->>'phone'`, `shipping_address->>'fullName'` |
| `status` | `IsIn(ORDER_STATUSES)` |
| `sort` | whitelist `createdAt`, `total`; mặc định `-createdAt` |

Response `paginated(...)`, mỗi đơn kèm `items`.

**PATCH `/api/admin/orders/:orderId/status`** — `UpdateOrderStatusDto`: `status` (`IsString`, not empty, `IsIn(ORDER_STATUSES)`). Response `{ data: Order(+items) }`.

`ORDER_STATUSES` (khai báo ở `dtos/admin-order.dto.ts`): `pending`, `confirmed`, `shipping`, `delivered`, `completed`, `cancelled`.

### 4.2 Dữ liệu

Bảng `orders` (entity `Order extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 (cũng là mã đơn) |
| `user_id` | varchar(16) | nullable; FK `FK_orders_user` → `users(id)` ON DELETE SET NULL; index `IDX_orders_user_id` |
| `status` | varchar(20) | default `pending`; `CK_orders_status` ∈ 6 trạng thái; index `IDX_orders_status` |
| `subtotal` | decimal(10,2) | default 0; `CK_orders_subtotal >= 0` |
| `shipping_fee` | decimal(10,2) | default 0; `CK_orders_shipping_fee >= 0` |
| `total` | decimal(10,2) | default 0; `CK_orders_total >= 0` |
| `shipping_method` | varchar(100) | default `''` |
| `shipping_address` | jsonb | default `{}`; snapshot `{ fullName, phone, addressLine1, addressLine2, city, province, postalCode, country }` |
| `note` | varchar(500) | default `''` |
| `created_at`, `updated_at` | timestamptz | |

Bảng `order_items` (entity `OrderItem`, không extends `BaseEntity`, chỉ có `created_at`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 sinh ở `@BeforeInsert` |
| `order_id` | varchar(16) | FK → `orders(id)` ON DELETE CASCADE; index `IDX_order_items_order_id` |
| `product_id` | varchar(16) | nullable; FK → `products(id)` ON DELETE SET NULL; index `IDX_order_items_product_id` |
| `product_name` | varchar(255) | snapshot |
| `product_image` | varchar(500) | snapshot (ảnh đầu tiên), default `''` |
| `price` | decimal(10,2) | snapshot; `CK_order_items_price >= 0` và `CK_order_items_price_positive > 0` |
| `quantity` | int | default 1; `CK_order_items_quantity >= 1` |
| `size` | varchar(50) | default `''` |
| `color` | varchar(100) | default `''` |
| `created_at` | timestamptz | |

### 4.3 Validation (3 tầng)

- **DTO**: như 4.1 (`@IsIn` phương thức giao hàng và trạng thái; `@ArrayUnique`, `@ArrayNotEmpty`, `@ArrayMaxSize(100)` cho `cartItemIds`).
- **Service**: giỏ không rỗng; mọi `cartItemIds` phải thuộc giỏ của user; sản phẩm tồn tại và `active`; không thuộc badge `NON_ORDERABLE_BADGES`; địa chỉ thuộc user; chuyển trạng thái theo bảng `VALID_TRANSITIONS`; khách chỉ huỷ đơn của mình và chỉ khi `pending`.
- **DB**: CHECK status, subtotal/shipping_fee/total ≥ 0, price > 0, quantity ≥ 1; FK như 4.2.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

**Checkout (`checkout`)** — toàn bộ nằm trong một transaction (`DataSource.transaction`), lỗi bất kỳ bước nào sẽ rollback:

1. Nạp giỏ của user kèm `items` và `items.product`.
2. Xác định tập dòng sẽ đặt: có `cartItemIds` → lọc theo id (số dòng tìm được khác số id gửi lên → `400 Some selected cart items do not exist in your cart`); không có → cả giỏ.
3. Không có giỏ hoặc không có dòng nào → `400 Cart is empty`.
4. Dòng có sản phẩm bị xoá hoặc `status !== 'active'` → `400 Some products are no longer available: <tên>`.
5. Dòng có badge `sold_out` / `custom_order` → `ORDER_PRODUCT_NOT_ORDERABLE (1303)` kèm danh sách tên.
6. Nạp địa chỉ theo `addressId` và `userId`; không có → `404 Address not found`.
7. Tính tiền: `subtotal = Σ price × quantity` trên **các dòng đã chọn**; `shippingFee = 0` nếu `subtotal >= 150`, ngược lại theo phương thức (`standard 8`, `express 15`, `store-pickup 0`, phương thức lạ → 8); `total = subtotal + shippingFee`.
8. Tạo `Order` với `status = 'pending'`, `shippingMethod` (mặc định `standard`), `shippingAddress` (snapshot), `note` (mặc định `''`).
9. Tạo `OrderItem` cho từng dòng với snapshot `productName`, `productImage` (ảnh đầu hoặc `''`), `price`, `quantity`, `size`, `color`, `productId`.
10. Xoá khỏi giỏ **chỉ các dòng đã đặt** (đặt cả giỏ thì giỏ trống; chọn một phần thì các dòng còn lại giữ nguyên).
11. Đọc lại đơn (kèm `items`) trong transaction và trả về.

**Huỷ (khách)**: đơn phải thuộc user (`404 Order not found`), `status` phải là `pending` (`400 Only pending orders can be cancelled`), đổi sang `cancelled`.

**Đổi trạng thái (admin)** — `VALID_TRANSITIONS`:

| Từ | Sang được |
|---|---|
| `pending` | `confirmed`, `cancelled` |
| `confirmed` | `shipping`, `cancelled` |
| `shipping` | `delivered` |
| `delivered` | `completed` |
| `completed` | — (kết thúc) |
| `cancelled` | — (kết thúc) |

Không hợp lệ → `ORDER_STATUS_INVALID_TRANSITION (1302)` với message nêu trạng thái hiện tại, trạng thái đích và các bước cho phép.

### 4.5 Error code

| Code | Tên | Khi nào |
|---|---|---|
| 1301 | `ORDER_NOT_FOUND` | Admin xem/đổi trạng thái đơn không tồn tại |
| 1302 | `ORDER_STATUS_INVALID_TRANSITION` | Chuyển trạng thái sai luồng |
| 1303 | `ORDER_PRODUCT_NOT_ORDERABLE` | Checkout (và thêm giỏ) với sản phẩm `sold_out`/`custom_order` |

Phía khách các lỗi còn lại là HTTP thô: `NotFoundException` (`Order not found`, `Address not found`), `BadRequestException` (`Cart is empty`, `Some selected cart items do not exist in your cart`, `Some products are no longer available: …`, `Only pending orders can be cancelled`).

### 4.6 Phụ thuộc & cấu hình

- `TypeOrmModule.forFeature([Order, OrderItem])`; `OrderService` inject thêm `DataSource`, đọc `Cart`, `CartItem`, `Address` qua `manager`.
- Hằng số trong `order.service.ts`: `SHIPPING_FEES = { standard: 8, express: 15, 'store-pickup': 0 }`, `FREE_SHIPPING_THRESHOLD = 150`.
- Không có biến môi trường.

### 4.7 Test

- `order.service.spec.ts` — `OrderService.checkout`: đặt theo `cartItemIds` (chỉ xoá dòng đã đặt), đặt cả giỏ khi bỏ `cartItemIds`, gửi đủ id, miễn phí ship tính theo subtotal các dòng đã chọn (không theo cả giỏ) và áp dụng khi subtotal đã chọn đạt ngưỡng, từ chối sản phẩm inactive, bỏ qua sản phẩm inactive/`sold_out`/`custom_order` không được chọn, từ chối giỏ có `sold_out`, giỏ rỗng.
- `dtos/order.dto.spec.ts` — `CreateOrderDto`: nhận body không có `cartItemIds` và `cartItemIds` hợp lệ.

### 4.8 Lưu ý hiện trạng

- Ngưỡng miễn phí ship (150) áp cho mọi phương thức giao hàng, trong khi dữ liệu tĩnh ở module [shipping](shipping.md) chỉ khai báo `freeAbove` cho `standard`. Giá phí ship cũng được khai báo riêng ở hai nơi.
- Không có tồn kho: checkout không trừ số lượng và huỷ đơn không hoàn lại gì; khả năng đặt hàng chỉ dựa vào `status` và badge.
- Chưa có thanh toán hay trạng thái thanh toán; `total` chỉ là `subtotal + shippingFee`.
- `ORDER_STATUSES` được khai báo trong `dtos/admin-order.dto.ts` (cùng kiểu `OrderStatus`), không nằm trong `enum-values.constant.ts`.
- Khách huỷ đơn bằng API riêng (chỉ `pending`); admin cũng có thể chuyển `pending`/`confirmed` sang `cancelled` qua API trạng thái.
- Kích thước `size`/`color` của dòng đơn được sao chép từ giỏ nguyên văn.
- List/chi tiết admin dùng chung permission `ORDER_ADMIN_VIEW`.
