# 0001 — Trạng thái có kiểu và bảng chuyển trạng thái của đơn

> Module: `order` (+ `common` constant, `return`, `review`, `product`, `user` chỉ đổi kiểu) · Trạng thái: Implemented · Ngày: 2026-10-22

## 1. Bối cảnh & vấn đề

Convention (`engineering-principles.md`): trạng thái/enum là `as const` + type union, entity dùng đúng type đó. Hiện trạng đã đọc:

- Đã đúng: `ReturnStatus`, `RefundStatus`, `PaymentAttemptStatus`, `ReviewStatus` (entity dùng type union).
- Chưa đúng: `Order.status` và `Order.paymentStatus` là `string` (kèm comment liệt kê giá trị), `Product.status` và `User.status` là `string`; `ORDER_STATUSES` nằm trong file DTO (`dtos/admin-order.dto.ts`); `RETURNABLE_ORDER_STATUSES` (`string[]`), `REVIEWABLE_ORDER_STATUSES` và `REVIEWABLE_PAYMENT_STATUSES` (`readonly string[]`) không gắn với kiểu trạng thái đơn.
- Bảng chuyển trạng thái của đơn là `VALID_TRANSITIONS: Record<string, string[]>` trong `order.service.ts`: gõ sai tên trạng thái hoặc quên khai báo một trạng thái mới đều compile được.
- DB đã đủ tầng 3: mọi cột `status` có CHECK (`CK_orders_status`, `CK_orders_payment_status`, `CK_users_status`, `CK_products_status`...). **Không cần migration.**

Trạng thái đơn đổi ở nhiều nơi: admin qua `updateStatus` (bảng chuyển), khách huỷ (`pending → cancelled`), thanh toán tự `pending → confirmed`, hoàn tiền xong `paymentStatus → refunded`.

## 2. Mục tiêu & ngoài phạm vi

- Gõ kiểu chặt cho các cột/hằng trạng thái kể trên; gõ sai trạng thái thì compile lỗi.
- Bảng chuyển trạng thái của đơn có kiểu `Record<OrderStatus, readonly OrderStatus[]>` (thêm trạng thái mới mà quên khai báo → compile lỗi), đặt cùng chỗ với hằng trạng thái, có test tính chất.
- Luật máy ép: cột entity tên `status`/`paymentStatus` không được khai báo `string` (thêm vào `architecture.spec.ts`).
- Không đổi hành vi quan sát được (status, message, mã lỗi giữ nguyên).
- Ngoài phạm vi: cột `role`, `badge` (cũng `string`), SQL thô chứa literal trạng thái (`ORDER_NEEDS_ACTION_SQL`, `EFFECTIVE_ATTEMPT_STATUS_SQL`), thay đổi luồng trạng thái.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Kiểu chặt + bảng chuyển của đơn cục bộ (không có helper chung) | Giải đúng vấn đề đã đo, không đổi hành vi, ít code | Chưa có lớp tái dùng cho module khác |
| B. A + helper chung `Transitions<S>` trong `common/` và bảng cho return/refund/attempt/review | Một mô hình thống nhất | Chỉ order có bảng thật; các module khác kiểm theo **hành động** chứ không theo cạnh |
| C. Không làm | — | Giữ nguyên `string` |

**Vì sao không B:** return dùng bảo vệ theo hành động (admin `approve` chỉ từ `REQUESTED`, `reject` từ `REQUESTED|APPROVED`, `cancel` của khách từ `REQUESTED|APPROVED`, `receive` từ `APPROVED`), còn hệ thống có thêm cạnh `RECEIVED → APPROVED` (khoản hoàn bị từ chối, `refund.service`) và `RECEIVED → REFUNDED`. Thay `assertStatus` bằng bảng cạnh thì admin "duyệt" được yêu cầu đã nhận hàng, tức đổi hành vi. Refund/attempt/review chỉ có 1–2 cạnh đơn giản. Rule of three chưa đủ: chỉ một bảng thật, nên helper chung để lại tới khi có nhu cầu thứ hai (spec riêng).

**Chọn A.**

### 3.2 Kiến trúc & ranh giới

```
common/constants/enum-values.constant.ts   ACTIVE_STATUSES, ORDER_PAYMENT_STATUSES (+ ORDER_STATUSES chuyển vào) và các type ActiveStatus, OrderPaymentStatus, OrderStatus
order/order.constant.ts (mới)              ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]>
order/dtos/admin-order.dto.ts              import ORDER_STATUSES/OrderStatus từ common (không còn định nghĩa)
entity Order | Product | User              status: OrderStatus | ActiveStatus ...
return.constant | review.constant          RETURNABLE_*/REVIEWABLE_* gõ theo OrderStatus / OrderPaymentStatus
```
`ORDER_STATUSES` chuyển vào `common/constants` vì return, review, payment cùng dùng (tránh module này import hằng từ DTO của module khác). Phụ thuộc vẫn một chiều.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| State machine dạng bảng, kiểu chặt | `ORDER_TRANSITIONS` | Một nguồn sự thật cho luồng; compile bắt thiếu/sai trạng thái | Chỉ mô tả cạnh do **admin** thực hiện; cạnh do hệ thống (thanh toán tự xác nhận, khách huỷ) vẫn nằm ở chỗ gây ra chúng |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Hằng trạng thái ở constant, DTO chỉ validate |
| O | ✔ | Thêm trạng thái = thêm vào mảng và bảng; thiếu thì compile lỗi |
| L / I / D | n.a. | — |

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Dữ liệu: không đổi (CHECK đã có). API/luồng/lỗi: không đổi. `updateStatus` giữ nguyên message `Cannot change status from 'x' to 'y'. Allowed transitions: a, b` và mã 1302.

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Unit | Tính chất của `ORDER_TRANSITIONS`: mỗi trạng thái có mục; `completed`/`cancelled` cuối; không tự chuyển; mọi đích hợp lệ; mọi trạng thái không cuối đều tới được trạng thái cuối; `cancelled` chỉ từ `pending`/`confirmed`; bằng đúng sơ đồ đã ghi | `order/order.constant.spec.ts` (mới) |
| Kiến trúc | Cột entity `status`/`paymentStatus` không khai báo `string` | `architecture.spec.ts` |
| Flow | Admin đi đủ chuỗi `pending → confirmed → shipping → delivered → completed` (đặt `deliveredAt`); chuyển sai (`confirmed → delivered`) → 400/1302 kèm message liệt kê; từ trạng thái cuối → 1302; đơn lạ ở admin giữ nguyên hành vi hiện tại | `test/flows/order-payment/order-status.flow.ts` (mới) |
| Hồi quy | 746 unit, 39 flow, snapshot route | toàn bộ |

## 5. Rủi ro & rollback

Rủi ro: đổi kiểu cột làm vài spec dựng fake bằng chuỗi thường báo lỗi kiểu (sửa trong spec). Rollback: `git revert`.

## 6. Kết quả triển khai

- **File:** `common/constants/enum-values.constant.ts` (thêm `ORDER_STATUSES`, `OrderStatus`, `OrderPaymentStatus`, `ActiveStatus`), `order/order.constant.ts` (mới, `ORDER_TRANSITIONS`), `order.service.ts` (dùng bảng mới, bỏ `VALID_TRANSITIONS`), entity `Order`/`Product`/`User`, `return.constant.ts`, `review.constant.ts`, DTO (`status` gõ `OrderStatus`/`ActiveStatus`), `architecture.spec.ts` (+1 luật), tests mới: `order.constant.spec.ts` (5), `order-status.flow.ts` (5).
- **Khác thiết kế:** thêm gõ kiểu cho các DTO có field `status` (`CreateProductDto`, `UpdateProductDto`, `AdminProductQueryDto`, `AdminUserQueryDto`, `UpdateUserDto`, hai query DTO của order) và tham số `order` của `computeReturnEligibility`/`computeReviewEligibility`; trình biên dịch chỉ ra đúng các chỗ này. Bỏ nhánh `!allowed` trong `updateStatus` (không còn trạng thái ngoài bảng; DB có CHECK).
- **Kiểm chứng:** phá thử 5 lần (cho `shipping → cancelled`, đưa `string` lại cột entity, thêm trạng thái mà quên chuyển tiếp, gõ sai `'canceled'`, bỏ kiểm tra chuyển trạng thái trong service): test hoặc trình biên dịch bắt cả 5. `tsc`, lint, unit, flow, build qua.
- **Ghi nhận (không làm):** không có helper chung cho state machine (chỉ order có bảng cạnh thật; return kiểm theo hành động); cột `role`, `badge` vẫn `string`; SQL thô chứa literal trạng thái (`ORDER_NEEDS_ACTION_SQL`, `EFFECTIVE_ATTEMPT_STATUS_SQL`).
- **Docs:** `order.md`, `common.md` (4.5, 4.12, 4.13), `user.md`, `review.md`, `test/README.md`, `test/PROGRESS.md`, roadmap.
