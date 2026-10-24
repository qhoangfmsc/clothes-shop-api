# 0002 — Tách `PaymentService` theo use case

> Module: `payment` (+ `order`, `pending-count` đổi chỗ tiêm) · Trạng thái: Implemented · Ngày: 2026-10-24

## 1. Bối cảnh & vấn đề

`PaymentService` (549 dòng, 6 dependency, 12 phương thức công khai) nằm trong cả hai allowlist của `architecture.spec.ts` (quá 300 dòng, quá 5 dependency). Đã đọc code, `payment.module.ts`, controller, scheduler, các consumer ngoài module (`OrderQueryService`, `OrderStatusService`, `PendingCountService`) và 5 spec của nó. Nhóm theo dependency thật sự dùng:

| Nhóm | Phương thức | Dependency dùng |
|---|---|---|
| Cấp mã QR + vòng đời phiên | `createQr`, `createQrAdmin`, `cancelPendingAttempts`, `expireOverdueAttempts` (+ `insertAttempt`, `assertPayable`, `toPayableAmount`, `generateUniqueTransferCode`, `toQrView`) | `DataSource`, `attemptRepo`, `PaymentConfigService` |
| Xác nhận thủ công | `confirmPaymentAdmin` | `DataSource` |
| Truy vấn | `getStatus`, `listAttemptsForCustomer`, `findTransactionsAdmin`, `countNeedsReview`, `findAttemptsAdmin`, `getOrderPaymentsAdmin` | `orderRepo`, `attemptRepo`, `transactionRepo`, `CurrencyService`; `findAttemptsAdmin` còn gọi `expireOverdueAttempts` |

`confirmPaymentAdmin` là luồng tiền (khoá order → transaction → attempt), dài ~125 dòng; kiểm tra "đơn còn nhận thanh toán" lặp ở `assertPayable` và ở đầu `confirmPaymentAdmin`. Ba nhóm có lý do đổi khác nhau (cách cấp mã/vòng đời phiên, luật xác nhận thủ công, bộ lọc/hiển thị).

## 2. Mục tiêu & ngoài phạm vi

- Ba service, mỗi service ≤ 300 dòng, ≤ 5 dependency; bỏ hai mục `payment.service.ts` khỏi allowlist.
- **Không đổi hành vi**: cùng route, response, transaction, thứ tự khoá (order → transaction → attempt), mã lỗi, message. Code **di chuyển nguyên văn**; chỉ thay hai chỗ kiểm tra "đơn còn nhận thanh toán" bằng một hàm thuần dùng chung (cùng mã lỗi và message).
- Ngoài phạm vi: `RefundService`, `SepayWebhookService`; đổi logic xác nhận hay cấp mã.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. `PaymentService` (QR + vòng đời), `PaymentConfirmService` (xác nhận thủ công), `PaymentQueryService` (truy vấn) | Mỗi lớp một lý do đổi; luồng tiền xác nhận nằm riêng, dễ đọc và dễ khoá; `PaymentService` giữ tên nên `OrderStatusService` và scheduler không đổi | Controller và hai module consumer phải đổi chỗ tiêm |
| B. Chỉ tách truy vấn | Rủi ro thấp nhất | `PaymentService` còn ~370 dòng, vẫn quá ngưỡng |
| C. Facade `PaymentService` chuyển tiếp sang ba service | Ít sửa chỗ gọi | Giữ lớp chỉ chuyển tiếp (đã bỏ ở order/0002) |

**Chọn A**.

### 3.2 Kiến trúc & ranh giới

```
payment/payment.service.ts           createQr, createQrAdmin, cancelPendingAttempts, expireOverdueAttempts   deps: DataSource, attemptRepo, PaymentConfigService
payment/payment-confirm.service.ts   confirmPaymentAdmin                                                      deps: DataSource
payment/payment-query.service.ts     getStatus, listAttemptsForCustomer, findTransactionsAdmin,
                                     countNeedsReview, findAttemptsAdmin, getOrderPaymentsAdmin                deps: orderRepo, attemptRepo, transactionRepo, CurrencyService, PaymentService
payment/payment-payable.util.ts      assertOrderPayable(order)  (hàm thuần, dùng ở PaymentService và PaymentConfirmService)
```
- `PaymentQueryService` → `PaymentService` một chiều, chỉ để `findAttemptsAdmin` chạy `expireOverdueAttempts` trước khi tra cứu; không có vòng.
- `PaymentModule` cung cấp ba service; export thêm `PaymentQueryService` (cho `OrderQueryService.listAttemptsForCustomer` và `PendingCountService.countNeedsReview`); `PaymentService` vẫn export (`OrderStatusService.cancelPendingAttempts`).
- `PaymentController` tiêm `PaymentService` + `PaymentQueryService`; `AdminPaymentController` tiêm cả ba.
- `CustomerPaymentAttempt` và `EFFECTIVE_ATTEMPT_STATUS_SQL` đi theo truy vấn; `generateCodeBody` đi theo QR.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Tách theo use case (command/query) | ba service | Mỗi lớp một lý do đổi, deps tối thiểu; luồng tiền xác nhận tách khỏi phần đọc | Controller và consumer tiêm nhiều service hơn |
| Hàm thuần dùng chung | `assertOrderPayable` | Cùng một luật ở hai chỗ (lần 2 trong cùng module, gom vì nằm cạnh luồng tiền) | Một file nhỏ |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Cấp mã / xác nhận / truy vấn tách lý do đổi |
| O | ✔ | Thêm bộ lọc admin chỉ sửa Query; thêm luật xác nhận chỉ sửa Confirm |
| L / I | n.a. / ✔ | `OrderQueryService` và `PendingCountService` chỉ cần Query |
| D | ✔ (trong module) | Biên ngoài (cổng thanh toán SePay) không đổi |

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Không đổi (không migration). Mỗi phương thức được cắt nguyên khối từ `payment.service.ts`.

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Unit | Chia theo service, không mất ca: `createQr`/`createQrAdmin` → `payment.service.spec.ts`; `confirmPaymentAdmin` → `payment-confirm.spec.ts`; `getStatus`, `listAttemptsForCustomer`, `findAttemptsAdmin`, `getOrderPaymentsAdmin` dựng `PaymentQueryService`; `payment-expiry.spec.ts` giữ `PaymentService`; `assertOrderPayable` có unit riêng | các spec trên + `payment-payable.util.spec.ts` |
| Unit (consumer) | `refund.service.spec.ts`, `order-checkout.service.spec.ts`, `order-query/status` spec, `pending-count.spec.ts` đổi chỗ dựng | các spec đó |
| Flow (không sửa) | checkout-and-pay, payment-admin, sepay-webhook, concurrency, lock-contract, cancel-and-refund | toàn bộ |
| Kiến trúc | Bỏ hai mục `payment.service.ts`; không service mới nào > 300 dòng / > 5 dependency | `architecture.spec.ts` |
| Phá thử | bỏ `assertOrderPayable` ở xác nhận thủ công → flow/unit đỏ | thủ công |

## 5. Rủi ro & rollback

Rủi ro: đây là luồng tiền; lỡ tay đổi thứ tự khoá hoặc bỏ kiểm tra khi cắt. Giảm thiểu: di chuyển nguyên văn, so từng dòng với file cũ, `tsc` bắt tiêm sai, toàn bộ flow thanh toán/khoá chạy lại, phá thử một điểm. Rollback: `git revert`.

## 6. Kết quả triển khai

- **File mới:** `payment-confirm.service.ts` (150 dòng, 1 dependency), `payment-query.service.ts` (263 dòng, 5 dependency), `payment-payable.util.ts` (+ `payment-payable.util.spec.ts`). **Sửa:** `payment.service.ts` (549 → 156 dòng, 3 dependency), `payment.module.ts` (export thêm `PaymentQueryService`), `payment.controller.ts`, `admin-payment.controller.ts`, `OrderQueryService`, `PendingCountService`, các spec (`payment.service`, `payment-confirm`, `payment-attempts-admin`, `payment-expiry`, `refund.service`, `order-checkout.service`, `pending-count`), allowlist kiến trúc (bỏ hai mục `payment.service.ts`).
- **Kiểm chứng di chuyển nguyên văn:** so mọi dòng khác rỗng/import của file cũ với ba file mới: chỉ khác phần import, `assertPayable` → `assertOrderPayable` (3 chỗ gọi) và `this.expireOverdueAttempts()` → `this.paymentService.expireOverdueAttempts()`.
- **Khác thiết kế:** các ca đọc (`getStatus`, `listAttemptsForCustomer`) ở lại `payment.service.spec.ts` (dùng chung `setup` với `createQr`) thay vì tách file riêng.
- **Kiểm chứng:** 829 unit (825 + 4 ca `assertOrderPayable`), 883 flow giữ nguyên và xanh, độ phủ route 98/98 và 82/82, ratchet OK; không sửa flow nào. Phá thử: bỏ `assertOrderPayable` khỏi xác nhận thủ công → 4 unit đỏ.
- **Docs:** `payment.md` (4.6, 4.9), `order.md`, `pending-count.md`, `common.md` (4.13), `test/README.md`.
