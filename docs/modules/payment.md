# payment (`src/modules/payment`)

> Cập nhật lần cuối: 2026-10-13

## 1. Tổng quan

Module thanh toán chuyển khoản VietQR qua SePay: tạo phiên thanh toán QR cho đơn hàng, nhận webhook SePay khi tiền vào tài khoản ngân hàng, đối chiếu giao dịch với phiên và đánh dấu đơn đã thanh toán. Không dùng SePay Payment Gateway / SDK chuyển trang; backend chỉ dựng URL ảnh VietQR và nhận webhook. Module cũng giữ yêu cầu hoàn tiền của đơn đã thanh toán bị huỷ: hệ thống ghi nhận và theo dõi, còn việc chuyển tiền trả khách do admin làm bên ngoài (SePay chỉ báo tiền vào).

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/payment` |
| Route prefix | `/api/payments` (khách), `/api/webhooks/sepay` (SePay gọi), `/api/admin/payments`, `/api/admin/refunds` (admin) |
| Bảng DB | `payment_attempts`, `payment_transactions`, `refunds`; thêm cột `payment_status`, `paid_at` vào `orders` (entity thuộc [order](order.md)) |
| Module phụ thuộc | `order` (entity `Order`, đọc/khoá/cập nhật qua `EntityManager`); `return` (chỉ entity `ReturnRequest`, `ReturnRequestItem`: cập nhật trạng thái khi khoản hoàn từ trả hàng xong/bị từ chối); dịch vụ ngoài: SePay (chỉ nhận webhook, không gọi API SePay) |
| Export | `PaymentConfigService`, `PaymentService`, `RefundService` (module [order](order.md) và [return](return.md) dùng) |

## 2. Mục đích & nghiệp vụ phục vụ

- Khách bấm thanh toán một đơn của mình → nhận QR chứa ngân hàng, số tài khoản, số tiền VND và mã chuyển khoản `DH...`.
- Khách chuyển khoản; SePay phát hiện tiền vào và gọi webhook; backend xác thực chữ ký rồi tự xác nhận đơn. Trạng thái `PAID` chỉ do webhook hợp lệ đặt, không do FE.
- Mọi giao dịch SePay gửi tới (kể cả không khớp đơn, sai tiền, đến trễ, trả trùng) đều được lưu để admin đối soát.
- Hàng khách trả lại ([return](return.md)): khi cửa hàng xác nhận đã nhận hàng, tạo yêu cầu hoàn `REQUESTED` (lý do `RETURN`) cho phần giá trị hàng được chấp nhận; khoản hoàn xong thì yêu cầu trả hàng thành `REFUNDED`.
- Đơn đã thanh toán bị admin huỷ tự có một yêu cầu hoàn tiền `REQUESTED`; admin chuyển khoản trả khách bằng ngân hàng rồi ghi mã giao dịch hoàn, đơn thành `payment_status = refunded`.

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Khách | `payment.controller.ts` | `/api/payments` | JWT + permission | Tạo/tái sử dụng phiên QR, xem trạng thái thanh toán của đơn |
| Webhook | `sepay-webhook.controller.ts` | `/api/webhooks` | `@Public()` + chữ ký HMAC | Nhận webhook SePay (ẩn khỏi Swagger) |
| Admin | `admin-payment.controller.ts` | `/api/admin/payments` | JWT + permission | List giao dịch ngân hàng để đối soát, xem toàn cảnh thanh toán của một đơn, xác nhận thủ công đơn đã thanh toán |
| Hoàn tiền (admin) | `admin-refund.controller.ts` | `/api/admin/refunds` | JWT + permission | List yêu cầu hoàn tiền, tạo yêu cầu cho đơn đã huỷ mà đã thu tiền, ghi đã hoàn, từ chối hoàn |

## 4. Chi tiết

### 4.1 API

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/payments/qr` | `PAYMENT_CREATE` | Tạo phiên thanh toán hoặc trả lại phiên `PENDING` còn hạn |
| GET | `/api/payments/:orderId/status` | `PAYMENT_VIEW` | Trạng thái thanh toán của đơn (chỉ đọc DB) |
| POST | `/api/webhooks/sepay` | `@Public()` (chữ ký HMAC) | Webhook SePay |
| GET | `/api/admin/payments/transactions` | `PAYMENT_ADMIN_VIEW` | Danh sách giao dịch ngân hàng |
| GET | `/api/admin/payments/attempts` | `PAYMENT_ADMIN_VIEW` | Tra cứu mọi nội dung chuyển khoản đã cấp (kể cả đã hết hạn) → đơn, khách, trạng thái, giao dịch đã gắn |
| GET | `/api/admin/payments/orders/:orderId` | `PAYMENT_ADMIN_VIEW` | Toàn cảnh thanh toán của một đơn (đơn + phiên QR + giao dịch) |
| POST | `/api/admin/payments/orders/:orderId/qr` | `PAYMENT_ADMIN_CREATE_QR` | Tạo mã QR mới cho đơn bất kỳ; mọi mã cũ của đơn hết hạn |
| POST | `/api/admin/payments/orders/:orderId/confirm` | `PAYMENT_ADMIN_CONFIRM` | Xác nhận thủ công đơn đã thanh toán |
| GET | `/api/admin/refunds` | `PAYMENT_ADMIN_VIEW` | Danh sách yêu cầu hoàn tiền |
| POST | `/api/admin/refunds` | `PAYMENT_ADMIN_REFUND` | Tạo yêu cầu hoàn cho đơn đã huỷ mà đã thanh toán |
| POST | `/api/admin/refunds/:refundId/complete` | `PAYMENT_ADMIN_REFUND` | Đã chuyển khoản hoàn: ghi mã giao dịch |
| POST | `/api/admin/refunds/:refundId/reject` | `PAYMENT_ADMIN_REFUND` | Từ chối hoàn (bắt buộc lý do) |

**POST `/api/payments/qr`** — body `CreateQrPaymentDto`: `orderId` (string, not empty, ≤ 16). Số tiền không nhận từ client (field lạ bị `ValidationPipe` từ chối). Response `201`:

```json
{ "data": { "orderId", "paymentId", "qrUrl", "amount", "bankName", "accountNumber", "accountName", "transferContent", "status", "expiresAt" } }
```

- `qrUrl` = `https://vietqr.app/img?acc=<số tài khoản>&bank=<SEPAY_RECEIVING_BANK_CODE>&amount=<VND>&des=<mã chuyển khoản>` (tham số được URL-encode).
- `amount` là số tiền VND nguyên; `transferContent` là nội dung chuyển khoản = `PAYMENT_TRANSFER_PREFIX` + 8 ký tự ngẫu nhiên, vd `DHG29JR5A8`, duy nhất cho từng phiên; `status` luôn là `PENDING` ở response này.
- Lỗi: đơn không thuộc user / không tồn tại → `404` `ORDER_NOT_FOUND (1301)`; đơn đã trả hoặc đã huỷ → `400` `PAYMENT_ORDER_NOT_PAYABLE (1702)`; thiếu cấu hình → `503` `PAYMENT_NOT_CONFIGURED (1701)`.

**GET `/api/payments/:orderId/status`** → `{ data: { orderId, status } }` với `status` ∈ `PENDING | PAID | EXPIRED | CANCELLED`. Đơn không thuộc user → `404` `ORDER_NOT_FOUND`; đơn chưa từng tạo phiên → `404` `PAYMENT_ATTEMPT_NOT_FOUND (1703)`. Quy tắc suy ra trạng thái ở 4.4.

**POST `/api/webhooks/sepay`**:

| Header | Ý nghĩa |
|---|---|
| `X-SePay-Signature` | `sha256=<hex HMAC-SHA256>` |
| `X-SePay-Timestamp` | Unix giây lúc SePay ký |

Body JSON của SePay, các field backend dùng: `id` (số hoặc chuỗi, ≤ 64 ký tự), `transferType` (`in`/`out`), `transferAmount` (số nguyên ≥ 0), `accountNumber` (chuỗi không rỗng), `code` (chuỗi hoặc null), `content` (chuỗi). Field khác SePay gửi vẫn được chấp nhận và lưu nguyên trong `raw_payload`. Không đi qua DTO/ValidationPipe vì cần giữ nguyên bytes gốc.

| Kết quả | HTTP | Body |
|---|---|---|
| Đã xử lý (khớp đơn, hoặc không khớp nhưng đã lưu để đối soát, hoặc trùng id) | `200` | `{ "success": true }` |
| Sai/thiếu chữ ký, timestamp lệch > 300 giây, không có raw body | `401` | `PAYMENT_INVALID_SIGNATURE (1704)` |
| Chữ ký đúng nhưng payload sai cấu trúc | `400` | `PAYMENT_INVALID_PAYLOAD (1705)` |
| Thiếu cấu hình webhook | `503` | `PAYMENT_NOT_CONFIGURED (1701)` |
| Lỗi hệ thống (DB…) | `500` | để SePay gửi lại |

**GET `/api/admin/payments/transactions`** — `AdminPaymentTransactionQueryDto` (extends `PaginationQueryDto`):

| Param | Ràng buộc |
|---|---|
| `orderId` | string ≤ 16, lọc theo `payment_attempts.order_id` của phiên khớp |
| `verificationStatus` | `IsIn(PAYMENT_VERIFICATION_STATUSES)` |
| `search` | ≤ 255; `ILIKE` trên `transfer_content`, `provider_transaction_id`, `payment_attempts.transfer_code` |
| `needsReview` | boolean tuỳ chọn (chỉ `true`/`false`, giá trị khác → 400): `true` = chỉ giao dịch cần admin xử lý — `verification_status` ∈ `UNMATCHED`, `AMOUNT_MISMATCH`, `LATE`, `NOT_PAYABLE` mà chưa gắn phiên nào hoặc gắn vào phiên của đơn còn `unpaid` và chưa `cancelled`; `false`/bỏ trống = không lọc. Cùng điều kiện (`TRANSACTION_NEEDS_REVIEW_SQL`) với con số `payments` của [pending-count](pending-count.md); kết hợp được với các bộ lọc khác |
| `sort` | whitelist `receivedAt`, `amount`; mặc định `-receivedAt` |

Response `paginated(...)`; mỗi phần tử là giao dịch kèm `paymentAttempt` (null nếu không khớp phiên nào). Khi có phiên, `paymentAttempt.order` chứa tóm tắt đơn `{ id, status, paymentStatus, total, userId }` (không kèm địa chỉ/sản phẩm).

**GET `/api/admin/payments/attempts`** — `AdminPaymentAttemptQueryDto` (extends `PaginationQueryDto`). Gõ đúng nội dung chuyển khoản trên sao kê (vd `DHG29JR5A8`) là biết mã thuộc đơn nào, của khách nào, đã hết hạn chưa:

| Param | Ràng buộc |
|---|---|
| `search` | ≤ 255; `ILIKE` trên `transfer_code`, `order_id`, `shipping_address->>'phone'`, `shipping_address->>'fullName'` (không phân biệt hoa/thường, khớp một phần) |
| `orderId` | string ≤ 16 |
| `status` | `IsIn(PAYMENT_ATTEMPT_STATUSES)`, lọc theo trạng thái **hiệu lực** (cùng quy tắc `resolveAttemptStatus`, viết lại bằng SQL `CASE`) |
| `sort` | whitelist `createdAt`, `expiresAt`, `amount`; mặc định `-createdAt` |

Response `paginated(...)`; mỗi phần tử: `{ id, transferCode, amount, status, createdAt, expiresAt, paidAt, order: { id, status, paymentStatus, total, userId, customer: { fullName, phone } }, transactions: [{ id, provider, providerTransactionId, amount, verificationStatus, transferContent, receivedAt }] }` (không trả `raw_payload`, số tài khoản nhận). Trước khi truy vấn, các phiên `PENDING` đã quá hạn của đơn chưa huỷ được ghi `EXPIRED` vào DB để DB phản ánh đúng thực tế.

**GET `/api/admin/payments/orders/:orderId`** → `{ data: { order, attempts, transactions } }`:

| Field | Nội dung |
|---|---|
| `order` | `{ id, userId, status, paymentStatus, paidAt, subtotal, shippingFee, total, shippingMethod, customer: { fullName, phone }, createdAt }`; `customer` lấy từ snapshot địa chỉ, là `null` từng field nếu snapshot không có |
| `attempts` | Mọi phiên thanh toán của đơn, mới nhất trước (`created_at DESC`) |
| `transactions` | Mọi giao dịch đã gắn vào các phiên đó, mới nhất trước (`received_at DESC`), gồm cả giao dịch xác nhận thủ công |

`attempts[].status` là trạng thái hiệu lực (phiên `PENDING` quá hạn hiện `EXPIRED`, đơn đã huỷ hiện `CANCELLED`), giống khách thấy. Đơn không tồn tại → `404` `ORDER_NOT_FOUND (1301)`. Giao dịch chưa khớp phiên nào (`UNMATCHED`) không có trong danh sách này; tìm ở `GET /api/admin/payments/transactions`.

**POST `/api/admin/payments/orders/:orderId/qr`** — không có body. Admin tạo mã QR cho một đơn của bất kỳ khách (vd khách thanh toán tại cửa hàng). Response `201` cùng shape với `POST /api/payments/qr` kèm `supersededTransferCodes` (các mã đang chờ vừa bị thay, `[]` nếu không có). Luôn tạo mã **mới**, khác với API của khách (dùng lại mã còn hạn). Đơn không tồn tại → `404` `ORDER_NOT_FOUND (1301)`; đơn đã trả/đã hoàn/đã huỷ → `400` `PAYMENT_ORDER_NOT_PAYABLE (1702)`; thiếu cấu hình → `503` `PAYMENT_NOT_CONFIGURED (1701)`.

**POST `/api/admin/payments/orders/:orderId/confirm`** — `ConfirmPaymentDto`. Gửi đúng **một** trong hai cách (khác đi → `400` `PAYMENT_CONFIRM_INPUT_INVALID (1707)`); `transferCode` chọn đúng phiên cần đánh dấu đã trả:

| Cách | Field | Dùng khi |
|---|---|---|
| Gắn giao dịch có sẵn | `transactionId` (string ≤ 16, id trong `payment_transactions`) | Webhook đã tới nhưng không tự khớp (`UNMATCHED`, `AMOUNT_MISMATCH`, `LATE`, `NOT_PAYABLE`) |
| Ghi giao dịch mới | `amount` (số nguyên VND ≥ 1) + `reference` (string ≤ 64, trim) và/hoặc `transferCode`; tuỳ chọn `provider` (`sepay` khi có `reference`, `manual` khi chỉ có `transferCode`) và `transferContent` (trim, ≤ 500) | Webhook không tới: admin đối chiếu trên dashboard SePay hoặc sao kê ngân hàng. `reference` là mã giao dịch SePay (provider `sepay`) hoặc mã tham chiếu trên sao kê (provider `manual`); bỏ `reference` thì mã giao dịch được ghi chính là `transferCode` (provider `manual`); `transferContent` là nội dung chuyển khoản đúng như sao kê |

Field chung: `transferCode` (tuỳ chọn, trim, tự viết hoa, ≤ 32 — nội dung chuyển khoản khách đã dùng, vd `DHG29JR5A8`: đánh dấu đã trả đúng phiên mang mã đó kể cả phiên đã hết hạn; bỏ trống thì dùng phiên của giao dịch đã gắn, hoặc phiên mới nhất của đơn), `note` (bắt buộc, trim, ≤ 500 — lý do/bằng chứng), `acceptAmountMismatch` (boolean, mặc định `false`). Field lạ bị từ chối. Response `201`: `{ data: { orderId, paymentStatus: 'paid', paidAt, attemptId, transaction } }`.

**GET `/api/admin/refunds`** — `AdminRefundQueryDto` (extends `PaginationQueryDto`):

| Param | Ràng buộc |
|---|---|
| `orderId` | string ≤ 16 |
| `status` | `IsIn(REFUND_STATUSES)` = `REQUESTED`, `COMPLETED`, `REJECTED` |
| `search` | ≤ 255; `ILIKE` trên `refunds.order_id`, `bank_reference`, `payment_attempts.transfer_code` (nội dung chuyển khoản khách đã dùng), `shipping_address->>'phone'`, `shipping_address->>'fullName'` |
| `sort` | whitelist `createdAt`, `processedAt`, `amount`; mặc định `-createdAt` |

Response `paginated(...)`; mỗi phần tử: `{ id, orderId, status, reason, returnRequestId, amount, createdAt, requestedBy, processedBy, processedAt, bankReference, note, order: { id, status, paymentStatus, total, userId, customer: { fullName, phone } }, payment: { transferCode, paidAmount, paidAt, provider, transactionRef, transferContent } }`. `payment` cho admin biết khoản tiền đã nhận để hoàn về đúng nguồn (`paidAmount` là số ngân hàng thực nhận): mã chuyển khoản của phiên, mã giao dịch (`provider_transaction_id`) và nội dung chuyển khoản của giao dịch đã khớp (`MATCHED` hoặc `MANUALLY_CONFIRMED`; `null` nếu không có). Không trả số tài khoản nhận hay `raw_payload`.

**POST `/api/admin/refunds`** — `CreateRefundDto`: `orderId` (string, not empty, ≤ 16). Chỉ cho đơn `cancelled` **và** `payment_status = paid` chưa có yêu cầu `REQUESTED` và chưa hoàn đủ; dùng cho đơn huỷ trước khi có luồng hoàn tiền hoặc khi yêu cầu cũ bị từ chối (`reason = ADMIN_CANCELLED`). Response `201` `{ data: <như phần tử list> }`.

**POST `/api/admin/refunds/:refundId/complete`** — `CompleteRefundDto`: `reference` (bắt buộc, trim, ≤ 64 — mã giao dịch ngân hàng của lần chuyển hoàn, lưu nguyên văn), `note` (bắt buộc, trim, ≤ 500). Field lạ bị từ chối. Response `201` `{ data: <như phần tử list> }`.

**POST `/api/admin/refunds/:refundId/reject`** — `RejectRefundDto`: `note` (bắt buộc, trim, ≤ 500 — lý do không hoàn). Response `201` `{ data: <như phần tử list> }`.

`reason` ∈ `ADMIN_CANCELLED`, `RETURN`; `returnRequestId` chỉ có khi `reason = RETURN` (yêu cầu trả hàng sinh ra khoản hoàn, xem [return](return.md)). Khách không có API hoàn tiền riêng; các khoản hoàn của đơn nằm trong `GET /api/orders/:orderId` (`data.refunds`, xem [order](order.md)).

### 4.2 Dữ liệu

Bảng `payment_attempts` (entity `PaymentAttempt extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 (`paymentId`) |
| `order_id` | varchar(16) | FK `FK_payment_attempts_order` → `orders(id)` ON DELETE RESTRICT; index `IDX_payment_attempts_order_id` |
| `transfer_code` | varchar(32) | nội dung chuyển khoản `PREFIX` + 8 ký tự ngẫu nhiên, vd `DHG29JR5A8`; `UQ_payment_attempts_transfer_code` UNIQUE — mã chỉ trỏ tới đúng một phiên/một đơn, kể cả sau khi hết hạn. Phiên không bao giờ bị xoá nên mọi mã từng cấp đều còn trong DB |
| `amount` | bigint | VND, `CK_payment_attempts_amount > 0` (entity ép về number) |
| `bank_account` | varchar(50) | số tài khoản nhận tại lúc tạo phiên |
| `status` | varchar(10) | default `PENDING`; `CK_payment_attempts_status` ∈ `PENDING, PAID, EXPIRED, CANCELLED` |
| `expires_at` | timestamptz | NOT NULL; mã bị admin thay bằng mã mới được đặt về lúc bị thay |
| `created_by` | varchar(16) | nullable; FK `FK_payment_attempts_created_by` → `users(id)` ON DELETE SET NULL; index `IDX_payment_attempts_created_by`; admin tạo mã (`POST .../qr`), `NULL` = khách tự tạo |
| `paid_at` | timestamptz | nullable; `CK_payment_attempts_paid_at`: `(status = 'PAID') = (paid_at IS NOT NULL)` |
| `created_at`, `updated_at` | timestamptz | |

Index UNIQUE từng phần: `UQ_payment_attempts_order_pending` (`order_id` WHERE `status = 'PENDING'`) và `UQ_payment_attempts_order_paid` (`order_id` WHERE `status = 'PAID'`) — mỗi đơn tối đa một phiên đang chờ và một phiên đã trả.

Bảng `payment_transactions` (entity `PaymentTransaction extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `payment_attempt_id` | varchar(16) | nullable; FK `FK_payment_transactions_attempt` → `payment_attempts(id)` ON DELETE RESTRICT; index `IDX_payment_transactions_attempt_id` |
| `provider_transaction_id` | varchar(64) | mã giao dịch **đúng nguyên văn** (id SePay, hoặc mã tham chiếu admin nhập), không thêm tiền tố; hiển thị y hệt ở DB, admin và khách |
| `provider` | varchar(20) | default `sepay`; `manual` cho giao dịch admin tự nhập. `UQ_payment_transactions_provider_and_transaction_id` UNIQUE (`provider`, `provider_transaction_id`) — khoá chống xử lý trùng |
| `amount` | bigint | số tiền SePay báo, `CK_payment_transactions_amount >= 0` |
| `transfer_content` | varchar(500) | nội dung chuyển khoản đúng như ngân hàng gửi (cắt ở 500 ký tự); giao dịch admin tự nhập thì là nội dung nhập từ sao kê, mặc định mã chuyển khoản của phiên |
| `raw_payload` | jsonb | body SePay nguyên văn (không chứa chữ ký/secret, hai thứ này ở header) |
| `received_at` | timestamptz | default `now()` |
| `verification_status` | varchar(20) | `CK_payment_transactions_verification_status` ∈ 9 giá trị (8 giá trị ở 4.4 và `MANUALLY_CONFIRMED`); index `IDX_payment_transactions_verification_status` |
| `confirmed_by` | varchar(16) | nullable; FK `FK_payment_transactions_confirmed_by` → `users(id)` ON DELETE SET NULL; admin xác nhận thủ công |
| `confirmed_at` | timestamptz | nullable; `CK_payment_transactions_confirmed`: `(verification_status = 'MANUALLY_CONFIRMED') = (confirmed_at IS NOT NULL)` |
| `confirm_note` | varchar(500) | nullable; lý do/bằng chứng admin nhập |
| `created_at`, `updated_at` | timestamptz | index `IDX_payment_transactions_received_at` trên `received_at DESC` |

Bảng `refunds` (entity `Refund extends BaseEntity`) — yêu cầu hoàn tiền; hệ thống không tự chuyển tiền:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `order_id` | varchar(16) | FK `FK_refunds_order` → `orders(id)` ON DELETE RESTRICT; index `IDX_refunds_order_id` |
| `payment_attempt_id` | varchar(16) | phiên `PAID` mà khoản hoàn trả lại; FK `FK_refunds_payment_attempt` → `payment_attempts(id)` ON DELETE RESTRICT; index `IDX_refunds_payment_attempt_id` |
| `amount` | bigint | VND, `CK_refunds_amount > 0` (entity ép về number) |
| `status` | varchar(10) | default `REQUESTED`; `CK_refunds_status` ∈ `REQUESTED`, `COMPLETED`, `REJECTED`; index `IDX_refunds_status` |
| `reason` | varchar(20) | `CK_refunds_reason` ∈ `ADMIN_CANCELLED` (admin huỷ đơn đã trả), `RETURN` (khách trả hàng đã nhận) |
| `return_request_id` | varchar(16) | nullable; FK `FK_refunds_return_request` → `return_requests(id)` ON DELETE RESTRICT; index `IDX_refunds_return_request_id`; `CK_refunds_return_request`: `(reason = 'RETURN') = (return_request_id IS NOT NULL)` |
| `requested_by` | varchar(16) | nullable; FK `FK_refunds_requested_by` → `users(id)` ON DELETE SET NULL; khách hoặc admin tạo yêu cầu |
| `processed_by` | varchar(16) | nullable; FK `FK_refunds_processed_by` → `users(id)` ON DELETE SET NULL; admin hoàn/từ chối |
| `processed_at` | timestamptz | nullable; `CK_refunds_processed_at`: `(status = 'REQUESTED') = (processed_at IS NULL)` |
| `bank_reference` | varchar(64) | nullable; mã giao dịch ngân hàng của lần chuyển hoàn, nguyên văn; `CK_refunds_completed_reference`: `COMPLETED` phải có giá trị này |
| `note` | varchar(500) | nullable; ghi chú của admin khi hoàn/từ chối (nội bộ, khách không thấy) |
| `created_at`, `updated_at` | timestamptz | index `IDX_refunds_created_at` trên `created_at DESC` |

Index UNIQUE từng phần: `UQ_refunds_order_requested` (`order_id` WHERE `status = 'REQUESTED'`) — mỗi đơn tối đa một yêu cầu đang chờ; `UQ_refunds_bank_reference` (`bank_reference` WHERE NOT NULL) — một mã giao dịch ngân hàng chỉ dùng cho một khoản hoàn.

Bảng `orders` thêm (xem [order](order.md)): `payment_status` (`unpaid`/`paid`/`refunded`) và `paid_at` (còn nguyên khi đơn thành `refunded`); `CK_orders_paid_at`: `(payment_status IN ('paid', 'refunded')) = (paid_at IS NOT NULL)`.

Migration `AddPayments` idempotent: nếu DB còn schema thanh toán cũ (`orders.payment_status` kiểu `PENDING`/`PAID` varchar(20); `payment_transactions` có cột `order_id`, `transaction_id`, `currency`, `payload`) thì giá trị `PAID` đổi thành `paid` (đơn thiếu `paid_at` lấy `updated_at`), các giá trị khác thành `unpaid`, kiểu/default/CHECK được đặt lại; bảng `payment_transactions` dạng cũ có dữ liệu được sao sang `payment_transactions_legacy` (không có constraint, không dùng trong code) rồi bị thay bằng bảng mới.

### 4.3 Validation (3 tầng)

- **DTO**: `CreateQrPaymentDto.orderId` (`IsString`, `IsNotEmpty`, `MaxLength(16)`); `AdminPaymentTransactionQueryDto` và `ConfirmPaymentDto` như 4.1. Payload webhook được kiểm tra bằng `parseSepayPayload` (không qua DTO).
- **Service**: đơn phải thuộc user; đơn chưa `paid` và chưa `cancelled`; số tiền lấy từ `orders.total` trong DB; chữ ký HMAC kiểm tra trước mọi xử lý dữ liệu; tài khoản nhận, mã, số tiền, hạn phiên, trạng thái phiên/đơn được đối chiếu như 4.4; mã chuyển khoản sinh mới được kiểm tra chưa tồn tại (tối đa 5 lần thử); xác nhận thủ công kiểm tra như mục "Xác nhận thủ công" ở 4.4.
- **DB**: CHECK/UNIQUE/FK/index như 4.2 (UNIQUE `transfer_code`, UNIQUE (`provider`, `provider_transaction_id`), UNIQUE từng phần một phiên `PENDING`/`PAID` mỗi đơn, CHECK trạng thái, `paid_at` và `confirmed_at`; `refunds`: CHECK amount/status/reason/`processed_at`/`bank_reference`, UNIQUE từng phần một yêu cầu `REQUESTED` mỗi đơn và một `bank_reference`, FK RESTRICT tới đơn và phiên).
- **Hoàn tiền (service)**: DTO `CompleteRefundDto`/`RejectRefundDto`/`CreateRefundDto` như 4.1; yêu cầu hoàn chỉ cho đơn `paid` có phiên `PAID`; hoàn xong khi `REQUESTED`; `bank_reference` chưa dùng; tổng các khoản `COMPLETED` không vượt số tiền của phiên `PAID`.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

**Tạo QR (`createQr`)** — trong một transaction:

1. Đọc cấu hình QR; thiếu → `PAYMENT_NOT_CONFIGURED`.
2. Khoá dòng đơn (`pessimistic_write`) theo `id` + `userId`.
3. Đơn `paymentStatus = 'paid'` hoặc `status = 'cancelled'` → `PAYMENT_ORDER_NOT_PAYABLE`.
4. Có phiên `PENDING` của đơn: còn hạn → dùng lại nguyên phiên đó (giữ mã, số tiền, `expiresAt`); hết hạn → chuyển `EXPIRED` rồi tạo phiên mới.
5. Tạo phiên mới: `amount = convertToVnd(orders.total, PAYMENT_VND_PER_UNIT)` = `round(Number(orders.total) × PAYMENT_VND_PER_UNIT)` (VND nguyên, phải > 0; hàm `convertToVnd` trong `payment-amount.util.ts` cũng được `POST /api/orders/quote` dùng để trả `amountVnd`), mã chuyển khoản `transfer_code` = `PAYMENT_TRANSFER_PREFIX` + 8 ký tự từ bảng `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (bỏ I, O, 0, 1), `bank_account` = `SEPAY_RECEIVING_ACCOUNT`, `expires_at` = bây giờ + 30 phút. Mã đã từng tồn tại (kể cả phiên cũ, đã hết hạn) không được cấp lại. Phiên hết hạn rồi tạo lại có `paymentId` và mã **mới**; phiên cũ và mã cũ vẫn được giữ nguyên trong DB để biết khách có thể đã chuyển theo mã nào. Mã giống hệt ở `qrUrl` (tham số `des`), response của khách, DB và màn admin.
6. Trả `{ data: { ...QR } }`.

**Admin tạo mã (`createQrAdmin`)** — trong một transaction: đọc cấu hình QR; khoá dòng đơn (không lọc theo `userId`); đơn `paymentStatus ≠ unpaid` hoặc `cancelled` → `PAYMENT_ORDER_NOT_PAYABLE`; mọi phiên `PENDING` của đơn → `EXPIRED` và `expires_at` = lúc đó (trả về mã của chúng ở `supersededTransferCodes`); tạo phiên mới như bước 5 của `createQr` kèm `created_by` = admin. Vì mỗi đơn chỉ có tối đa một phiên `PENDING` (UNIQUE từng phần), sau thao tác đơn có đúng một mã còn hiệu lực; mã cũ (đã `EXPIRED`/`CANCELLED`/`PAID`) giữ nguyên. Khách bấm tạo QR sau đó sẽ nhận lại mã của admin nếu còn hạn. Tiền chuyển vào mã đã bị thay được ghi `LATE` (xem bảng đối chiếu), không tự xác nhận đơn: admin xác nhận đúng mã đó bằng `transferCode` ở API confirm.

**Trạng thái (`getStatus`)** — chỉ đọc DB, không gọi SePay: đơn `paid` → `PAID`; ngược lại lấy phiên mới nhất theo `created_at` và áp `resolveAttemptStatus` (`payment-attempt-status.util.ts`): phiên `PENDING` mà đơn đã `cancelled` → `CANCELLED`; phiên `PENDING` quá `expires_at` → `EXPIRED`; còn lại trả `status` của phiên. Trạng thái `EXPIRED`/`CANCELLED` ở đây có thể được suy ra khi đọc, chưa chắc đã ghi vào DB.

**Phiên thanh toán cho khách xem (`listAttemptsForCustomer`)** — không có endpoint riêng; `GET /api/orders/:orderId` của module [order](order.md) gọi hàm này sau khi đã kiểm tra đơn thuộc user. Lấy mọi phiên của đơn (`created_at DESC`), áp cùng `resolveAttemptStatus` cho từng phiên, và với phiên `PAID` tìm giao dịch gắn vào phiên có `verification_status` ∈ `MATCHED`, `MANUALLY_CONFIRMED` để lấy `transactionRef` = `provider_transaction_id` (đúng giá trị lưu trong DB và admin thấy); giao dịch `DUPLICATE_PAYMENT`/`LATE`... cùng gắn vào phiên không được dùng. Mỗi phần tử chỉ gồm `transferCode`, `amount`, `status`, `createdAt`, `expiresAt`, `paidAt`, `transactionRef` (không có số tài khoản nhận, `raw_payload`, id nội bộ).

**Webhook (`SepayWebhookService.handle`)**:

1. Đọc cấu hình webhook (secret, tài khoản, prefix); thiếu → `PAYMENT_NOT_CONFIGURED`.
2. Xác thực chữ ký trên **bytes gốc** của body (`req.rawBody`, lưu bởi `json({ verify })` ở `main.ts` cho đường dẫn `/api/webhooks/`): `X-SePay-Signature` phải bằng `sha256=` + hex(HMAC-SHA256(secret, `<X-SePay-Timestamp>.<rawBody>`)), so sánh `timingSafeEqual`; `X-SePay-Timestamp` lệch quá 300 giây so với giờ server bị từ chối. Sai → `401`, không lưu gì, log cảnh báo không kèm body/header.
3. `parseSepayPayload` kiểm tra cấu trúc (sai → `400`).
4. Một transaction DB (`process`):
   1. Đã có `payment_transactions` cùng `provider_transaction_id` → trả "trùng", không đổi gì.
   2. Lưu giao dịch với `verification_status = 'UNMATCHED'` tạm (UNIQUE chặn trùng).
   3. Đối chiếu (`reconcile`) theo thứ tự dưới đây, giá trị đầu tiên thoả mãn là kết quả; cập nhật `verification_status` và `payment_attempt_id` của giao dịch.
5. Hai webhook cùng id chạy song song: bên thua gặp lỗi UNIQUE `23505`, bị rollback hoàn toàn và được coi là "trùng". Lỗi hệ thống khác được ném ra (HTTP 500) để SePay gửi lại.
6. Trả `{ success: true }` cho mọi kết quả đã lưu được, kể cả không khớp (SePay không cần gửi lại).

Thứ tự đối chiếu (`reconcile`):

| # | Điều kiện | `verification_status` |
|---|---|---|
| 1 | `transferType` ≠ `in` | `IGNORED` |
| 2 | `accountNumber` ≠ `SEPAY_RECEIVING_ACCOUNT` (bỏ khoảng trắng, dấu `-`) | `ACCOUNT_MISMATCH` |
| 3 | Không trích được ứng viên mã nào từ `code` và `content` (`extractTransferCodes`: `PREFIX` + 8 ký tự `[A-Z0-9]`; quét cả hai nguồn vì `code` của SePay có thể bị cắt; không phân biệt hoa/thường vì ngân hàng thường viết hoa nội dung) | `UNMATCHED` |
| 4 | Không có phiên nào có `transfer_code` đó (kể cả phiên đã hết hạn — khi đó kết quả là `LATE` ở bước 9, giao dịch vẫn được gắn đúng phiên cũ đó) | `UNMATCHED` |
| — | Từ đây khoá dòng `orders` rồi `payment_attempts` (cùng thứ tự với `createQr`) | |
| 5 | `accountNumber` ≠ `payment_attempts.bank_account` | `ACCOUNT_MISMATCH` |
| 6 | Phiên đã `PAID` hoặc đơn đã `paid` | `DUPLICATE_PAYMENT` |
| 7 | Đơn `cancelled` hoặc phiên `CANCELLED` | `NOT_PAYABLE` |
| 8 | `transferAmount` ≠ `payment_attempts.amount` | `AMOUNT_MISMATCH` |
| 9 | Phiên `EXPIRED`, hoặc `PENDING` nhưng quá `expires_at` (phiên được chuyển `EXPIRED`) | `LATE` |
| 10 | Còn lại | `MATCHED` |

`MATCHED`: phiên → `PAID` + `paid_at`; sau đó `applyOrderPaid` (`payment-paid.util.ts`, dùng chung với xác nhận thủ công): đơn → `payment_status = 'paid'` + `paid_at`; đơn đang `pending` (chờ cửa hàng xác nhận) được **tự chuyển `confirmed`** (đơn đã `confirmed`, `shipping`... giữ nguyên trạng thái); mọi phiên `PENDING` khác của đơn → `CANCELLED`. Webhook chỉ đổi đơn khi `MATCHED`; mọi trạng thái khác chỉ ghi giao dịch.

**Xác nhận thủ công (`confirmPaymentAdmin`)** — trong một transaction, khoá theo thứ tự `orders` → `payment_transactions` (nếu dùng `transactionId`) → `payment_attempts` (cùng thứ tự với webhook):

1. Kiểm tra input đúng một cách (`transactionId`, hoặc `reference` + `amount`), nếu không → `PAYMENT_CONFIRM_INPUT_INVALID`, chưa chạm DB.
2. Đơn không tồn tại → `ORDER_NOT_FOUND` (404); đơn đã `paid` hoặc `cancelled` → `PAYMENT_ORDER_NOT_PAYABLE` (nên bấm lần hai không trả được hai lần).
3. Có `transactionId`: không tìm thấy → `PAYMENT_TRANSACTION_NOT_FOUND` (404); `verification_status` không thuộc `UNMATCHED`, `AMOUNT_MISMATCH`, `LATE`, `NOT_PAYABLE` (tức đã `MATCHED`, `MANUALLY_CONFIRMED`, `DUPLICATE_PAYMENT`, `ACCOUNT_MISMATCH` — tiền không vào tài khoản của mình —, hoặc `IGNORED`) → `PAYMENT_TRANSACTION_NOT_CONFIRMABLE`.
4. Có `reference`: mã giao dịch lưu **nguyên văn** là `reference` cùng `provider` (`sepay` hoặc `manual`); cặp (`provider`, `reference`) đã tồn tại → `PAYMENT_TRANSACTION_NOT_CONFIRMABLE` (dùng `transactionId` của nó). Cùng một chuỗi ở hai provider khác nhau là hai giao dịch khác nhau.
5. Chọn phiên thanh toán: phiên mà giao dịch đã gắn (phải thuộc đúng đơn này, nếu không → `NOT_CONFIRMABLE`); giao dịch chưa gắn phiên, hoặc giao dịch mới, thì lấy phiên mới nhất của đơn; đơn chưa từng có phiên → `PAYMENT_ATTEMPT_NOT_FOUND` (404).
6. Số tiền thực nhận (của giao dịch hoặc `amount`) khác `payment_attempts.amount` và không có `acceptAmountMismatch: true` → `PAYMENT_AMOUNT_MISMATCH`.
7. Ghi: phiên → `PAID` + `paid_at`; `applyOrderPaid` (đơn → `paid`, `pending` → `confirmed`, các phiên `PENDING` khác → `CANCELLED`, như webhook); giao dịch có sẵn → `verification_status = 'MANUALLY_CONFIRMED'`, `payment_attempt_id`, `confirmed_by` (id admin), `confirmed_at`, `confirm_note`; giao dịch mới được tạo cùng các giá trị đó (`transfer_content` = `transferContent` admin nhập, mặc định `transfer_code` của phiên; lý do nằm ở `confirm_note`, không lẫn vào nội dung chuyển khoản; `raw_payload = { source, reference, provider, confirmedBy }`).

Dùng mã giao dịch SePay làm `reference` (provider `sepay`) thì khi SePay gửi lại webhook của chính giao dịch đó, webhook thấy cặp (`sepay`, `provider_transaction_id`) đã có và bỏ qua (idempotent), không sinh `DUPLICATE_PAYMENT`.

**Hoàn tiền (`RefundService`)** — mọi thao tác khoá theo thứ tự `orders` → `refunds` (order trước, như webhook/`createQr`/xác nhận thủ công):

0. Mọi cách tạo khoản hoàn chung `insertRequest`: tìm phiên `PAID` của đơn (không có → `REFUND_NOT_ALLOWED`), không cho khi đơn còn khoản `REQUESTED`, trừ tổng các khoản `COMPLETED` để ra phần còn lại, số tiền không vượt phần còn lại.
1. **Tạo yêu cầu khi huỷ đơn** (`createForCancelledOrder`, gọi trong transaction huỷ đơn đã khoá dòng đơn; xem [order](order.md)): tìm phiên `PAID` của đơn (không có → `REFUND_NOT_ALLOWED`); đã có yêu cầu `REQUESTED` → `REFUND_NOT_ALLOWED`; số tiền = **số ngân hàng thực nhận** của phiên `PAID` trừ tổng các khoản `COMPLETED` (≤ 0 → `REFUND_NOT_ALLOWED`). "Số thực nhận" là `amount` của giao dịch đã khớp phiên (`MATCHED` hoặc `MANUALLY_CONFIRMED`), thường bằng `payment_attempts.amount`, khác khi admin xác nhận thủ công kèm `acceptAmountMismatch`; không có giao dịch thì dùng số của phiên; tạo `refunds` `REQUESTED` với `reason = ADMIN_CANCELLED` và `requested_by` = admin huỷ đơn (khách không tự huỷ đơn đã trả). Việc này được làm **trước** khi đơn bị đổi sang `cancelled`, nên không thể có đơn huỷ đã thu tiền mà thiếu yêu cầu hoàn.
1b. **Tạo yêu cầu khi trả hàng** (`createForReturn`, gọi từ `ReturnService.receive` trong transaction đã khoá đơn): số tiền = `prorateRefundAmount(đã nhận, đã trả trước + lần này, orders.total) − prorateRefundAmount(đã nhận, đã trả trước, orders.total)` (giá trị tính bằng xu; "đã trả trước" là giá trị các lần trả hàng đã nhận trước của đơn) — theo tỷ lệ trên số tiền ngân hàng thực nhận, nên nhiều lần trả cộng lại đúng bằng số đã nhận (không lệch do làm tròn; hoàn đủ giá trị đơn thì đúng bằng số đã nhận), tối đa bằng phần còn lại; `reason = RETURN`, `return_request_id` gắn yêu cầu trả hàng; đơn vẫn `paid` sau khi hoàn một phần.
2. **Tạo thủ công** (`createAdmin`): khoá đơn; đơn phải `cancelled` và `payment_status = paid`; sau đó như bước 1 với `reason = ADMIN_CANCELLED`.
3. **Hoàn xong** (`completeAdmin`): khoá đơn rồi yêu cầu; yêu cầu phải `REQUESTED` (khác → `REFUND_NOT_PENDING`); `reference` đã có ở khoản hoàn khác → `REFUND_REFERENCE_DUPLICATE` (lỗi UNIQUE `23505` do hai khoản cùng ghi một mã đồng thời cũng báo mã này); tổng các khoản `COMPLETED` sau khoản này vượt số ngân hàng thực nhận → `REFUND_NOT_ALLOWED`. Ghi `status = COMPLETED`, `processed_by`, `processed_at`, `bank_reference`, `note`; khi tổng đã hoàn bằng đúng số ngân hàng thực nhận thì đơn → `payment_status = refunded` (`paid_at` giữ nguyên). Khoản hoàn có `return_request_id`: yêu cầu trả hàng `RECEIVED` → `REFUNDED`.
4. **Từ chối** (`rejectAdmin`): yêu cầu phải `REQUESTED`; ghi `status = REJECTED`, `processed_by`, `processed_at`, `note`. Đơn giữ `paid`; admin có thể tạo lại yêu cầu bằng bước 2. Khoản hoàn có `return_request_id`: yêu cầu trả hàng `RECEIVED` quay về `APPROVED` (`received_at` null, `shipping_refunded` false, `accepted_quantity` của các dòng về null) để cửa hàng nhận lại và tạo khoản mới.
5. **Khách xem** (`listForCustomer`): các khoản của đơn, mới nhất trước, chỉ gồm `amount`, `status`, `reason`, `returnId` (null nếu không từ trả hàng), `createdAt`, `processedAt`, `bankReference` (không có `note`, người xử lý hay id nội bộ).

Đơn `refunded` không bao giờ trả được nữa: tạo QR và xác nhận thủ công đều trả `PAYMENT_ORDER_NOT_PAYABLE`, webhook cho mã của đơn đó ghi `DUPLICATE_PAYMENT`, `getStatus` vẫn trả `PAID` (khoản thanh toán đã xảy ra; trạng thái hoàn nằm ở `orders.payment_status` và `refunds`).

### 4.5 Error code

| Code | Tên | Khi nào |
|---|---|---|
| 1701 | `EPaymentErrorCode.PAYMENT_NOT_CONFIGURED` | Thiếu/sai biến môi trường thanh toán (HTTP 503, message nêu tên biến thiếu) |
| 1702 | `PAYMENT_ORDER_NOT_PAYABLE` | Tạo QR cho đơn đã trả/đã huỷ, hoặc tổng tiền không quy đổi được thành VND > 0 |
| 1703 | `PAYMENT_ATTEMPT_NOT_FOUND` | Xem trạng thái đơn chưa có phiên; xác nhận thủ công với `transferCode` không thuộc đơn này, hoặc đơn chưa từng có phiên (HTTP 404) |
| 1704 | `PAYMENT_INVALID_SIGNATURE` | Webhook sai chữ ký/timestamp (HTTP 401) |
| 1705 | `PAYMENT_INVALID_PAYLOAD` | Webhook đúng chữ ký nhưng payload sai cấu trúc |
| 1706 | `PAYMENT_CODE_GENERATION_FAILED` | Sau 5 lần vẫn không sinh được mã chưa tồn tại (HTTP 500) |
| 1707 | `PAYMENT_CONFIRM_INPUT_INVALID` | Xác nhận thủ công không gửi đúng một trong `transactionId` hoặc `reference` + `amount` |
| 1708 | `PAYMENT_TRANSACTION_NOT_FOUND` | `transactionId` không tồn tại (HTTP 404) |
| 1709 | `PAYMENT_TRANSACTION_NOT_CONFIRMABLE` | Giao dịch ở trạng thái không xác nhận được, thuộc phiên của đơn khác, hoặc `reference` đã được ghi |
| 1710 | `PAYMENT_AMOUNT_MISMATCH` | Số tiền thực nhận khác số tiền của phiên mà không có `acceptAmountMismatch: true` (message nêu cả hai số) |
| 1711 | `REFUND_NOT_FOUND` | `refundId` không tồn tại (HTTP 404) |
| 1712 | `REFUND_NOT_ALLOWED` | Đơn không hoàn được (chưa huỷ khi tạo thủ công, chưa trả, không có phiên `PAID`, đã hoàn đủ, đã có yêu cầu đang chờ, hoặc tổng hoàn vượt số đã trả) |
| 1713 | `REFUND_NOT_PENDING` | Hoàn/từ chối khoản đã `COMPLETED` hoặc `REJECTED` |
| 1714 | `REFUND_REFERENCE_DUPLICATE` | `reference` đã dùng cho khoản hoàn khác |

Đơn không tồn tại / không thuộc user dùng `ORDER_NOT_FOUND (1301)` của module [order](order.md) với HTTP 404.

### 4.6 Phụ thuộc & cấu hình

- `PaymentModule` export `PaymentConfigService` (module order dùng); `TypeOrmModule.forFeature([Order, PaymentAttempt, PaymentTransaction])`; `ConfigService` (qua `PaymentConfigService`) đọc env; `DataSource` cho transaction.
- `main.ts` giữ `req.rawBody` cho đường dẫn `/api/webhooks/` (xem [common](common.md)).
- Thư viện `@nestjs/schedule` (`ScheduleModule.forRoot()` trong `PaymentModule`) chạy `PaymentExpiryScheduler`.
- Biến môi trường (chỉ tên): `SEPAY_RECEIVING_BANK_CODE` (mã ngắn ngân hàng của `vietqr.app/banks.json`, đưa vào `bank=`), `SEPAY_RECEIVING_BANK_NAME`, `SEPAY_RECEIVING_ACCOUNT`, `SEPAY_RECEIVING_ACCOUNT_NAME`, `SEPAY_WEBHOOK_SECRET`, `PAYMENT_TRANSFER_PREFIX` (mặc định `DH`, 2–8 ký tự `A-Z0-9`, tự chuyển chữ hoa; tiền tố của nội dung chuyển khoản, phải khớp tiền tố cấu hình trên SePay), `PAYMENT_VND_PER_UNIT` (số dương: số VND cho mỗi 1 đơn vị tiền của `orders.total`; cũng được báo giá của [order](order.md) đọc qua `PaymentConfigService.getVndPerUnit()`, thiếu thì báo giá trả `amountVnd: null` chứ không lỗi). Tạo QR cần cả bảy; webhook cần `SEPAY_WEBHOOK_SECRET`, `SEPAY_RECEIVING_ACCOUNT`, `PAYMENT_TRANSFER_PREFIX`.
- `PaymentService.countNeedsReview()` và `RefundService.countRequested()` cung cấp số đếm cho [pending-count](pending-count.md) (cùng điều kiện với bộ lọc `needsReview` và `status=REQUESTED` của hai danh sách).
- Quyền tạo QR cho đơn: `PAYMENT_ADMIN_CREATE_QR` (không nằm trong `DEFAULT_USER_PERMISSIONS`, admin tự có).
- Quyền hoàn tiền: `PAYMENT_ADMIN_VIEW` (list), `PAYMENT_ADMIN_REFUND` (tạo, hoàn xong, từ chối); không nằm trong `DEFAULT_USER_PERMISSIONS`, admin tự có. Không có biến môi trường mới.
- Hằng số trong `payment.constant.ts`: QR hết hạn sau 30 phút (`PAYMENT_QR_TTL_MS`), dung sai timestamp chữ ký 300 giây, URL ảnh `https://vietqr.app/img`.
- Cấu hình thủ công trên SePay (webhook `POST https://<domain>/api/webhooks/sepay`, loại giao dịch Tiền vào, `application/json`, HMAC-SHA256, "Chỉ gửi khi có mã thanh toán", tiền tố `DH`, secret trùng `SEPAY_WEBHOOK_SECRET`) do người quản trị thực hiện trên dashboard SePay.

### 4.7 Test

- `sepay-signature.util.spec.ts` — chữ ký hợp lệ, body bị sửa, sai secret, chữ ký không ràng buộc timestamp, thiếu header/secret, sai prefix/độ dài/không phải hex, timestamp không phải số, cửa sổ ±300 giây (gồm biên), header dạng mảng.
- `sepay-payload.util.spec.ts` — `parseSepayPayload` (hợp lệ, `code` null, các payload sai), `extractTransferCodes` (mã trong `code`, trong nội dung, viết hoa/thường, chữ dính sau mã, `code` bị cắt, nhiều ứng viên, escape prefix), `normalizeAccountNumber`.
- `payment.service.spec.ts` — `createQr` (quy đổi VND, mã `DH` + 8 ký tự và giống hệt ở response/URL QR/DB, theo `PAYMENT_TRANSFER_PREFIX`, làm tròn, khoá dòng đơn, tái sử dụng phiên, hết hạn → phiên cũ giữ nguyên + mã mới không trùng, đơn người khác/không tồn tại, đơn đã trả/đã huỷ) và `getStatus` (PAID/PENDING/EXPIRED/CANCELLED, 404, không gọi mạng).
- `sepay-webhook.service.spec.ts` — chữ ký sai/body bị sửa/timestamp cũ/không có raw body không chạm DB, payload sai → 400, khớp đơn → PAID, không lưu chữ ký/secret, huỷ phiên PENDING khác, tìm mã trong nội dung, từng trạng thái không khớp (`AMOUNT_MISMATCH`, `ACCOUNT_MISMATCH`, `UNMATCHED`, `IGNORED`, `LATE`, `NOT_PAYABLE`, `DUPLICATE_PAYMENT`), webhook trùng id, lỗi UNIQUE đồng thời, lỗi DB được ném lại; đơn `pending` được trả → `confirmed` (đơn đã `shipping` giữ nguyên, tiền không được xác nhận thì không đổi gì), tiền chuyển theo mã CŨ đã hết hạn được ghi `LATE` gắn đúng phiên cũ đó (phiên mới không bị đụng), tiền theo mã mới → `MATCHED`, nội dung bị ngân hàng viết hoa/`code` bị cắt vẫn khớp.
- `payment-attempts-admin.spec.ts` — `findAttemptsAdmin`: trả mã kèm đơn/khách/trạng thái hiệu lực/giao dịch đã gắn, không lộ `raw_payload`, PENDING của đơn huỷ → `CANCELLED`, bộ lọc `orderId`/`status`/`search`, sort và phân trang, ghi `EXPIRED` vào DB trước khi liệt kê (không đụng đơn đã huỷ).
- `payment.service.spec.ts` (tiếp) — `listAttemptsForCustomer`: `[]` khi chưa có phiên, thứ tự mới nhất trước gồm phiên hết hạn, `transactionRef` của phiên `PAID` (đúng giá trị lưu, kể cả giao dịch `manual`), phiên khác `null`, trạng thái suy ra như `getStatus` (quá hạn → `EXPIRED`, đơn huỷ → `CANCELLED`, phiên `PAID` giữ nguyên), chỉ các field an toàn cho khách, nhất quán với `getStatus`.
- `payment.service.spec.ts` (tiếp) — `createQrAdmin`: tạo mã cho đơn của khách khác với `created_by` admin, mọi mã đang chờ hết hạn và được liệt kê (mã đã hết hạn/huỷ giữ nguyên, luôn đúng một mã `PENDING`), gọi lại luôn ra mã mới, khách sau đó dùng lại mã của admin, đơn đã trả/hoàn/huỷ → 1702 mà không đụng mã nào, đơn lạ → 1301, thiếu cấu hình không đổi gì; `sepay-webhook.service.spec.ts`: tiền vào mã đã bị thay → `LATE`, đơn vẫn `unpaid`.
- `payment-expiry.spec.ts` — `expireOverdueAttempts` (SQL chỉ đổi `PENDING` quá hạn, không đụng đơn đã huỷ, trả số dòng), `cancelPendingAttempts`, `PaymentExpiryScheduler` (chạy đồng bộ, không bao giờ ném lỗi, có lịch).
- `payment-confirm.spec.ts` — xác nhận thủ công cũng đổi `pending` → `confirmed` (đơn đã `shipping` giữ nguyên); xác nhận theo `transferCode` (chọn đúng phiên cũ đã hết hạn thay vì phiên mới nhất, không có `reference` thì mã giao dịch ghi là chính mã đó, mã của đơn khác/không tồn tại → 1703, sai số tiền → 1710, hai lần → 1702, giao dịch có sẵn kèm `transferCode` phải khớp phiên), `getOrderPaymentsAdmin` hiện trạng thái hiệu lực, và `confirmPaymentAdmin` (từng trạng thái xác nhận được/không được, gắn vào phiên mới nhất khi giao dịch chưa có phiên, huỷ phiên `PENDING` khác, thứ tự khoá, giao dịch của đơn khác, sai số tiền với và không có `acceptAmountMismatch`, ghi giao dịch mới với provider `sepay`/`manual` (mã lưu nguyên văn, nội dung chuyển khoản từ sao kê hoặc mã phiên), cùng chuỗi ở hai provider là hai giao dịch, `reference` trùng cùng provider, đơn chưa có phiên, các input sai, đơn đã trả/đã huỷ/không tồn tại, gửi hai lần), `getOrderPaymentsAdmin` và `ConfirmPaymentDto`.
- `refund.service.spec.ts` — `completeAdmin` (ghi mã giao dịch, đơn → `refunded` và giữ `paid_at`, khoá order trước refund, view admin có thông tin khoản đã nhận, từng trạng thái không hoàn được → 1713, mã trùng → 1714 kể cả lỗi UNIQUE đồng thời, không hoàn quá số đã trả → 1712, hoàn từng phần giữ `paid` đến khi đủ), `rejectAdmin` (đơn giữ `paid`, tạo lại được), `createAdmin` (đơn đã huỷ + đã trả; đơn chưa huỷ/chưa trả/đã hoàn/đã có yêu cầu đang chờ → 1712; đơn lạ → 1301), `listForCustomer` (chỉ field an toàn, mới nhất trước), `findAdmin` (filter, search, sort, phân trang, không lộ tài khoản nhận/`raw_payload`), đơn `refunded` không tạo QR/không xác nhận thủ công được và `getStatus` vẫn `PAID`, và các DTO hoàn tiền.
- `refund.service.spec.ts` (tiếp) — hoàn theo số tiền thực nhận khi admin xác nhận thủ công kèm chấp nhận lệch (khoản hoàn bằng số thực nhận, hoàn xong thì đơn `refunded`, khoản lớn hơn số thực nhận bị từ chối); `prorateRefundAmount`; khoản hoàn từ trả hàng: hoàn xong → yêu cầu trả hàng `REFUNDED` (đơn chỉ `refunded` khi đủ số đã trả), khoản không từ trả hàng không đụng yêu cầu trả hàng, từ chối → yêu cầu về `APPROVED` và xoá số lượng chấp nhận, `returnId`/`returnRequestId` trong view khách/admin.
- `payment.test-utils.ts` — `EntityManager` giả trong bộ nhớ dùng chung cho các spec trên (không phải test).
- Các test trên dùng manager giả; hành vi với Postgres thật (migration, UNIQUE, khoá dòng, webhook trùng song song, huỷ/hoàn đồng thời) không có test tự động trong repo.

### 4.8 Lưu ý hiện trạng

- Giá trong DB (`products.price`, `orders.total`, phí ship) là đơn vị cửa hàng (seed ở mức vài chục đến vài trăm), không phải VND; số tiền VND của phiên thanh toán là `orders.total × PAYMENT_VND_PER_UNIT`, được chốt lúc tạo phiên và webhook so với `payment_attempts.amount`, không so với `orders.total`.
- "PAID" là `orders.payment_status = 'paid'` (và `payment_attempts.status = 'PAID'`); sau khi hoàn đủ tiền đơn thành `refunded`, còn phiên giữ `PAID` làm lịch sử. Hai trục tách riêng: `payment_status` (đã trả chưa) và `orders.status` (cửa hàng xử lý tới đâu); thanh toán thành công tự đưa đơn `pending` sang `confirmed` nên khách không còn tự huỷ được đơn đã trả (xem [order](order.md)). Các bước sau (`shipping`, `delivered`, `completed`) vẫn do admin đổi.
- Giao dịch đến sau khi QR hết hạn (`LATE`) và mọi giao dịch không khớp **không** tự xác nhận đơn; chỉ được lưu. Admin xem qua `GET /api/admin/payments/transactions` và gắn vào đơn bằng `POST /api/admin/payments/orders/:orderId/confirm`. Giao dịch `DUPLICATE_PAYMENT`/`ACCOUNT_MISMATCH` chỉ được ghi nhận: hoàn tiền (`refunds`) chỉ dành cho khoản của phiên `PAID`, tiền vào thừa/sai tài khoản được xử lý ngoài hệ thống.
- Xác nhận thủ công cần đơn đã có ít nhất một phiên thanh toán (đơn chưa từng bấm tạo QR thì không xác nhận được); tác động lên đơn giống webhook (`applyOrderPaid`).
- Quyền xác nhận thủ công là `PAYMENT_ADMIN_CONFIRM`, tách khỏi `PAYMENT_ADMIN_VIEW`; không nằm trong `DEFAULT_USER_PERMISSIONS`, admin (`role = 'admin'`) tự có.
- Trạng thái mã chuyển khoản được giữ đúng trong DB: bộ đếm giờ `PaymentExpiryScheduler` (`@nestjs/schedule`, mỗi phút) gọi `expireOverdueAttempts()` để đổi các phiên `PENDING` đã quá hạn (của đơn chưa huỷ) sang `EXPIRED`; huỷ đơn (khách huỷ đơn chưa trả, hoặc admin) gọi `cancelPendingAttempts()` đổi các phiên `PENDING` của đơn sang `CANCELLED`. `GET /api/admin/payments/attempts` cũng chạy `expireOverdueAttempts()` trước khi liệt kê. Việc suy ra `EXPIRED`/`CANCELLED` lúc đọc (`resolveAttemptStatus`) vẫn còn làm lưới an toàn cho khoảng trống giữa hai lần chạy hoặc khi instance đang ngủ. Tiền chuyển vào phiên của đơn đã huỷ được ghi `NOT_PAYABLE`.
- Không có cơ chế chủ động kéo giao dịch từ SePay API: webhook thất lạc dựa vào việc SePay tự gửi lại khi backend trả lỗi và chức năng gửi lại thủ công trên dashboard SePay (an toàn vì xử lý idempotent theo `provider_transaction_id`).
- Webhook luôn trả `200 { success: true }` cho giao dịch đã lưu, kể cả khi không khớp đơn; chỉ 4xx/5xx khi chữ ký/payload sai hoặc lỗi hệ thống.
- Quyền `PAYMENT_CREATE`/`PAYMENT_VIEW` nằm trong `DEFAULT_USER_PERMISSIONS` cho user mới; migration `AddPayments` cấp thêm cho user hiện có đang có `ORDER_CREATE`/`ORDER_VIEW_DETAIL`. Admin không cần khai báo.
- Mỗi lần khách bấm tạo lại QR sau khi hết hạn sẽ có một mã **khác**; các mã cũ vẫn được lưu và tra cứu được ở `GET /api/admin/payments/attempts` (và qua tìm kiếm đơn của admin), nên khi SePay báo có tiền với một mã cũ, admin biết mã đó thuộc đơn nào và xác nhận đúng phiên bằng `transferCode`. Ngân hàng làm mất ký tự trong nội dung chuyển khoản sẽ khiến giao dịch thành `UNMATCHED`.
- Tiền chuyển theo một mã đã hết hạn không tự xác nhận đơn (`LATE`) dù đơn đã có mã mới; giao dịch vẫn được gắn đúng phiên cũ để admin xác nhận.
- Hoàn tiền là bước ghi nhận, không phải chuyển tiền: SePay chỉ báo tiền vào, nên admin tự chuyển khoản trả khách (đúng tài khoản nguồn trên sao kê, hoặc tài khoản khách cung cấp ngoài hệ thống) rồi ghi `reference` ở `POST /api/admin/refunds/:refundId/complete`. Hệ thống không lưu số tài khoản ngân hàng của khách. Giao dịch `out` mà SePay báo về cho lần chuyển hoàn được lưu `IGNORED` như mọi giao dịch tiền ra và không tự gắn vào `refunds`.
- Khoản hoàn khi huỷ đơn luôn là toàn bộ phần còn lại của phiên `PAID`; khoản hoàn khi trả hàng ([return](return.md)) là một phần theo tỷ lệ giá trị hàng được chấp nhận trên số khách đã trả. Tổng các khoản `COMPLETED` không bao giờ vượt số đã trả; đơn chỉ thành `refunded` khi tổng bằng đúng số đó.
- Không backfill: đơn đã huỷ mà đã thu tiền từ trước khi có `refunds` không có yêu cầu hoàn; admin tạo bằng `POST /api/admin/refunds`.
