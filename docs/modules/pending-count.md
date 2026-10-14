# pending-count (`src/modules/pending-count`)

> Cập nhật lần cuối: 2026-10-14

## 1. Tổng quan

Module nhỏ trả các con số "việc đang chờ admin xử lý" để hiện badge ở menu admin: đơn hàng, giao dịch chuyển khoản, hoàn tiền, trả hàng, đánh giá chờ phản hồi. Không có bảng riêng; mỗi số là một `COUNT` do module sở hữu dữ liệu cung cấp, chạy trên cùng điều kiện với bộ lọc danh sách tương ứng.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/pending-count` |
| Route prefix | `/api/admin/pending-counts` |
| Bảng DB | không có (đọc `orders`, `payment_transactions`, `refunds`, `return_requests`, `reviews` qua service của từng module) |
| Module phụ thuộc | `order` (`OrderService.countNeedsAction`), `payment` (`PaymentService.countNeedsReview`, `RefundService.countRequested`), `return` (`ReturnService.countRequested`), `review` (`ReviewService.countAwaitingReply`) |
| Export | không |

## 2. Mục đích & nghiệp vụ phục vụ

- Admin thấy ngay trên menu có bao nhiêu việc đang chờ mình mà không phải mở từng trang.
- Con số ở menu luôn bằng đúng `total` của danh sách đã lọc khi bấm vào xem: số đếm và bộ lọc dùng chung một hàm điều kiện.

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Pending counts | `pending-count.controller.ts` | `/api/admin/pending-counts` | JWT + permission | Trả các con số theo quyền của người gọi |

## 4. Chi tiết

### 4.1 API

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/admin/pending-counts` | ít nhất một trong `ORDER_ADMIN_VIEW`, `PAYMENT_ADMIN_VIEW`, `RETURN_ADMIN_VIEW`, `REVIEW_ADMIN_VIEW` (admin tự có) | Số việc chờ xử lý |

Không có query. Response `{ data: { orders?, payments?, refunds?, returns?, reviews? } }`, chỉ gồm số nguyên. Mỗi key **chỉ có khi người gọi có quyền xem mục đó**; thiếu quyền thì bỏ hẳn key (không trả `0`) và COUNT của key đó không chạy.

| Key | Quyền cần có | Đếm | Danh sách khớp |
|---|---|---|---|
| `orders` | `ORDER_ADMIN_VIEW` | đơn `status` ∈ `pending`, `confirmed`, **trừ** đơn `pending` + `unpaid` đang có phiên QR còn hạn (`payment_attempts.status = 'PENDING'` và `expires_at > now()`) | `GET /api/admin/orders?needsAction=true` |
| `payments` | `PAYMENT_ADMIN_VIEW` | giao dịch `verification_status` ∈ `UNMATCHED`, `AMOUNT_MISMATCH`, `LATE`, `NOT_PAYABLE` mà chưa gắn phiên nào, hoặc gắn vào phiên của đơn còn `unpaid` và chưa `cancelled` | `GET /api/admin/payments/transactions?needsReview=true` |
| `refunds` | `PAYMENT_ADMIN_VIEW` | khoản hoàn `status = REQUESTED` | `GET /api/admin/refunds?status=REQUESTED` |
| `returns` | `RETURN_ADMIN_VIEW` | yêu cầu trả hàng `status = REQUESTED` (`APPROVED` đang chờ khách gửi hàng nên không tính) | `GET /api/admin/returns?status=REQUESTED` |
| `reviews` | `REVIEW_ADMIN_VIEW` | đánh giá `status = PUBLISHED` và chưa có phản hồi của cửa hàng (`reply IS NULL`); đánh giá đã ẩn không tính | `GET /api/admin/reviews?status=PUBLISHED&replied=false` |

Hai bộ lọc mới (định nghĩa ở [order](order.md) và [payment](payment.md)): `needsAction` (`GET /api/admin/orders`) và `needsReview` (`GET /api/admin/payments/transactions`), boolean tuỳ chọn, chỉ nhận chuỗi `true`/`false` (giá trị khác → `400`); `true` áp điều kiện ở bảng trên, `false` hoặc bỏ trống không lọc; kết hợp được với `search`, `sort`, `page`, `limit` và các bộ lọc có sẵn.

Lỗi: không có JWT → `401`; không có quyền nào trong bốn quyền xem → `403` `PERMISSION_DENIED`.

### 4.2 Dữ liệu

Không có bảng riêng. Các COUNT dùng index sẵn có: `IDX_orders_status`, `IDX_payment_transactions_verification_status`, `IDX_refunds_status`, `IDX_return_requests_status`, `IDX_reviews_status`; điều kiện "có QR còn hạn" dò `payment_attempts` theo `order_id`.

### 4.3 Validation (3 tầng)

- **DTO**: endpoint không có input. Bộ lọc `needsAction`/`needsReview`: `@Transform(parseQueryBoolean)` + `@IsBoolean()` + `@IsOptional()` (`parseQueryBoolean` ở `@common/dto/query-boolean.transform`).
- **Service**: quyền theo từng key (`role = 'admin'` có đủ, người khác theo `permissions`).
- **DB**: không có.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

1. `PendingCountService.get(user)` xác định quyền của người gọi và lập danh sách COUNT được phép chạy.
2. Các COUNT chạy song song (`Promise.all`), mỗi COUNT do service của module sở hữu dữ liệu thực hiện:
   - `OrderService.countNeedsAction()` và `findAllAdmin({ needsAction })` cùng dùng `ORDER_NEEDS_ACTION_SQL` (`order-needs-action.util.ts`, alias `o`).
   - `PaymentService.countNeedsReview()` và `findTransactionsAdmin({ needsReview })` cùng dùng `TRANSACTION_NEEDS_REVIEW_SQL` (`payment-needs-review.util.ts`, alias `t`, `a`, `o`).
   - `RefundService.countRequested()` đếm `status = REQUESTED`, cùng điều kiện với `findAdmin({ status: 'REQUESTED' })`.
   - `ReturnService.countRequested()` đếm `status = REQUESTED`, cùng điều kiện với `findAllAdmin({ status: 'REQUESTED' })`.
   - `ReviewService.countAwaitingReply()` đếm `status = PUBLISHED` và `reply IS NULL`, cùng điều kiện với `findAllAdmin({ status: 'PUBLISHED', replied: false })`.
3. Trả `{ data }` gồm đúng các key đã chạy.

Đơn `pending` chưa thanh toán được tính là "khách đang chuyển khoản" (không đếm) chỉ khi phiên QR còn hạn theo `expires_at`; đơn tự quay lại số đếm ngay khi quá hạn, không cần chờ bộ đếm giờ đổi phiên sang `EXPIRED`.

### 4.5 Error code

Không có mã riêng. `401` (thiếu/sai JWT) và `403` `PERMISSION_DENIED (9001)` theo chuẩn chung ([common](common.md)).

### 4.6 Phụ thuộc & cấu hình

`PendingCountModule` import `OrderModule`, `PaymentModule`, `ReturnModule`, `ReviewModule` (các module này export `OrderService`, `PaymentService`/`RefundService`, `ReturnService`, `ReviewService`). Không có biến môi trường.

### 4.7 Test

`pending-count.spec.ts` — quyền quyết định key nào có và COUNT nào chạy (admin, đủ quyền, chỉ một quyền kể cả chỉ `REVIEW_ADMIN_VIEW`, không quyền, số `0` khác với thiếu key), các COUNT chạy song song, bộ lọc danh sách và COUNT dùng đúng cùng điều kiện SQL (đơn và giao dịch; kết hợp với bộ lọc khác; `false`/bỏ trống không lọc), nội dung các điều kiện SQL, và parse boolean của query (`true`/`false`, giá trị khác bị từ chối, giữ mặc định phân trang). Việc khớp số với danh sách trên Postgres thật (mọi tình huống tạo/xử lý/huỷ) không có test tự động trong repo.

### 4.8 Lưu ý hiện trạng

- `reviews` đếm mọi đánh giá đang hiển thị chưa có phản hồi, không phân biệt số sao; số này chỉ giảm khi cửa hàng phản hồi hoặc ẩn đánh giá.
- Số liệu được tính mỗi lần gọi, không cache phía server: cache sẽ làm badge trễ ngay sau thao tác của admin (FE làm mới ngay sau mỗi thao tác xử lý).
- `payments` đếm cả giao dịch tiền vào không liên quan cửa hàng (`UNMATCHED`) cho đến khi admin gắn vào đơn; hệ thống chưa có thao tác "bỏ qua" nên giao dịch như vậy giữ nguyên trong số đếm.
- Giao dịch `LATE`/`AMOUNT_MISMATCH`/`NOT_PAYABLE` gắn vào phiên của đơn đã trả hoặc đã huỷ không còn được đếm.
- Đổi điều kiện đếm là đổi hợp đồng với các câu giải thích ở từng trang admin của FE.
