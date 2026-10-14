# order (`src/modules/order`)

> Cập nhật lần cuối: 2026-10-14

## 1. Tổng quan

Module đơn hàng: khách checkout từ giỏ hàng, xem lịch sử/chi tiết đơn và huỷ đơn chưa thanh toán còn `pending`; admin xem mọi đơn và chuyển trạng thái đơn theo luồng cho phép.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/order` |
| Route prefix | `/api/orders` (khách), `/api/admin/orders` (admin) |
| Bảng DB | `orders`, `order_items` |
| Module phụ thuộc | `cart` (entity `Cart`, `CartItem`), `address` (entity `Address`) — đọc trực tiếp qua `EntityManager` trong transaction; `product` (qua quan hệ của `CartItem`); `shipping` (`ShippingConfigService` — phí ship và ngưỡng miễn phí); `payment` (`PaymentConfigService`, `convertToVnd` — quy đổi VND cho báo giá; `PaymentService.listAttemptsForCustomer`/`cancelPendingAttempts` — các phiên thanh toán của đơn; `RefundService.listForCustomer`/`createForCancelledOrder` — hoàn tiền) |
| Export | `OrderService` (module [pending-count](pending-count.md) dùng `countNeedsAction`) |

Thanh toán (VietQR/SePay) và hoàn tiền của đơn do module [payment](payment.md) xử lý; module này chỉ giữ hai cột `payment_status`, `paid_at` trên bảng `orders` và tạo yêu cầu hoàn tiền khi đơn đã trả bị huỷ.

## 2. Mục đích & nghiệp vụ phục vụ

- Biến giỏ hàng (toàn bộ hoặc các dòng được chọn) thành một đơn hàng với snapshot sản phẩm, địa chỉ, phí ship.
- Cho khách theo dõi đơn của mình và huỷ khi cửa hàng chưa giao cho vận chuyển (đơn đã trả thì có yêu cầu hoàn tiền).
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
| POST | `/api/orders/quote` | `ORDER_CREATE` | Báo giá (subtotal, phí ship, total) cho giỏ, không tạo đơn |
| POST | `/api/orders` | `ORDER_CREATE` | Checkout từ giỏ |
| PATCH | `/api/orders/:orderId/cancel` | `ORDER_CANCEL` | Huỷ đơn: chưa trả → `pending`; đã trả → `pending`/`confirmed` (kèm yêu cầu hoàn tiền) |
| GET | `/api/admin/orders` | `ORDER_ADMIN_VIEW` | Danh sách mọi đơn |
| GET | `/api/admin/orders/:orderId` | `ORDER_ADMIN_VIEW` | Chi tiết bất kỳ đơn |
| PATCH | `/api/admin/orders/:orderId/status` | `ORDER_ADMIN_UPDATE_STATUS` | Đổi trạng thái |

**GET `/api/orders`** — `PublicOrderQueryDto` (extends `PaginationQueryDto`): `status` (`IsIn(ORDER_STATUSES)`), `sort` (whitelist `createdAt`; mặc định `-createdAt`). Response `paginated(...)`, mỗi đơn kèm `items`.

**GET `/api/orders/:orderId`** → `{ data: Order(+items) + paymentAttempts + refunds }`; đơn không thuộc user hoặc không có → `404 Order not found` (khi đó không truy vấn phiên thanh toán).

`data.paymentAttempts` là mọi nội dung chuyển khoản đã cấp cho đơn, **mới nhất trước**, kể cả mã đã hết hạn (`[]` nếu đơn chưa từng tạo QR). Do [payment](payment.md) (`PaymentService.listAttemptsForCustomer`) cung cấp:

```json
"paymentAttempts": [
  { "transferCode": "DHzAwdO9GeCxt8Dm3y", "amount": 3375000, "status": "EXPIRED", "createdAt": "...", "expiresAt": "...", "paidAt": null, "transactionRef": null }
]
```

| Field | Nội dung |
|---|---|
| `transferCode` | Nội dung chuyển khoản của phiên (`PAYMENT_TRANSFER_PREFIX` + 8 ký tự ngẫu nhiên, vd `DHG29JR5A8`); mỗi phiên một mã khác nhau và mọi mã đã cấp (kể cả đã hết hạn) đều nằm trong danh sách |
| `amount` | Số tiền VND của phiên |
| `status` | `PENDING` \| `PAID` \| `EXPIRED` \| `CANCELLED`, suy ra khi đọc cùng quy tắc với `GET /api/payments/:orderId/status`: phiên `PENDING` của đơn đã huỷ → `CANCELLED`, phiên `PENDING` quá `expiresAt` → `EXPIRED` |
| `createdAt`, `expiresAt`, `paidAt` | Thời điểm tạo, hết hạn, đã trả (`null` nếu chưa) |
| `transactionRef` | Chỉ phiên `PAID`: `provider_transaction_id` của giao dịch đã khớp (webhook `MATCHED` hoặc xác nhận thủ công `MANUALLY_CONFIRMED`), đúng giá trị lưu trong DB và admin thấy; phiên khác `null` |

Không trả số tài khoản nhận, `raw_payload`, id nội bộ hay id đơn trong từng phiên. Danh sách đơn `GET /api/orders` không có field này.

`data.refunds` là các khoản hoàn tiền của đơn, mới nhất trước (`[]` nếu chưa có). Do [payment](payment.md) (`RefundService.listForCustomer`) cung cấp:

```json
"refunds": [
  { "amount": 3375000, "status": "COMPLETED", "reason": "ADMIN_CANCELLED", "createdAt": "...", "processedAt": "...", "bankReference": "FT26287123456" }
]
```

`status` ∈ `REQUESTED` (đã có yêu cầu, chờ cửa hàng chuyển khoản trả), `COMPLETED` (đã hoàn, `bankReference` là mã giao dịch chuyển trả), `REJECTED`; `reason` ∈ `ADMIN_CANCELLED` (admin huỷ đơn đã trả), `RETURN` (trả hàng). Không có ghi chú nội bộ hay người xử lý. Khi `COMPLETED` đủ số tiền, `data.paymentStatus` là `refunded`.

**POST `/api/orders/quote`** — `QuoteOrderDto` (cũng là lớp cha của `CreateOrderDto`), cả hai field đều không bắt buộc, field khác (kể cả `addressId`) bị `ValidationPipe` từ chối:

| Field | Ràng buộc |
|---|---|
| `shippingMethod` | `IsIn(SHIPPING_METHOD_IDS)` = `standard`, `express`, `store-pickup`, ≤ 100; mặc định `standard` |
| `cartItemIds` | mảng string, không rỗng, ≤ 100 phần tử, không trùng, mỗi phần tử not empty ≤ 16. Bỏ trống = cả giỏ |

Response **HTTP 200** (không phải 201, vì không tạo gì):

```json
{ "data": { "shippingMethod": "express", "subtotal": 120, "shippingFee": 15, "total": 135, "freeShipping": false, "freeShippingThreshold": 150, "vndPerUnit": 25000, "amountVnd": 3375000 } }
```

`freeShipping` = `true` khi subtotal đạt ngưỡng miễn phí (phí ship về 0 nhờ ngưỡng); `store-pickup` có `price = 0` nhưng dưới ngưỡng vẫn là `freeShipping: false`. `freeShippingThreshold` là `null` khi admin tắt miễn phí ship. `amountVnd` = `round(total × vndPerUnit)` là số VND khách sẽ phải chuyển ở trang QR (cùng hàm quy đổi với phiên thanh toán, nên bằng `amount` của QR nếu tỷ giá không đổi giữa hai lần); `vndPerUnit` là tỷ giá `PAYMENT_VND_PER_UNIT`. Cả hai là `null` (quote vẫn trả 200) khi biến này chưa cấu hình. Kiểm tra giỏ giống checkout: id không thuộc giỏ hoặc giỏ rỗng → `400`, sản phẩm không còn bán → `400`, `sold_out`/`custom_order` → `ORDER_PRODUCT_NOT_ORDERABLE (1303)`. Không ghi DB, không xoá giỏ.

**POST `/api/orders`** — `CreateOrderDto extends QuoteOrderDto` (`shippingMethod`, `cartItemIds` như trên):

| Field | Bắt buộc | Ràng buộc |
|---|---|---|
| `addressId` | có điều kiện | string, not empty, ≤ 16 (xem bảng quy tắc bên dưới) |
| `pickupContact` | có điều kiện | object `{ fullName, phone }`: `fullName` string not empty ≤ 255, `phone` string not empty ≤ 50 (cả hai được trim; key lạ bị từ chối) |
| `note` | | string ≤ 500 |

Quy tắc `shippingMethod` ↔ `addressId` / `pickupContact` (kiểm tra ở service, sai → HTTP 400):

| `shippingMethod` | `addressId` | `pickupContact` | Kết quả |
|---|---|---|---|
| `standard` / `express` (hoặc bỏ trống) | có | không | Tạo đơn, snapshot đủ địa chỉ |
| `standard` / `express` | không | — | `ORDER_ADDRESS_REQUIRED (1304)` |
| `standard` / `express` | — | có | `ORDER_PICKUP_CONTACT_NOT_ALLOWED (1306)` |
| `store-pickup` | không | có | Tạo đơn, snapshot chỉ `{ fullName, phone }`, không tra bảng địa chỉ |
| `store-pickup` | có | không | Tạo đơn, snapshot đủ địa chỉ (giữ tương thích cách gọi cũ) |
| `store-pickup` | không | không | `ORDER_PICKUP_CONTACT_REQUIRED (1305)` |
| `store-pickup` | có | có | `ORDER_PICKUP_CONTACT_NOT_ALLOWED (1306)` (từ chối, không tự chọn một trong hai) |

Response `{ data: Order(+items) }`.

**PATCH `/api/orders/:orderId/cancel`** → cùng shape với `GET /api/orders/:orderId` (có `paymentAttempts`, `refunds`) sau khi huỷ; phiên `PENDING` của đơn vừa huỷ hiện là `CANCELLED`; đơn đã trả thì `refunds` có một khoản `REQUESTED`.

**GET `/api/admin/orders`** — `AdminOrderQueryDto`:

| Param | Ràng buộc |
|---|---|
| `userId` | string ≤ 16, lọc theo `user_id` |
| `search` | ≤ 255; `ILIKE` trên mã đơn (`id`), `shipping_address->>'phone'`, `shipping_address->>'fullName'`, và nội dung chuyển khoản của mọi phiên thanh toán của đơn (`payment_attempts.transfer_code`, kể cả mã đã hết hạn) |
| `status` | `IsIn(ORDER_STATUSES)` |
| `paymentStatus` | `IsIn(ORDER_PAYMENT_STATUSES)` = `unpaid`, `paid`, `refunded` (khai báo ở `@common/constants/enum-values.constant`); lọc theo `orders.payment_status` |
| `needsAction` | boolean tuỳ chọn (chỉ `true`/`false`, giá trị khác → 400): `true` = chỉ đơn cần admin thao tác — `status` ∈ `pending`, `confirmed`, trừ đơn `pending` + `unpaid` đang có phiên QR còn hạn; `false`/bỏ trống = không lọc. Cùng điều kiện (`ORDER_NEEDS_ACTION_SQL`) với con số `orders` của [pending-count](pending-count.md); kết hợp được với các bộ lọc khác |
| `sort` | whitelist `createdAt`, `total`; mặc định `-createdAt` |

Response `paginated(...)`, mỗi đơn kèm `items`.

**PATCH `/api/admin/orders/:orderId/status`** — `UpdateOrderStatusDto`: `status` (`IsString`, not empty, `IsIn(ORDER_STATUSES)`). Response `{ data: Order(+items) }`. Chuyển sang `cancelled` một đơn đã trả tự tạo yêu cầu hoàn tiền (xử lý ở `/api/admin/refunds`, xem [payment](payment.md)).

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
| `shipping_address` | jsonb | default `{}`; snapshot đủ `{ fullName, phone, addressLine1, addressLine2, city, province, postalCode, country }`, hoặc chỉ `{ fullName, phone }` với đơn `store-pickup` dùng `pickupContact` (các key còn lại vắng mặt) |
| `note` | varchar(500) | default `''` |
| `payment_status` | varchar(10) | default `unpaid`; `CK_orders_payment_status` ∈ `unpaid`, `paid`, `refunded`; webhook SePay hợp lệ hoặc admin xác nhận thủ công đổi sang `paid`, admin hoàn tiền xong đổi sang `refunded` (module [payment](payment.md)) |
| `delivered_at` | timestamptz | nullable; lúc admin chuyển đơn sang `delivered` (mốc tính hạn đổi trả của module [return](return.md) và hạn viết đánh giá của module [review](review.md)); `CK_orders_delivered_at`: đơn `delivered`/`completed` phải có giá trị; đơn đã giao từ trước khi có cột này được điền bằng `updated_at` |
| `paid_at` | timestamptz | nullable; `CK_orders_paid_at`: `(payment_status IN ('paid', 'refunded')) = (paid_at IS NOT NULL)` (đơn đã hoàn vẫn giữ thời điểm đã trả) |
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

- **DTO**: như 4.1 (`@IsIn` phương thức giao hàng và trạng thái; `@ArrayUnique`, `@ArrayNotEmpty`, `@ArrayMaxSize(100)` cho `cartItemIds`; `@ValidateNested` + `@Type` cho `pickupContact`).
- **Service**: giỏ không rỗng; mọi `cartItemIds` phải thuộc giỏ của user; sản phẩm tồn tại và `active`; không thuộc badge `NON_ORDERABLE_BADGES`; tổ hợp `shippingMethod`/`addressId`/`pickupContact` hợp lệ (bảng ở 4.1); địa chỉ thuộc user; chuyển trạng thái theo bảng `VALID_TRANSITIONS`; khách chỉ huỷ đơn của mình, theo bảng quy tắc huỷ ở 4.4.
- **DB**: CHECK status, payment_status (`unpaid`/`paid`/`refunded`), paid_at, subtotal/shipping_fee/total ≥ 0, price > 0, quantity ≥ 1; FK như 4.2.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

**Quote (`quote`)** — dùng chung `loadSelectedItems` (bước 1–5 của checkout) và `calculateTotals` (bước 7) với checkout, không mở transaction, không ghi gì; trả `{ shippingMethod, subtotal, shippingFee, total, freeShipping, freeShippingThreshold, vndPerUnit, amountVnd }` (hai trường cuối từ `PaymentConfigService.getVndPerUnit()` và `convertToVnd` của module [payment](payment.md)).

**Checkout (`checkout`)** — trước khi mở transaction, `resolveDelivery` kiểm tra tổ hợp phương thức/địa chỉ/người nhận (bảng ở 4.1). Phần còn lại nằm trong một transaction (`DataSource.transaction`), lỗi bất kỳ bước nào sẽ rollback:

1. Nạp giỏ của user kèm `items` và `items.product`.
2. Xác định tập dòng sẽ đặt: có `cartItemIds` → lọc theo id (số dòng tìm được khác số id gửi lên → `400 Some selected cart items do not exist in your cart`); không có → cả giỏ.
3. Không có giỏ hoặc không có dòng nào → `400 Cart is empty`.
4. Dòng có sản phẩm bị xoá hoặc `status !== 'active'` → `400 Some products are no longer available: <tên>`.
5. Dòng có badge `sold_out` / `custom_order` → `ORDER_PRODUCT_NOT_ORDERABLE (1303)` kèm danh sách tên.
6. Có `addressId`: nạp địa chỉ theo `addressId` và `userId`, không có → `404 Address not found`, snapshot đủ địa chỉ. Dùng `pickupContact`: không tra bảng địa chỉ, snapshot `{ fullName, phone }`.
7. Tính tiền: `subtotal = Σ price × quantity` trên **các dòng đã chọn**; cấu hình ship lấy từ `ShippingConfigService.get()` ([shipping](shipping.md), admin chỉnh được, đọc mỗi lần checkout): `shippingFee = 0` nếu ngưỡng miễn phí không `null` và `subtotal >= ngưỡng`, ngược lại `price` của phương thức đã chọn (mặc định `standard 8`, `express 15`, `store-pickup 0`; không tìm thấy phương thức thì dùng `price` của `standard`); `total = subtotal + shippingFee`; `subtotal` và `total` được làm tròn 2 chữ số thập phân (như cột `decimal(10,2)`), nên báo giá, số lưu trong DB và số VND của QR không lệch do nhiễu dấu phẩy động.
8. Tạo `Order` với `status = 'pending'`, `shippingMethod` (mặc định `standard`), `shippingAddress` (snapshot ở bước 6), `note` (mặc định `''`).
9. Tạo `OrderItem` cho từng dòng với snapshot `productName`, `productImage` (ảnh đầu hoặc `''`), `price`, `quantity`, `size`, `color`, `productId`.
10. Xoá khỏi giỏ **chỉ các dòng đã đặt** (đặt cả giỏ thì giỏ trống; chọn một phần thì các dòng còn lại giữ nguyên).
11. Đọc lại đơn (kèm `items`) trong transaction và trả về.

**Huỷ (khách)** — trong một transaction, khoá dòng đơn (`pessimistic_write`, cùng thứ tự khoá `order` trước với webhook thanh toán nên không đua với một khoản tiền đang được ghi nhận). Đơn không thuộc user → `404 Order not found`. Quy tắc theo `payment_status` và `status`:

| Đơn | Kết quả |
|---|---|
| `unpaid`, `pending` | Huỷ được |
| `unpaid`, trạng thái khác | `400 Only pending orders can be cancelled` |
| `paid` hoặc `refunded`, đã `cancelled` | `400 Order has already been cancelled` |
| `paid`, mọi trạng thái còn lại | `400` `ORDER_CANCEL_PAID_NOT_ALLOWED (1307)`: khách không tự huỷ đơn đã trả, phải liên hệ cửa hàng (admin huỷ và hoàn tiền) |

Khi khách huỷ: đơn → `cancelled`, rồi `PaymentService.cancelPendingAttempts` đổi các mã chuyển khoản còn chờ của đơn sang `CANCELLED` (không có khoản hoàn vì chưa thu tiền). Thanh toán thành công tự chuyển đơn `pending` sang `confirmed` ([payment](payment.md)), nên đơn đã trả không còn `pending` và khách không tự huỷ được. Admin huỷ đơn đã trả (xem bên dưới) thì hệ thống tạo yêu cầu hoàn tiền **trước** khi đổi đơn sang `cancelled` (đơn đã trả mà không có phiên `PAID` → `REFUND_NOT_ALLOWED (1712)` và không đổi gì); đơn giữ `payment_status = paid` cho tới khi admin ghi đã chuyển tiền hoàn (khi đó `refunded`).

**Đổi trạng thái (admin)** — `VALID_TRANSITIONS`:

| Từ | Sang được |
|---|---|
| `pending` | `confirmed`, `cancelled` |
| `confirmed` | `shipping`, `cancelled` |
| `shipping` | `delivered` |
| `delivered` | `completed` |
| `completed` | — (kết thúc) |
| `cancelled` | — (kết thúc) |

Không hợp lệ → `ORDER_STATUS_INVALID_TRANSITION (1302)` với message nêu trạng thái hiện tại, trạng thái đích và các bước cho phép. Việc đổi trạng thái chạy trong một transaction trên dòng đơn đã khoá (kiểm tra bước chuyển trên bản đã khoá). Chuyển sang `delivered`: ghi `delivered_at` = lúc đó (chuyển sang `completed` giữ nguyên mốc này). Chuyển sang `cancelled`: mã chuyển khoản còn chờ → `CANCELLED`, và nếu đơn đã trả thì tạo yêu cầu hoàn tiền `ADMIN_CANCELLED` (`requested_by` = admin) trong cùng transaction. Đơn từ `shipping` trở đi không huỷ được qua API này.

### 4.5 Error code

| Code | Tên | Khi nào |
|---|---|---|
| 1301 | `ORDER_NOT_FOUND` | Admin xem/đổi trạng thái đơn không tồn tại |
| 1302 | `ORDER_STATUS_INVALID_TRANSITION` | Chuyển trạng thái sai luồng |
| 1303 | `ORDER_PRODUCT_NOT_ORDERABLE` | Checkout, quote (và thêm giỏ) với sản phẩm `sold_out`/`custom_order` |
| 1304 | `ORDER_ADDRESS_REQUIRED` | Checkout `standard`/`express` thiếu `addressId` |
| 1305 | `ORDER_PICKUP_CONTACT_REQUIRED` | Checkout `store-pickup` không có cả `addressId` lẫn `pickupContact` |
| 1306 | `ORDER_PICKUP_CONTACT_NOT_ALLOWED` | `pickupContact` gửi kèm `standard`/`express`, hoặc gửi cùng `addressId` cho `store-pickup` (HTTP 400) |
| 1307 | `ORDER_CANCEL_PAID_NOT_ALLOWED` | Khách huỷ đơn đã thanh toán (HTTP 400) |

Phía khách các lỗi còn lại là HTTP thô: `NotFoundException` (`Order not found`, `Address not found`), `BadRequestException` (`Cart is empty`, `Some selected cart items do not exist in your cart`, `Some products are no longer available: …`, `Only pending orders can be cancelled`, `Order has already been cancelled`). Lỗi hoàn tiền khi huỷ đơn đã trả dùng mã 1711–1714 của module [payment](payment.md).

### 4.6 Phụ thuộc & cấu hình

- `TypeOrmModule.forFeature([Order, OrderItem])`; `OrderService` inject thêm `DataSource`, đọc `Cart`, `CartItem`, `Address` qua `manager`; huỷ/đổi trạng thái đơn chạy trong `DataSource.transaction` và gọi `PaymentService`, `RefundService` (từ `PaymentModule`) với cùng `manager`.
- Phí ship và ngưỡng miễn phí không còn là hằng số trong module này: lấy từ `SHIPPING_CONFIG` qua `ShippingConfigService` (`OrderModule` import `ShippingModule`). `CreateOrderDto.shippingMethod` dùng `SHIPPING_METHOD_IDS` từ `shipping/shipping-config.ts`.
- Không có biến môi trường.

### 4.7 Test

- `order.service.spec.ts` — `OrderService.checkout`: đặt theo `cartItemIds` (chỉ xoá dòng đã đặt), đặt cả giỏ khi bỏ `cartItemIds`, gửi đủ id, miễn phí ship tính theo subtotal các dòng đã chọn (không theo cả giỏ) và áp dụng khi subtotal đã chọn đạt ngưỡng, phí theo từng phương thức lấy từ shipping config (mặc định, giá cấu hình, ngưỡng cấu hình, ngưỡng `null` không bao giờ miễn phí, config được đọc trong checkout), từ chối sản phẩm inactive, bỏ qua sản phẩm inactive/`sold_out`/`custom_order` không được chọn, từ chối giỏ có `sold_out`, giỏ rỗng.
- `order.service.spec.ts` (tiếp) — tổ hợp phương thức/địa chỉ/`pickupContact` (tạo được, snapshot `{ fullName, phone }`, không tra địa chỉ, các tổ hợp bị từ chối với 1304/1305/1306 và không ghi gì), tổng tiền từng phương thức dưới/đạt ngưỡng và ngưỡng `null`, `quote` (số liệu, mặc định, `cartItemIds`, `freeShipping`, trùng kết quả checkout, không tác dụng phụ, kiểm tra giỏ như checkout), `amountVnd`/`vndPerUnit` của quote (làm tròn, `null` khi thiếu tỷ giá, bằng số tiền QR tạo cho đơn cùng đầu vào), và số tiền QR của đơn `express` = `(subtotal + phí express) × PAYMENT_VND_PER_UNIT` (qua `PaymentService.createQr`).
- `order.service.spec.ts` (tiếp) — luật huỷ với thanh toán: khách huỷ đơn chưa trả thì các mã chờ bị huỷ theo, đơn đã trả (mọi trạng thái) → 1307 và không đổi gì, đơn đã `confirmed` chưa trả vẫn lỗi thường, admin chuyển `cancelled` thì huỷ các mã chờ còn các chuyển khác thì không.
- `order.service.spec.ts` (tiếp) — `findOne`/`cancel` kèm `paymentAttempts`: trả đúng thứ tự do payment cung cấp, `[]` khi chưa có phiên, đơn của người khác/không tồn tại → 404 và không truy vấn phiên, `cancel` trả cùng shape.
- `order.service.spec.ts` (tiếp) — luật huỷ với hoàn tiền (dùng `RefundService` thật trên manager giả): khách huỷ đơn chưa trả (không có hoàn tiền, mã chờ → `CANCELLED`), khách không huỷ được đơn đã trả ở bất kỳ trạng thái nào (1307, không tạo hoàn), đơn đã huỷ không tạo hoàn lần hai, đơn của người khác → 404, admin huỷ đơn đã trả không có phiên `PAID` → 1712 và trạng thái giữ nguyên, admin huỷ đơn đã trả (`ADMIN_CANCELLED`, `requested_by` admin), admin huỷ đơn chưa trả, chuyển trạng thái khác không đụng thanh toán, bước chuyển sai (huỷ từ `shipping`) → 1302 không tạo hoàn, đơn lạ → 1301.
- `dtos/order.dto.spec.ts` — `CreateOrderDto` và `QuoteOrderDto`: `cartItemIds` hợp lệ/không hợp lệ, từng `shippingMethod`, phương thức lạ → 400, `pickupContact` hợp lệ/trim/thiếu/rỗng/quá dài/key lạ.

### 4.8 Lưu ý hiện trạng

- Ngưỡng miễn phí ship áp cho mọi phương thức giao hàng. Phí và ngưỡng chỉ có một nguồn (`SHIPPING_CONFIG`), tính ở một hàm duy nhất (`calculateTotals`) dùng cho cả quote và checkout; đơn đã tạo giữ nguyên `shipping_fee`/`total` khi admin đổi config.
- `orders.shipping_method` có default `''` và không có CHECK; dữ liệu hiện có chỉ chứa `standard` (đã kiểm tra), checkout luôn ghi một trong ba id nên không có migration backfill.
- Đơn `store-pickup` dùng `pickupContact` có `shipping_address` chỉ gồm `fullName`, `phone`; list/chi tiết trả `shippingAddress` thiếu các key địa chỉ. Tìm kiếm admin theo `phone`/`fullName` vẫn hoạt động.
- Không có trạng thái riêng cho đơn nhận tại cửa hàng; luồng `status` giữ nguyên.
- Không có tồn kho: checkout không trừ số lượng và huỷ đơn không hoàn lại gì; khả năng đặt hàng chỉ dựa vào `status` và badge.
- `total` chỉ là `subtotal + shippingFee`. Đơn tạo ra luôn `payment_status = 'unpaid'`; thanh toán xử lý ở module [payment](payment.md). Response đơn (khách và admin) có thêm `paymentStatus`, `paidAt`.
- Checkout không đọc hay ghi `payment_status`; khi thanh toán thành công, module [payment](payment.md) đặt `payment_status = 'paid'` và tự chuyển đơn `pending` sang `confirmed` (đơn đã `confirmed` trở đi giữ nguyên). `orders.status` là trạng thái xử lý đơn (`pending` = chờ cửa hàng xác nhận), tách khỏi `payment_status`. Đơn `cancelled` không còn tạo được QR và tiền chuyển vào đơn đã huỷ chỉ được ghi nhận để đối soát.
- `ORDER_STATUSES` được khai báo trong `dtos/admin-order.dto.ts` (cùng kiểu `OrderStatus`), không nằm trong `enum-values.constant.ts`.
- Trả hàng sau khi giao do module [return](return.md) xử lý; module này chỉ ghi `delivered_at` khi đơn sang `delivered`.
- Đánh giá sản phẩm do module [review](review.md) xử lý: nó đọc `orders` (`status`, `payment_status`, `delivered_at`) và `order_items` để cho khách đánh giá từng dòng hàng; `reviews.order_item_id` trỏ tới `order_items(id)` ON DELETE SET NULL nên xoá đơn không xoá đánh giá. Module này không đổi.
- Khách chỉ huỷ được đơn chưa thanh toán còn `pending` (bằng API riêng); đơn đã thanh toán do admin chuyển `pending`/`confirmed` sang `cancelled` qua API trạng thái. Cả hai cách đều đổi các mã chuyển khoản `PENDING` của đơn sang `CANCELLED`; riêng đơn đã thanh toán (chỉ qua admin) tạo thêm yêu cầu hoàn tiền trong cùng transaction.
- Mọi phương thức giao (kể cả `store-pickup`) đều thanh toán bằng cùng luồng QR/chuyển khoản của module [payment](payment.md); không có cách ghi nhận thanh toán tiền mặt. Admin có thể tạo mã QR cho đơn (`POST /api/admin/payments/orders/:orderId/qr`, xem [payment](payment.md)) để khách chuyển khoản ngay tại cửa hàng. Đơn không được thanh toán (webhook hoặc admin xác nhận thủ công một khoản chuyển khoản) giữ `payment_status = unpaid` dù đã giao. Hệ thống không tự chuyển tiền trả khách: admin chuyển khoản bên ngoài rồi ghi nhận ở `/api/admin/refunds` ([payment](payment.md)).
- Kích thước `size`/`color` của dòng đơn được sao chép từ giỏ nguyên văn.
- List/chi tiết admin dùng chung permission `ORDER_ADMIN_VIEW`.
