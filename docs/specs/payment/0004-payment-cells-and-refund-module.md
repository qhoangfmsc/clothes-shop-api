# 0004 — `payment` chia cell, `refund` thành module riêng

> Module: `payment`, `refund` (mới) (+ `order`, `return`, `pending-count` đổi import/module) · Trạng thái: Approved · Ngày: 2026-10-25 · Theo quy ước common/0011

## 1. Bối cảnh & vấn đề

Đã đọc code `payment` (37 file phẳng), các consumer ngoài module và `architecture.spec.ts`. Phát hiện then chốt: `payment` không dùng gì của refund, còn refund chỉ **đọc** entity `PaymentAttempt`, `PaymentTransaction` (ghi `Order`/`ReturnRequest` qua hàm của module chủ). Refund có bảng, vòng đời, route (`/api/admin/refunds`), và consumer riêng (order, return, pending-count) nên là module độc lập.

Trong phần còn lại, ba nhóm chức năng dùng chung hai entity nhưng không gọi nhau: phiên QR, giao dịch ngân hàng và webhook. `PaymentQueryService` (263 dòng) phục vụ cả ba nhóm, `AdminPaymentController` gộp năm route của ba nhóm.

## 2. Mục tiêu & ngoài phạm vi

- `refund` thành module cấp cao; `payment` chia cell `attempt`, `transaction`, `order-payments`, `sepay` + `shared`.
- **Không đổi hành vi**: cùng route (kể cả prefix `api/admin/payments` ở nhiều controller), bảng, quyền, mã lỗi, transaction, thứ tự khoá.
- Đổi tên class theo cell để tên nói đúng việc (xem 3.2).
- Ngoài phạm vi: đổi logic, tách thêm service, đổi bảng.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

Theo common/0011 (đã duyệt): refund module riêng + cell là thư mục; loại phương án "mỗi cell một Nest module" vì webhook ghi bảng attempt/transaction.

### 3.2 Kiến trúc & ranh giới

```
src/modules/refund/                      (module mới)
  refund.module.ts  refund.entity.ts  refund.constant.ts
  refund.service.ts  refund-query.service.ts  admin-refund.controller.ts
  dtos/ (admin-refund-query, complete-refund, create-refund, reject-refund)  + spec
src/modules/payment/
  payment.module.ts
  shared/        payment.constant, payment.presenter, payment-config.service, payment-attempt.entity,
                 payment-transaction.entity, payment-paid.util, payment-payable.util, payment.test-utils
  attempt/       PaymentAttemptService (createQr, createQrAdmin, cancelPendingAttempts, expireOverdueAttempts)
                 PaymentAttemptQueryService (getStatus, listAttemptsForCustomer, findAttemptsAdmin)
                 PaymentExpiryScheduler, payment-attempt-status.util
                 PaymentAttemptController (api/payments), AdminPaymentAttemptController (GET attempts, POST orders/:id/qr)
  transaction/   PaymentConfirmService, PaymentTransactionQueryService (findTransactionsAdmin, countNeedsReview)
                 payment-needs-review.util, AdminPaymentTransactionController (GET transactions, POST orders/:id/confirm)
  order-payments/ PaymentOverviewService (getOrderPaymentsAdmin), AdminPaymentOverviewController (GET orders/:id)
  sepay/         SepayWebhookController/Service, sepay-payload.util, sepay-signature.util
```
- Đổi tên: `PaymentService` → `PaymentAttemptService`, `PaymentController` → `PaymentAttemptController`; `PaymentQueryService` tách ba (phiên / giao dịch / toàn cảnh); `AdminPaymentController` tách ba.
- Cell chỉ import `shared/` và chính nó (kiểm bằng test kiến trúc). `PaymentAttemptQueryService` → `PaymentAttemptService` trong cùng cell.
- `PaymentModule` export `PaymentAttemptService` (order-status huỷ mã), `PaymentAttemptQueryService` (order-query), `PaymentTransactionQueryService` (pending-count), `PaymentConfigService`. `RefundModule` export `RefundService`, `RefundQueryService`; `OrderModule`, `ReturnModule`, `PendingCountModule` import thêm `RefundModule`.
- `RefundModule` không import `PaymentModule` (chỉ đăng ký entity attempt/transaction cho repo đọc) nên không có vòng.
- Hằng `REFUND_STATUSES`, `REFUND_REASONS` chuyển sang `refund.constant.ts`.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Package by feature (cell) | `payment/*` | Tìm file theo chức năng | Entity dùng chung ở `shared/` |
| Module độc lập theo bounded context | `refund` | Vòng đời hoàn tiền không dính phần thu tiền | Thêm một Nest module và một dòng import ở ba module consumer |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Mỗi cell một nhóm chức năng, controller admin không còn gộp |
| O | ✔ | Thêm cổng thanh toán = thêm cell cạnh `sepay`, không sửa cell khác |
| I | ✔ | `OrderQueryService` chỉ nhận `PaymentAttemptQueryService`, `PendingCountService` chỉ nhận `PaymentTransactionQueryService` |
| D | ✔ | Biên ngoài (SePay) nằm gọn trong `sepay/` |

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Không đổi (không migration). Các route giữ nguyên đường dẫn, quyền, thứ tự đăng ký tương đương; snapshot route–quyền phải không đổi.

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Unit | Spec đi theo code vào cell; `payment-confirm.spec.ts` tách phần `getOrderPaymentsAdmin` sang `order-payments/`; `payment.service.spec.ts` tách phần `getStatus`/`listAttemptsForCustomer` theo cell nếu dùng chung `setup` được | spec trong từng cell |
| Flow | Toàn bộ flow thanh toán/hoàn tiền không sửa (chỉ chuyển thư mục flow hoàn tiền nếu cần) | `test/flows/**` |
| Route table | Snapshot route–quyền không đổi | `flows/access/route-table.flow.ts` |
| Kiến trúc | Quy tắc cell của common/0011 | `architecture.spec.ts` |

## 5. Rủi ro & rollback

Rủi ro: hỏng import, thứ tự đăng ký route, DI. Giảm thiểu: công cụ viết lại import, `tsc`, route-table snapshot, toàn bộ test, `nest build`. Rollback: `git revert`.

## 6. Kết quả triển khai

_Điền sau khi làm xong._
