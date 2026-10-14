# return (`src/modules/return`)

> Cập nhật lần cuối: 2026-10-13

## 1. Tổng quan

Module trả hàng sau khi giao: khách gửi yêu cầu trả một phần hoặc cả đơn đã giao và đã thanh toán trong hạn đổi trả; cửa hàng duyệt, nhận và kiểm hàng; từ đó tạo yêu cầu hoàn tiền ở module [payment](payment.md). Không có luồng "đổi hàng" riêng: đổi size = trả hàng được hoàn tiền rồi khách đặt đơn mới.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/return` |
| Route prefix | `/api/returns` (khách), `/api/admin/returns` (admin) |
| Bảng DB | `return_requests`, `return_request_items`; thêm cột `delivered_at` vào `orders` ([order](order.md)) và `return_request_id` vào `refunds` ([payment](payment.md)) |
| Module phụ thuộc | `order` (entity `Order`, `OrderItem` qua `EntityManager`); `payment` (`RefundService.createForReturn` — tạo khoản hoàn); `shipping` (`ShippingConfigService` — số ngày đổi trả `returnPolicy.days`) |
| Export | `ReturnService` (module [pending-count](pending-count.md) dùng `countRequested`); các entity `ReturnRequest`, `ReturnRequestItem` được module [payment](payment.md) cập nhật khi khoản hoàn xong/bị từ chối |

## 2. Mục đích & nghiệp vụ phục vụ

- Cho khách xin trả từng dòng hàng (kèm số lượng) của đơn đã giao, không vượt số đã mua, trong hạn đổi trả tính từ lúc giao.
- Cho cửa hàng kiểm soát từng bước: duyệt/từ chối, xác nhận đã nhận hàng, chốt số lượng chấp nhận, quyết định hoàn cả phí ship hay không.
- Số tiền hoàn tính theo giá lúc đặt và theo tỷ lệ trên số tiền khách thực trả; việc chuyển khoản trả khách do admin làm và ghi nhận ở [payment](payment.md).

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Khách | `return.controller.ts` | `/api/returns` | JWT + permission | Tra cứu đơn trả được không, tạo yêu cầu, list, chi tiết, huỷ |
| Admin | `admin-return.controller.ts` | `/api/admin/returns` | JWT + permission | List, chi tiết, duyệt, từ chối, xác nhận đã nhận hàng |
| Điều kiện | `return-eligibility.util.ts` | — | nội bộ | Hàm thuần tính đơn có trả được không và số lượng còn trả được từng dòng |

## 4. Chi tiết

### 4.1 API

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/returns/eligibility/:orderId` | `RETURN_VIEW` | Đơn có trả hàng được không |
| POST | `/api/returns` | `RETURN_CREATE` | Tạo yêu cầu trả hàng |
| GET | `/api/returns` | `RETURN_VIEW` | Các yêu cầu của tôi |
| GET | `/api/returns/:returnId` | `RETURN_VIEW` | Chi tiết một yêu cầu của tôi |
| PATCH | `/api/returns/:returnId/cancel` | `RETURN_CREATE` | Huỷ yêu cầu (`REQUESTED`/`APPROVED`) |
| GET | `/api/admin/returns` | `RETURN_ADMIN_VIEW` | Danh sách mọi yêu cầu |
| GET | `/api/admin/returns/:returnId` | `RETURN_ADMIN_VIEW` | Chi tiết (đơn, khách, dòng hàng, khoản hoàn) |
| POST | `/api/admin/returns/:returnId/approve` | `RETURN_ADMIN_PROCESS` | Duyệt |
| POST | `/api/admin/returns/:returnId/reject` | `RETURN_ADMIN_PROCESS` | Từ chối |
| POST | `/api/admin/returns/:returnId/receive` | `RETURN_ADMIN_PROCESS` | Đã nhận và kiểm hàng: chốt số lượng, tạo khoản hoàn |

**GET `/api/returns/eligibility/:orderId`** → `{ data: { orderId, eligible, reason, deadline, returnWindowDays, items: [{ orderItemId, quantity, returnableQuantity }] } }`. `reason` là `null` khi `eligible = true`, ngược lại một trong `ORDER_NOT_PAID`, `ORDER_NOT_DELIVERED`, `RETURN_WINDOW_EXPIRED`, `NOTHING_TO_RETURN` (kiểm theo thứ tự này). `deadline` = `orders.delivered_at` + `returnWindowDays` ngày (`null` nếu đơn chưa giao); `returnWindowDays` đọc từ `returnPolicy.days` của `SHIPPING_CONFIG` ([shipping](shipping.md)). `returnableQuantity` = số đã mua trừ số nằm trong các yêu cầu còn hiệu lực. Đơn không thuộc user → `404` `ORDER_NOT_FOUND (1301)`.

**POST `/api/returns`** — `CreateReturnDto` (field lạ ở mọi cấp bị `ValidationPipe` từ chối), response `201` `{ data: <view khách> }`:

| Field | Ràng buộc |
|---|---|
| `orderId` | string, not empty, ≤ 16 |
| `reason` | `IsIn(RETURN_REASONS)` = `WRONG_SIZE`, `CHANGED_MIND`, `DEFECTIVE`, `WRONG_ITEM`, `OTHER` |
| `note` | tuỳ chọn, trim, ≤ 500; mặc định `''` |
| `items` | mảng không rỗng, ≤ 100; mỗi phần tử `{ orderItemId (string ≤ 16, not empty), quantity (int 1–1000) }` |

Lỗi: đơn không thuộc user → `404` `ORDER_NOT_FOUND`; đơn không đủ điều kiện → `400` `RETURN_NOT_ALLOWED (1802)` (message theo `reason` ở trên); dòng không thuộc đơn, trùng dòng, hoặc vượt số còn trả được → `400` `RETURN_ITEM_INVALID (1803)`.

**GET `/api/returns`** — `PublicReturnQueryDto` (extends `PaginationQueryDto`): `status` (`IsIn(RETURN_STATUSES)`), `orderId` (≤ 16), `sort` (whitelist `createdAt`; mặc định `-createdAt`). Chỉ các yêu cầu thuộc đơn của user. Response `paginated(...)`.

**View của khách** (list, chi tiết, tạo, huỷ):

```json
{
  "id": "…", "orderId": "…", "status": "APPROVED", "reason": "WRONG_SIZE", "note": "…", "adminNote": "…",
  "createdAt": "…", "approvedAt": "…", "receivedAt": null,
  "items": [{ "id": "…", "orderItemId": "…", "productName": "…", "productImage": "…", "size": "M", "color": "white", "price": 60, "quantity": 1, "acceptedQuantity": null }],
  "refund": { "amount": 3125000, "status": "REQUESTED", "bankReference": null, "processedAt": null }
}
```

`adminNote` là phản hồi của cửa hàng (hướng dẫn gửi hàng khi duyệt, lý do khi từ chối). `price` là giá lúc đặt (đơn vị cửa hàng); `refund.amount` là VND; `refund` là khoản hoàn mới nhất gắn với yêu cầu (`null` khi chưa nhận hàng). Không có người xử lý, đơn hay id khoản hoàn.

**GET `/api/admin/returns`** — `AdminReturnQueryDto` (extends `PaginationQueryDto`): `status`, `orderId`, `search` (≤ 255; `ILIKE` trên `return_requests.id`, `order_id`, `shipping_address->>'phone'`, `shipping_address->>'fullName'`), `sort` (whitelist `createdAt`, `updatedAt`; mặc định `-createdAt`). **View admin** = view khách + `requestedBy`, `processedBy`, `shippingRefunded`, `updatedAt`, `refund.id`, và `order: { id, status, paymentStatus, total, shippingFee, deliveredAt, userId, customer: { fullName, phone } }`.

**POST `/api/admin/returns/:returnId/approve`** — `ApproveReturnDto`: `note` tuỳ chọn (trim, ≤ 500). **`/reject`** — `RejectReturnDto`: `note` bắt buộc (trim, not empty, ≤ 500). **`/receive`** — `ReceiveReturnDto`, tất cả tuỳ chọn:

| Field | Ràng buộc |
|---|---|
| `items` | mảng ≤ 100 `{ returnItemId (string ≤ 16), acceptedQuantity (int 0–1000) }`; dòng không nêu = chấp nhận đủ số xin trả |
| `refundShipping` | boolean, mặc định `false`: hoàn cả phí ship của đơn |
| `note` | trim, ≤ 500; thay `adminNote` nếu có |

Mọi thao tác admin response `201` `{ data: <view admin> }`. Yêu cầu không tồn tại → `404` `RETURN_NOT_FOUND (1801)`; sai trạng thái → `400` `RETURN_INVALID_STATE (1804)`; dữ liệu nhận hàng sai → `400` `RETURN_RECEIVE_INVALID (1805)`.

### 4.2 Dữ liệu

Bảng `return_requests` (entity `ReturnRequest extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `order_id` | varchar(16) | FK `FK_return_requests_order` → `orders(id)` ON DELETE RESTRICT; index `IDX_return_requests_order_id` |
| `status` | varchar(10) | default `REQUESTED`; `CK_return_requests_status` ∈ 6 trạng thái ở 4.4; index `IDX_return_requests_status` |
| `reason` | varchar(20) | `CK_return_requests_reason` ∈ `RETURN_REASONS` |
| `note` | varchar(500) | default `''` — ghi chú của khách |
| `admin_note` | varchar(500) | nullable — phản hồi cho khách |
| `requested_by` | varchar(16) | nullable; FK `FK_return_requests_requested_by` → `users(id)` ON DELETE SET NULL |
| `processed_by` | varchar(16) | nullable; FK `FK_return_requests_processed_by` → `users(id)` ON DELETE SET NULL; admin xử lý gần nhất |
| `approved_at`, `received_at` | timestamptz | nullable |
| `shipping_refunded` | boolean | default `false`; phí ship của đơn đã tính vào khoản hoàn của yêu cầu này |
| `created_at`, `updated_at` | timestamptz | index `IDX_return_requests_created_at` trên `created_at DESC` |

Bảng `return_request_items` (entity `ReturnRequestItem extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `return_request_id` | varchar(16) | FK `FK_return_request_items_request` → `return_requests(id)` ON DELETE CASCADE |
| `order_item_id` | varchar(16) | FK `FK_return_request_items_order_item` → `order_items(id)` ON DELETE RESTRICT; index `IDX_return_request_items_order_item_id` |
| `quantity` | int | số khách xin trả; `CK_return_request_items_quantity >= 1` |
| `accepted_quantity` | int | nullable (điền lúc nhận hàng); `CK_return_request_items_accepted`: NULL hoặc `0 ≤ accepted_quantity ≤ quantity` |
| `created_at`, `updated_at` | timestamptz | |

`UQ_return_request_items_request_and_item` UNIQUE (`return_request_id`, `order_item_id`): một dòng đơn chỉ xuất hiện một lần trong một yêu cầu.

Cột liên quan ở bảng khác: `orders.delivered_at` (timestamptz, nullable, `CK_orders_delivered_at`: đơn `delivered`/`completed` phải có giá trị; xem [order](order.md)); `refunds.return_request_id` (FK `FK_refunds_return_request` → `return_requests(id)` ON DELETE RESTRICT, `CK_refunds_return_request`: `(reason = 'RETURN') = (return_request_id IS NOT NULL)`; xem [payment](payment.md)).

### 4.3 Validation (3 tầng)

- **DTO**: như 4.1 (`@IsIn(RETURN_REASONS)`, `@ArrayNotEmpty`, `@ArrayMaxSize`, `@ValidateNested` + `@Type`, `@IsInt` + `@Min`/`@Max`, `@Transform` trim).
- **Service**: đơn thuộc user; điều kiện trả hàng (đã `paid`, `delivered`/`completed`, còn hạn, còn số lượng) tính ở `computeReturnEligibility`; từng dòng thuộc đơn, không trùng, không vượt `returnableQuantity`; chuyển trạng thái theo bảng ở 4.4; khi nhận hàng: số lượng chấp nhận ≤ số xin trả, tổng > 0, phí ship hoàn tối đa một lần mỗi đơn, đơn vẫn `paid`.
- **DB**: CHECK status/reason/quantity/accepted_quantity, UNIQUE (yêu cầu, dòng đơn), FK như 4.2.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

**Trạng thái** (`return_requests.status`):

| Từ | Sang | Ai / khi nào |
|---|---|---|
| `REQUESTED` | `APPROVED` | admin duyệt |
| `REQUESTED`, `APPROVED` | `REJECTED` | admin từ chối (chưa nhận hàng) |
| `REQUESTED`, `APPROVED` | `CANCELLED` | khách huỷ |
| `APPROVED` | `RECEIVED` | admin xác nhận đã nhận và kiểm hàng (tạo khoản hoàn) |
| `RECEIVED` | `REFUNDED` | tự động, khi admin ghi khoản hoàn xong (module payment) |
| `RECEIVED` | `APPROVED` | tự động, khi admin từ chối khoản hoàn (nhận lại và tạo khoản mới) |

Sai bước → `RETURN_INVALID_STATE`. `REJECTED`, `CANCELLED`, `REFUNDED` là trạng thái cuối.

**Số lượng còn trả được** (`activeQuantities`): tổng `quantity` của từng dòng đơn trong các yêu cầu `REQUESTED`, `APPROVED`, `RECEIVED`, `REFUNDED`; yêu cầu `REJECTED`/`CANCELLED` trả lại số lượng. Số tính theo số khách xin trả, không theo số chấp nhận.

**Tạo yêu cầu** (`create`): đọc `returnPolicy.days` → một transaction: khoá dòng đơn (`pessimistic_write`, theo `id` + `userId`; hai yêu cầu đồng thời cho cùng dòng hàng chạy tuần tự) → tính điều kiện → kiểm từng dòng → ghi `return_requests` (`REQUESTED`, `requested_by`) và `return_request_items`.

**Các thao tác ghi khác** (`cancel`, `approve`, `reject`, `receive`): một transaction, khoá `orders` rồi `return_requests` (order trước, như payment), kiểm trạng thái trên bản đã khoá.

**Nhận hàng** (`receive`): ngoài việc kiểm trạng thái `APPROVED` và đơn còn `paid`:

1. Số lượng chấp nhận: mặc định đủ số xin trả; `items` ghi đè từng dòng (0 đến số xin trả); tổng phải > 0 (không nhận gì thì phải từ chối yêu cầu).
2. Giá trị hoàn = Σ `order_items.price × accepted` (giá lúc đặt) + (nếu `refundShipping`) `orders.shipping_fee`, tính bằng xu (× 100). `refundShipping` bị từ chối nếu đơn đã có yêu cầu khác với `shipping_refunded = true`.
3. `RefundService.createForReturn`: số tiền VND tính theo tỷ lệ trên số tiền ngân hàng thực nhận (không quy đổi lại theo tỷ giá hiện tại) và theo luỹ kế: `prorate(đã nhận, giá trị các lần trả đã nhận trước + lần này) − prorate(đã nhận, giá trị các lần trả đã nhận trước)`, nên nhiều lần trả cộng lại đúng bằng số đã nhận, không lệch do làm tròn; hoàn đủ giá trị đơn thì đúng bằng số đã nhận; không vượt phần còn lại chưa hoàn; đơn đang có khoản hoàn `REQUESTED` khác thì từ chối (`REFUND_NOT_ALLOWED`).
4. Ghi `accepted_quantity`, `status = RECEIVED`, `received_at`, `processed_by`, `shipping_refunded`, `admin_note` (nếu có `note`).

Sau đó admin chuyển khoản và ghi khoản hoàn ở `/api/admin/refunds` ([payment](payment.md)): xong → yêu cầu trả hàng `REFUNDED`; khi tổng đã hoàn bằng số đã trả thì đơn `payment_status = refunded`.

### 4.5 Error code

| Code | Tên | Khi nào |
|---|---|---|
| 1801 | `EReturnErrorCode.RETURN_NOT_FOUND` | Yêu cầu không tồn tại hoặc không thuộc khách (HTTP 404) |
| 1802 | `RETURN_NOT_ALLOWED` | Đơn chưa trả, chưa giao, hết hạn đổi trả, hoặc mọi dòng đã nằm trong yêu cầu khác |
| 1803 | `RETURN_ITEM_INVALID` | Dòng không thuộc đơn, trùng dòng, hoặc vượt số còn trả được |
| 1804 | `RETURN_INVALID_STATE` | Thao tác không hợp lệ với trạng thái hiện tại (message nêu trạng thái và các trạng thái cho phép) |
| 1805 | `RETURN_RECEIVE_INVALID` | Số lượng chấp nhận sai / tổng bằng 0 / phí ship đã hoàn / đơn không còn `paid` |

Đơn không thuộc user dùng `ORDER_NOT_FOUND (1301)` (HTTP 404). Lỗi tạo khoản hoàn dùng mã `REFUND_NOT_ALLOWED (1712)` của [payment](payment.md).

### 4.6 Phụ thuộc & cấu hình

- `TypeOrmModule.forFeature([Order, OrderItem, ReturnRequest, ReturnRequestItem])`; `ReturnModule` import `PaymentModule` (`RefundService`) và `ShippingModule` (`ShippingConfigService`); `DataSource` cho transaction.
- Module [payment](payment.md) import entity `ReturnRequest`, `ReturnRequestItem` (không import `ReturnModule`) để cập nhật trạng thái khi khoản hoàn xong/bị từ chối.
- Quyền: `RETURN_CREATE 15000`, `RETURN_VIEW 15001` (trong `DEFAULT_USER_PERMISSIONS`), `RETURN_ADMIN_VIEW 16000`, `RETURN_ADMIN_PROCESS 16001` (admin tự có). Không có biến môi trường.

### 4.7 Test

- `return-eligibility.util.spec.ts` — điều kiện trả hàng (đã giao/đã trả, biên hạn, trừ số lượng đang trả, không âm).
- `return.service.spec.ts` — tra cứu điều kiện (hạn theo chính sách, đơn người khác), tạo yêu cầu (snapshot sản phẩm, khoá đơn, từng lý do bị từ chối, vượt số lượng, trùng dòng, số lượng được trả lại khi `REJECTED`/`CANCELLED`), khách xem/list/huỷ, admin duyệt/từ chối/list, nhận hàng (số tiền theo tỷ lệ, số lượng chấp nhận từng dòng, phí ship một lần mỗi đơn, trần theo phần còn lại, dữ liệu sai, sai trạng thái, đơn không còn `paid`, khoản hoàn đang chờ, thiếu phiên `PAID`) và các DTO.
- Nhiều lần trả hàng của một đơn cộng lại đúng số đã nhận (ba lần trả một món chia không tròn) nằm trong `return.service.spec.ts`.
- Khoản hoàn từ yêu cầu trả hàng (hoàn xong → `REFUNDED`, từ chối → về `APPROVED`, `prorateRefundAmount`) nằm trong `payment/refund.service.spec.ts`; `delivered_at` khi admin chuyển `delivered` nằm trong `order/order.service.spec.ts`.
- Các test dùng manager giả; hành vi với Postgres thật (migration, CHECK/UNIQUE, khoá dòng, các thao tác đồng thời) không có test tự động trong repo.

### 4.8 Lưu ý hiện trạng

- Chính sách đổi trả là một nguồn: số ngày lấy từ `returnPolicy.days` của `SHIPPING_CONFIG` mỗi lần kiểm (admin đổi có hiệu lực ngay); mô tả và điều kiện trong chính sách chỉ là văn bản hiển thị, hệ thống không tự kiểm (hàng sale, còn tag...). Cửa hàng duyệt từng yêu cầu.
- Hạn tính từ `orders.delivered_at`. Đơn đã `delivered`/`completed` trước khi có cột này được điền bằng `updated_at` lúc chạy migration (xấp xỉ).
- Chỉ đơn `payment_status = paid` trả được; đơn giao mà chưa thanh toán không có luồng trả hàng.
- Số lượng chấp nhận nhỏ hơn số xin trả thì phần không nhận không trả lại quyền yêu cầu lần nữa.
- Mỗi đơn chỉ có một khoản hoàn `REQUESTED` tại một thời điểm (ràng buộc của `refunds`): muốn nhận hàng của yêu cầu thứ hai thì phải xử lý xong khoản hoàn đang chờ trước.
- Chi phí gửi hàng trả về không được mô hình hoá; admin ghi hướng dẫn ở `adminNote` khi duyệt.
- Không có tồn kho nên nhận hàng trả không cộng lại kho.
- Không có thông báo (email/push) khi trạng thái yêu cầu đổi.
