# refund (`src/modules/refund`)

> Cập nhật lần cuối: 2026-10-25

## 1. Tổng quan

Module hoàn tiền: yêu cầu hoàn `REQUESTED` do huỷ đơn đã thanh toán hoặc do nhận hàng trả về, admin chuyển khoản trả khách bằng ngân hàng rồi ghi mã giao dịch hoàn, khoản hoàn xong thì đơn (hoặc yêu cầu trả hàng) chuyển trạng thái. Hệ thống không tự chuyển tiền (SePay chỉ báo tiền vào). Tách khỏi [payment](payment.md) từ spec `payment/0004`: module chỉ **đọc** phiên và giao dịch của payment, không có phần nào của payment dùng refund.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/refund` |
| Route prefix | `/api/admin/refunds` (admin) |
| Bảng DB | `refunds` |
| Module phụ thuộc | `order` (entity `Order`, khoá dòng đơn; `markOrderRefunded`); `return` (`markReturnRefunded`, `reopenReturnAfterRefundRejected`); `payment` (chỉ đọc entity `PaymentAttempt`, `PaymentTransaction` ở `payment/shared/`; `RefundModule` không import `PaymentModule`) |
| Export | `RefundService` (module [order](order.md) và [return](return.md) tạo khoản hoàn), `RefundQueryService` (module [order](order.md) và [pending-count](pending-count.md) đọc) |

## 2. Mục đích & nghiệp vụ phục vụ

- Đơn đã thanh toán bị admin huỷ tự có một yêu cầu hoàn tiền `REQUESTED`; admin chuyển khoản trả khách bằng ngân hàng rồi ghi mã giao dịch hoàn, đơn thành `payment_status = refunded`.
- Hàng khách trả lại ([return](return.md)): khi cửa hàng xác nhận đã nhận hàng, tạo yêu cầu hoàn `REQUESTED` (lý do `RETURN`) cho phần giá trị hàng được chấp nhận; khoản hoàn xong thì yêu cầu trả hàng thành `REFUNDED`.
- Khách xem các khoản hoàn của đơn trong `GET /api/orders/:orderId` ([order](order.md)); không có API hoàn tiền riêng cho khách.

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Hoàn tiền (admin) | `admin-refund.controller.ts` | `/api/admin/refunds` | JWT + permission | List yêu cầu hoàn tiền, tạo yêu cầu cho đơn đã huỷ mà đã thu tiền, ghi đã hoàn, từ chối hoàn |

## 4. Chi tiết

### 4.1 API

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/admin/refunds` | `PAYMENT_ADMIN_VIEW` | Danh sách yêu cầu hoàn tiền |
| POST | `/api/admin/refunds` | `PAYMENT_ADMIN_REFUND` | Tạo yêu cầu hoàn cho đơn đã huỷ mà đã thanh toán |
| POST | `/api/admin/refunds/:refundId/complete` | `PAYMENT_ADMIN_REFUND` | Đã chuyển khoản hoàn: ghi mã giao dịch |
| POST | `/api/admin/refunds/:refundId/reject` | `PAYMENT_ADMIN_REFUND` | Từ chối hoàn (bắt buộc lý do) |

**GET `/api/admin/refunds`** — `AdminRefundQueryDto` (extends `PaginationQueryDto`):

| Param | Ràng buộc |
|---|---|
| `orderId` | string ≤ 16 |
| `status` | `IsIn(REFUND_STATUSES)` = `REQUESTED`, `COMPLETED`, `REJECTED` |
| `search` | ≤ 255; `ILIKE` trên `refunds.order_id`, `bank_reference`, `payment_attempts.transfer_code` (nội dung chuyển khoản khách đã dùng), `shipping_address->>'phone'`, `shipping_address->>'fullName'` |
| `sort` | whitelist `createdAt`, `processedAt`, `amount`; mặc định `-createdAt` |

Response `paginated(...)`; mỗi phần tử: `{ id, orderId, status, reason, returnRequestId, amountVnd, amountUsd, createdAt, requestedBy, processedBy, processedAt, bankReference, note, order: { id, status, paymentStatus, totalVnd, totalUsd, exchangeRate, userId, customer: { fullName, phone } }, payment: { transferCode, paidAmountVnd, paidAmountUsd, paidAt, provider, transactionRef, transferContent } }`. `payment` cho admin biết khoản tiền đã nhận để hoàn về đúng nguồn (`paidAmountVnd` là số ngân hàng thực nhận): mã chuyển khoản của phiên, mã giao dịch (`provider_transaction_id`) và nội dung chuyển khoản của giao dịch đã khớp (`MATCHED` hoặc `MANUALLY_CONFIRMED`; `null` nếu không có). Không trả số tài khoản nhận hay `raw_payload`.

**POST `/api/admin/refunds`** — `CreateRefundDto`: `orderId` (string, not empty, ≤ 16). Chỉ cho đơn `cancelled` **và** `payment_status = paid` chưa có yêu cầu `REQUESTED` và chưa hoàn đủ; dùng cho đơn huỷ trước khi có luồng hoàn tiền hoặc khi yêu cầu cũ bị từ chối (`reason = ADMIN_CANCELLED`). Response `201` `{ data: <như phần tử list> }`.

**POST `/api/admin/refunds/:refundId/complete`** — `CompleteRefundDto`: `reference` (bắt buộc, trim, ≤ 64 — mã giao dịch ngân hàng của lần chuyển hoàn, lưu nguyên văn), `note` (bắt buộc, trim, ≤ 500). Field lạ bị từ chối. Response `201` `{ data: <như phần tử list> }`.

**POST `/api/admin/refunds/:refundId/reject`** — `RejectRefundDto`: `note` (bắt buộc, trim, ≤ 500 — lý do không hoàn). Response `201` `{ data: <như phần tử list> }`.

`reason` ∈ `ADMIN_CANCELLED`, `RETURN`; `returnRequestId` chỉ có khi `reason = RETURN` (yêu cầu trả hàng sinh ra khoản hoàn, xem [return](return.md)). Khách không có API hoàn tiền riêng; các khoản hoàn của đơn nằm trong `GET /api/orders/:orderId` (`data.refunds`, xem [order](order.md)).

### 4.2 Dữ liệu

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

Hằng `REFUND_STATUSES`, `REFUND_REASONS` ở `refund.constant.ts`.

### 4.3 Validation (3 tầng)

- **DTO**: `AdminRefundQueryDto`, `CreateRefundDto`, `CompleteRefundDto`, `RejectRefundDto` như 4.1.
- **Service**: DTO `CompleteRefundDto`/`RejectRefundDto`/`CreateRefundDto` như 4.1; yêu cầu hoàn chỉ cho đơn `paid` có phiên `PAID`; hoàn xong khi `REQUESTED`; `bank_reference` chưa dùng; tổng các khoản `COMPLETED` không vượt số tiền của phiên `PAID`.
- **DB**: CHECK amount/status/reason/`processed_at`/`bank_reference`, UNIQUE từng phần một yêu cầu `REQUESTED` mỗi đơn và một `bank_reference`, FK RESTRICT tới đơn và phiên (xem 4.2).

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

**`RefundService`** — mọi thao tác khoá theo thứ tự `orders` → `refunds` (order trước, như webhook/`createQr`/xác nhận thủ công):

0. Mọi cách tạo khoản hoàn chung `insertRequest`: tìm phiên `PAID` của đơn (không có → `REFUND_NOT_ALLOWED`), không cho khi đơn còn khoản `REQUESTED`, trừ tổng các khoản `COMPLETED` để ra phần còn lại, số tiền không vượt phần còn lại.
1. **Tạo yêu cầu khi huỷ đơn** (`createForCancelledOrder`, gọi trong transaction huỷ đơn đã khoá dòng đơn; xem [order](order.md)): tìm phiên `PAID` của đơn (không có → `REFUND_NOT_ALLOWED`); đã có yêu cầu `REQUESTED` → `REFUND_NOT_ALLOWED`; số tiền = **số ngân hàng thực nhận** của phiên `PAID` trừ tổng các khoản `COMPLETED` (≤ 0 → `REFUND_NOT_ALLOWED`). "Số thực nhận" là `amount` của giao dịch đã khớp phiên (`MATCHED` hoặc `MANUALLY_CONFIRMED`), thường bằng `payment_attempts.amount`, khác khi admin xác nhận thủ công kèm `acceptAmountMismatch`; không có giao dịch thì dùng số của phiên; tạo `refunds` `REQUESTED` với `reason = ADMIN_CANCELLED` và `requested_by` = admin huỷ đơn (khách không tự huỷ đơn đã trả). Việc này được làm **trước** khi đơn bị đổi sang `cancelled`, nên không thể có đơn huỷ đã thu tiền mà thiếu yêu cầu hoàn.
1b. **Tạo yêu cầu khi trả hàng** (`createForReturn`, gọi từ `ReturnProcessingService.receive` trong transaction đã khoá đơn): số tiền = `prorateRefundAmount(đã nhận, đã trả trước + lần này, orders.total) − prorateRefundAmount(đã nhận, đã trả trước, orders.total)` (giá trị tính bằng VND nguyên: `orders.total`, giá dòng hàng, phí ship; "đã trả trước" là giá trị các lần trả hàng đã nhận trước của đơn) — theo tỷ lệ trên số tiền ngân hàng thực nhận, nên nhiều lần trả cộng lại đúng bằng số đã nhận (không lệch do làm tròn; hoàn đủ giá trị đơn thì đúng bằng số đã nhận), tối đa bằng phần còn lại; `reason = RETURN`, `return_request_id` gắn yêu cầu trả hàng; đơn vẫn `paid` sau khi hoàn một phần.
2. **Tạo thủ công** (`createAdmin`): khoá đơn; đơn phải `cancelled` và `payment_status = paid`; sau đó như bước 1 với `reason = ADMIN_CANCELLED`.
3. **Hoàn xong** (`completeAdmin`): khoá đơn rồi yêu cầu; yêu cầu phải `REQUESTED` (khác → `REFUND_NOT_PENDING`); `reference` đã có ở khoản hoàn khác → `REFUND_REFERENCE_DUPLICATE` (lỗi UNIQUE `23505` do hai khoản cùng ghi một mã đồng thời cũng báo mã này); tổng các khoản `COMPLETED` sau khoản này vượt số ngân hàng thực nhận → `REFUND_NOT_ALLOWED`. Ghi `status = COMPLETED`, `processed_by`, `processed_at`, `bank_reference`, `note`; khi tổng đã hoàn bằng đúng số ngân hàng thực nhận thì đơn → `payment_status = refunded` (`paid_at` giữ nguyên). Khoản hoàn có `return_request_id`: yêu cầu trả hàng `RECEIVED` → `REFUNDED`.
4. **Từ chối** (`rejectAdmin`): yêu cầu phải `REQUESTED`; ghi `status = REJECTED`, `processed_by`, `processed_at`, `note`. Đơn giữ `paid`; admin có thể tạo lại yêu cầu bằng bước 2. Khoản hoàn có `return_request_id`: yêu cầu trả hàng `RECEIVED` quay về `APPROVED` (`received_at` null, `shipping_refunded` false, `accepted_quantity` của các dòng về null) để cửa hàng nhận lại và tạo khoản mới.
5. **Khách xem** (`listForCustomer`): các khoản của đơn, mới nhất trước, chỉ gồm `amountVnd`, `amountUsd` (theo tỷ giá chốt trên đơn), `status`, `reason`, `returnId` (null nếu không từ trả hàng), `createdAt`, `processedAt`, `bankReference` (không có `note`, người xử lý hay id nội bộ).


### 4.5 Error code

Các mã dùng nhóm `17xx` của `EPaymentErrorCode` (giữ nguyên khi tách module):

| Code | Tên | Khi nào |
|---|---|---|
| 1711 | `REFUND_NOT_FOUND` | `refundId` không tồn tại (HTTP 404) |
| 1712 | `REFUND_NOT_ALLOWED` | Đơn không hoàn được (chưa huỷ khi tạo thủ công, chưa trả, không có phiên `PAID`, đã hoàn đủ, đã có yêu cầu đang chờ, hoặc tổng hoàn vượt số đã trả) |
| 1713 | `REFUND_NOT_PENDING` | Hoàn/từ chối khoản đã `COMPLETED` hoặc `REJECTED` |
| 1714 | `REFUND_REFERENCE_DUPLICATE` | `reference` đã dùng cho khoản hoàn khác |

Đơn không tồn tại dùng `ORDER_NOT_FOUND (1301)` của module [order](order.md) với HTTP 404.

### 4.6 Phụ thuộc & cấu hình

- `TypeOrmModule.forFeature([Refund, PaymentAttempt, PaymentTransaction])` (hai entity sau chỉ để đọc). `RefundService` inject `DataSource`, `Repository<Refund>`, `RefundQueryService`; `RefundQueryService` inject `Repository<Refund>`, `Repository<PaymentTransaction>`.
- `RefundQueryService.countRequested()` cung cấp số đếm cho [pending-count](pending-count.md) (cùng điều kiện với `status=REQUESTED` của danh sách).
- Quyền hoàn tiền: `PAYMENT_ADMIN_VIEW` (list), `PAYMENT_ADMIN_REFUND` (tạo, hoàn xong, từ chối); không nằm trong `DEFAULT_USER_PERMISSIONS`, admin tự có. Không có biến môi trường mới.

### 4.7 Test

- `refund.service.spec.ts` — `completeAdmin` (ghi mã giao dịch, đơn → `refunded` và giữ `paid_at`, khoá order trước refund, view admin có thông tin khoản đã nhận, từng trạng thái không hoàn được → 1713, mã trùng → 1714 kể cả lỗi UNIQUE đồng thời, không hoàn quá số đã trả → 1712, hoàn từng phần giữ `paid` đến khi đủ), `rejectAdmin` (đơn giữ `paid`, tạo lại được), `createAdmin` (đơn đã huỷ + đã trả; đơn chưa huỷ/chưa trả/đã hoàn/đã có yêu cầu đang chờ → 1712; đơn lạ → 1301), `listForCustomer` (chỉ field an toàn, mới nhất trước), `findAdmin` (filter, search, sort, phân trang, không lộ tài khoản nhận/`raw_payload`), đơn `refunded` không tạo QR/không xác nhận thủ công được và `getStatus` vẫn `PAID`, và các DTO hoàn tiền.
- `refund.service.spec.ts` (tiếp) — hoàn theo số tiền thực nhận khi admin xác nhận thủ công kèm chấp nhận lệch (khoản hoàn bằng số thực nhận, hoàn xong thì đơn `refunded`, khoản lớn hơn số thực nhận bị từ chối); `prorateRefundAmount` (giá trị VND); khoản hoàn từ trả hàng: hoàn xong → yêu cầu trả hàng `REFUNDED` (đơn chỉ `refunded` khi đủ số đã trả), khoản không từ trả hàng không đụng yêu cầu trả hàng, từ chối → yêu cầu về `APPROVED` và xoá số lượng chấp nhận, `returnId`/`returnRequestId` trong view khách/admin.
- Flow test trên Postgres thật:
  - `payment/payment-refund-actions.flow.ts` (19 test) — `POST /api/admin/refunds/:refundId/complete`: ghi mã giao dịch (trim) và đơn thành `refunded` khi hoàn đủ; hoàn từng phần giữ đơn `paid` rồi yêu cầu thứ hai hoàn phần còn lại; đã `COMPLETED`/`REJECTED` → 400 / 1713 (message nêu trạng thái); yêu cầu lạ → 404 / 1711; mã tham chiếu trùng → 1714 và yêu cầu còn nguyên `REQUESTED`; vượt số đã trả → 1712; thiếu/rỗng/quá dài/field lạ → validation; hai admin bấm cùng lúc → một thành công, một 1713; hai khoản hoàn cùng mã tham chiếu cùng lúc → một thành công, một 1714 (lỗi UNIQUE `23505`). `POST /api/admin/refunds/:refundId/reject`: ghi lý do (trim), đơn giữ `paid`, tạo lại được yêu cầu mới; không còn `REQUESTED` → 1713; lạ → 1711; thiếu/rỗng/quá dài `note`/field lạ → validation.
  - `order-payment/cancel-and-refund.flow.ts` — huỷ đơn đã trả → yêu cầu hoàn → admin hoàn xong (xem [payment](payment.md) 4.7).

### 4.8 Lưu ý hiện trạng

- Hoàn tiền là bước ghi nhận, không phải chuyển tiền: SePay chỉ báo tiền vào, nên admin tự chuyển khoản trả khách (đúng tài khoản nguồn trên sao kê, hoặc tài khoản khách cung cấp ngoài hệ thống) rồi ghi `reference` ở `POST /api/admin/refunds/:refundId/complete`. Hệ thống không lưu số tài khoản ngân hàng của khách. Giao dịch `out` mà SePay báo về cho lần chuyển hoàn được lưu `IGNORED` như mọi giao dịch tiền ra và không tự gắn vào `refunds`.
- Khoản hoàn khi huỷ đơn luôn là toàn bộ phần còn lại của phiên `PAID`; khoản hoàn khi trả hàng ([return](return.md)) là một phần theo tỷ lệ giá trị hàng được chấp nhận trên số khách đã trả. Tổng các khoản `COMPLETED` không bao giờ vượt số đã trả; đơn chỉ thành `refunded` khi tổng bằng đúng số đó.
- Không backfill: đơn đã huỷ mà đã thu tiền từ trước khi có `refunds` không có yêu cầu hoàn; admin tạo bằng `POST /api/admin/refunds`.
- Mã lỗi `1711`–`1714` thuộc nhóm `17xx` của payment vì mã lỗi theo nhóm được đặt trước khi tách module.

### 4.9 Thiết kế & pattern

Spec: `docs/specs/payment/0003` (tách đọc/ghi), `docs/specs/payment/0004` (module riêng), `docs/specs/common/0006` (ranh giới ghi giữa các module).

| Pattern / nguyên lý | Chỗ dùng | Vì sao |
|---|---|---|
| Module chủ viết chuyển trạng thái của mình | `RefundService` không còn `UPDATE` trực tiếp bảng của module khác: hoàn xong → `markOrderRefunded` ([order](order.md)) và `markReturnRefunded` ([return](return.md)); khoản hoàn bị từ chối → `reopenReturnAfterRefundRejected` ([return](return.md)); thanh toán khớp → `markOrderPaid` ([order](order.md)) | State machine của đơn và của yêu cầu trả hàng nằm một chỗ, ở module chủ; payment chỉ quyết định *khi nào* gọi, trong cùng transaction và thứ tự khoá cũ (`orders` → bản ghi con) |
| Tách command/query theo use case | `RefundQueryService` (`countRequested`, `listForCustomer`, `findAdmin`, `getAdminView` + dựng view admin/khách) và `RefundService` (`createForCancelledOrder`, `createForReturn`, `createAdmin`, `completeAdmin`, `rejectAdmin`) | Luật tính và ghi khoản hoàn tách khỏi phần hiển thị; ghi gọi đọc một chiều để trả view admin sau khi ghi. `OrderQueryService` và `PendingCountService` chỉ cần Query |
| Module độc lập theo bounded context | `RefundModule` | Vòng đời hoàn tiền không dính phần thu tiền; payment không import refund và refund chỉ đọc entity của payment, nên không có vòng module |
