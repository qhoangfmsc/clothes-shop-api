# 0003 — Tách `RefundService` thành đọc và ghi

> Module: `payment` (+ `order`, `pending-count` đổi chỗ tiêm) · Trạng thái: Implemented · Ngày: 2026-10-24 · Cỡ: rút gọn (không đổi hành vi)

## 1. Bối cảnh & vấn đề

`RefundService` (363 dòng theo cách đếm của `architecture.spec.ts`) còn trong `OVERSIZED_SERVICES`. Đã đọc code, `AdminRefundController`, `OrderQueryService`, `OrderStatusService`, `PendingCountService`, `ReturnService`, `refund.service.spec.ts`. Hai nhóm:

| Nhóm | Phương thức |
|---|---|
| Đọc | `countRequested`, `listForCustomer`, `findAdmin`, `getAdminView` (+ `adminQueryBuilder`, `toAdminViews`, `CustomerRefund`) |
| Ghi | `createForCancelledOrder`, `createForReturn`, `createAdmin`, `completeAdmin`, `rejectAdmin` (+ `insertRequest`, `receivedAmount`, `sumCompleted`, `prorateRefundAmount`) |

## 2. Mục tiêu & ngoài phạm vi

- `RefundQueryService` (đọc, dựng view admin/khách) và `RefundService` (ghi, giữ tên vì `OrderStatusService`, `ReturnService` gọi `createForCancelledOrder`/`createForReturn`); bỏ mục `refund.service.ts` khỏi allowlist.
- **Không đổi hành vi**: cùng route, response, transaction, thứ tự khoá (đơn → khoản hoàn), mã lỗi. Code **di chuyển nguyên văn**.
- Ngoài phạm vi: đổi công thức hoàn (`prorateRefundAmount`), luật chuyển trạng thái.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Tách đọc/ghi như order, review, payment, return | Đồng nhất; ghi gọi đọc một chiều để trả view sau khi ghi | Thêm một service |
| B. Giữ nguyên, nâng ngưỡng | Không rủi ro | Trái mục tiêu đưa allowlist về rỗng |

**Chọn A**.

### 3.2 Kiến trúc & ranh giới

```
payment/refund-query.service.ts   countRequested, listForCustomer, findAdmin, getAdminView (+ views)   deps: refundRepo, transactionRepo
payment/refund.service.ts         createForCancelledOrder, createForReturn, createAdmin, completeAdmin, rejectAdmin   deps: DataSource, RefundQueryService
```
- `RefundService` → `RefundQueryService` một chiều (trả view admin sau khi ghi); không vòng.
- `PaymentModule` cung cấp cả hai, export `RefundService` (ghi: order, return) và `RefundQueryService` (đọc: order, pending-count).
- `OrderQueryService` và `PendingCountService` tiêm `RefundQueryService`; `AdminRefundController` tiêm Query + Command.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Tách command/query theo use case | hai service | Phần dựng view (VND/USD, nguồn tiền) tách khỏi luồng tiền hoàn | Controller và consumer tiêm nhiều service hơn |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Hiển thị tách khỏi luật hoàn tiền |
| I | ✔ | `OrderQueryService`, `PendingCountService` chỉ cần Query |
| O / L / D | n.a. / n.a. / ✔ | Không đổi |

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Không đổi (không migration). Phương thức cắt nguyên khối; chỉ `this.getAdminView` đổi sang `this.queryService.getAdminView`.

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Unit | `refund.service.spec.ts` dựng cả hai service; ca đọc gọi Query; các spec của order/return/pending-count đổi chỗ dựng | spec liên quan |
| Flow (không sửa) | cancel-and-refund, return flow, order-status, concurrency | toàn bộ |
| Kiến trúc | Bỏ mục `refund.service.ts` | `architecture.spec.ts` |
| Phá thử | bỏ kiểm tra tổng đã hoàn trong `completeAdmin`/`createForCancelledOrder` → test đỏ | thủ công |

## 5. Rủi ro & rollback

Luồng tiền hoàn nằm trong phần ghi (chỉ đổi cách trả view). Giảm thiểu: di chuyển nguyên văn, đối chiếu từng dòng, toàn bộ flow hoàn tiền chạy lại. Rollback: `git revert`.

## 6. Kết quả triển khai

- **File mới:** `refund-query.service.ts` (145 dòng, 2 dependency). **Sửa:** `refund.service.ts` (352 → 229 dòng, 3 dependency), `payment.module.ts` (export thêm `RefundQueryService`), `admin-refund.controller.ts`, `OrderQueryService`, `PendingCountService`, `refund.service.spec.ts`, `order-status.service.spec.ts`, allowlist kiến trúc (bỏ mục `refund.service.ts`).
- **Kiểm chứng di chuyển nguyên văn:** so mọi dòng của file cũ với hai file mới: chỉ khác import và `this.getAdminView` → `this.queryService.getAdminView` (`getAdminView` thành public).
- **Khác thiết kế:** `RefundService` vẫn giữ `Repository<Refund>` (`completeAdmin`/`rejectAdmin` đọc khoản hoàn bằng nó) nhưng không còn `Repository<PaymentTransaction>`.
- **Kiểm chứng:** 829 unit và 883 flow đều xanh, độ phủ route 98/98 và 82/82; không sửa flow nào. Phá thử: đổi điều kiện `refundedAfter === paid` ở `completeAdmin` → 4 unit đỏ.
- **Docs:** `payment.md` (4.6, 4.9), `order.md`, `pending-count.md`, `common.md` (4.13).
