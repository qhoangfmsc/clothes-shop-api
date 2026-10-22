# 0002 — Tách `OrderService` theo use case

> Module: `order` (+ `pending-count` đổi chỗ tiêm) · Trạng thái: Implemented · Ngày: 2026-10-22

## 1. Bối cảnh & vấn đề

`OrderService` (391 dòng, 6 dependency, 11 phương thức) nằm trong allowlist của `architecture.spec.ts` (quá 300 dòng, quá 5 dependency). Đã đọc code, controller, module, `PendingCountService`, `order.service.spec.ts` (738 dòng) và `pending-count.spec.ts`. Khi gom theo dependency mà phương thức thật sự dùng, ba nhóm gần như không chồng lấn:

| Nhóm | Phương thức | Dependency dùng |
|---|---|---|
| Truy vấn | `findAll`, `findOne`, `findAllAdmin`, `findOneAdmin`, `countNeedsAction` | `orderRepo`; `findOne` còn dùng `paymentService`, `refundService` |
| Đặt hàng | `quote`, `checkout` + `resolveDelivery`, `loadSelectedItems`, `calculateTotals` | `dataSource`, `shippingConfigService`, `currencyService` |
| Đổi trạng thái | `cancel`, `updateStatus` + `cancelLocked` | `dataSource`, `paymentService`, `refundService`; `cancel` kết thúc bằng `findOne`, `updateStatus` bằng `findOneAdmin` |

Người dùng của `OrderService`: `OrderController`, `AdminOrderController`, `PendingCountService` (chỉ `countNeedsAction`), module export. Mỗi nhóm có lý do đổi khác nhau (query/filter, quy tắc tính tiền và đặt hàng, luật huỷ và chuyển trạng thái).

## 2. Mục tiêu & ngoài phạm vi

- Ba service, mỗi service một nhóm, đều ≤ 300 dòng và ≤ 5 dependency; `OrderService` bị xoá; allowlist kiến trúc bỏ hai mục của `order.service.ts`.
- **Không đổi hành vi**: cùng route, cùng response, cùng transaction, cùng thứ tự khoá (`Order` trước), cùng mã lỗi. Code được **di chuyển nguyên văn**, không viết lại.
- Ngoài phạm vi: đổi logic tính tiền/huỷ/đổi trạng thái; tách `PaymentService`, `ReviewService`, `ReturnService` (còn trong allowlist); sửa quirk `ORDER_NOT_FOUND` 400 ở admin.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Ba service (`OrderQueryService`, `OrderCheckoutService`, `OrderStatusService`), xoá `OrderService`, controller tiêm trực tiếp | Mỗi service một lý do đổi, deps ≤ 4, không còn lớp rỗng; allowlist co lại | Sửa controller, `PendingCountService`, chia lại spec |
| B. Giữ `OrderService` làm facade chuyển tiếp sang ba service | Ít sửa controller/pending-count/spec | Giữ một lớp chỉ chuyển tiếp (indirection không có giá trị), `OrderService` vẫn tồn tại như điểm tập trung |
| C. Chỉ tách phần truy vấn | Rủi ro thấp nhất; `OrderService` còn ~280 dòng, 5 dependency, qua cả hai ngưỡng | Đặt hàng, huỷ, đổi trạng thái vẫn chung một lớp |

**Chọn A**; tách theo đường ranh dependency thật đã đo, không cần facade.

### 3.2 Kiến trúc & ranh giới

```
order/order-query.service.ts     findAll, findOne, findAllAdmin, findOneAdmin, countNeedsAction       deps: orderRepo, PaymentService, RefundService
order/order-checkout.service.ts  quote, checkout (+ resolveDelivery, loadSelectedItems, calculateTotals)  deps: DataSource, ShippingConfigService, CurrencyService
order/order-status.service.ts    cancel, updateStatus (+ cancelLocked)                                  deps: DataSource, PaymentService, RefundService, OrderQueryService
order/order.constant.ts          + ORDER_RELATIONS (dùng chung truy vấn và checkout)
```
- `joinItems` (query builder) chỉ dùng ở truy vấn nên ở lại `order-query.service.ts`.
- `OrderStatusService` phụ thuộc `OrderQueryService` một chiều để trả chi tiết đơn sau khi ghi (đọc-sau-ghi giữ nguyên hành vi); không có vòng.
- `OrderModule` cung cấp ba service, **export `OrderQueryService`** (chỉ `PendingCountService` dùng bên ngoài); `PendingCountService` tiêm `OrderQueryService`.
- `OrderController` tiêm Query + Checkout + Status; `AdminOrderController` tiêm Query + Status.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Tách theo use case (command/query) | Ba service | Mỗi lớp một lý do đổi; deps tối thiểu | Controller tiêm nhiều service hơn |
| Không dùng Facade | — | Facade chỉ chuyển tiếp sẽ giữ lại điểm tập trung vừa gỡ | — |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Truy vấn / đặt hàng / đổi trạng thái tách lý do đổi |
| O | ✔ | Thêm bộ lọc admin chỉ sửa Query; thêm phương thức giao hàng chỉ sửa Checkout |
| L / I | n.a. / ✔ | Mỗi consumer chỉ tiêm service nó cần (`PendingCountService` chỉ cần Query) |
| D | ✔ (trong module) | Phụ thuộc class cụ thể qua DI; biên ngoài (`PaymentService`, `RefundService`) giữ như cũ |

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Không đổi. Mỗi phương thức được cắt nguyên khối từ `order.service.ts`; chỉ đổi `this.xxx` sang dependency của lớp mới. Thứ tự khoá, transaction, mã lỗi, message giữ nguyên.

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Flow (đặc tả trước khi di chuyển) | Danh sách của khách (chỉ đơn của mình, lọc `status`, `sort=-createdAt`/`createdAt`, phân trang), chi tiết đơn (kèm `paymentAttempts`, `refunds`), admin list (lọc `status`/`paymentStatus`/`userId`/`search` theo SĐT, `needsAction`) và admin detail; response có cặp `Vnd`/`Usd` | `test/flows/order-payment/order-queries.flow.ts` (mới, viết **trước** khi tách và chạy trên code cũ) |
| Unit | `order.service.spec.ts` chia theo service: checkout/quote → `order-checkout.service.spec.ts`; `findOne` → `order-query.service.spec.ts`; luật huỷ → `order-status.service.spec.ts`; `pending-count.spec.ts` dựng `OrderQueryService` | các spec mới |
| Flow có sẵn (không sửa) | checkout-and-pay, cancel-and-refund, order-errors, order-status, lock-contract, concurrency | toàn bộ |
| Kiến trúc | Xoá hai mục `order.service.ts` khỏi allowlist; không service mới nào > 300 dòng / > 5 dependency | `architecture.spec.ts` |

## 5. Rủi ro & rollback

Rủi ro: lỡ tay đổi hành vi khi cắt; lệch tiêm phụ thuộc trong module. Giảm thiểu: di chuyển nguyên văn, flow đặc tả truy vấn viết trước, toàn bộ flow thanh toán/khoá/trạng thái chạy lại, `tsc` bắt tiêm sai. Rollback: `git revert` các commit của phần này.

## 6. Kết quả triển khai

- **File mới:** `order-query.service.ts` (128 dòng, 3 dependency), `order-checkout.service.ts` (205 dòng, 3 dependency), `order-status.service.ts` (89 dòng, 4 dependency), `order-query.service.spec.ts`, `order-checkout.service.spec.ts`, `order-status.service.spec.ts`, `test/flows/order-payment/order-queries.flow.ts`. **Đã xoá:** `order.service.ts`, `order.service.spec.ts`. **Sửa:** `order.constant.ts` (+ `ORDER_RELATIONS`), `order.module.ts` (providers ba service, export `OrderQueryService`), hai controller, `PendingCountService` và spec, allowlist kiến trúc (bỏ hai mục `order.service.ts`).
- **Kiểm chứng di chuyển nguyên văn:** so từng dòng file cũ với ba file mới: chỉ khác phần đầu lớp, constructor, hai lời gọi đọc-sau-ghi (`this.queryService.findOne/findOneAdmin`), hằng `ORDER_RELATIONS` chuyển sang constant và bỏ banner phần admin.
- **Khác thiết kế:** builder `cart` dùng lại giỏ có sẵn của user (cột `carts.user_id` UNIQUE) để một khách đặt nhiều đơn trong flow test.
- **Kiểm chứng:** 755 unit test (số không đổi: spec được chia, không mất ca), 56 flow test (+4 truy vấn), flow đặc tả truy vấn viết và chạy **trước** khi tách; phá thử 4 điểm truy vấn (bỏ lọc `status`, bỏ giới hạn theo user, bỏ `needsAction`, bỏ phiên thanh toán khỏi chi tiết) và 2 điểm sau khi tách (`cancel` không khoá, `findAll` không lọc theo user) đều bị bắt.
- **Docs:** `order.md` (4.6, 4.7, mục mới 4.9 Thiết kế & pattern), `pending-count.md`, `common.md` (4.13), `shipping.md`, `return.md`, `test/README.md`, `test/PROGRESS.md`, skill `design-principles`, rule `engineering-principles`, roadmap.
