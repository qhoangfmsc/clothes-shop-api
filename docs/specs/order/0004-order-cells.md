# 0004 — `order` chia cell: checkout, status, query

> Module: `order` (+ `pending-count` đổi đường import) · Trạng thái: Implemented · Ngày: 2026-10-25 · Theo common/0011, 0012

## 1. Bối cảnh & vấn đề

`order` có 12 file phẳng (ba service từ order/0002, hai controller, entity, presenter, util) và hai controller đều trộn ba nhóm chức năng: `OrderController` gồm đọc, đặt hàng, huỷ; `AdminOrderController` gồm đọc và đổi trạng thái. Nhóm theo việc thật sự làm:

| Nhóm | Phương thức / route | Dependency |
|---|---|---|
| Đặt hàng | `OrderCheckoutService` (quote, checkout); `POST /api/orders/quote`, `POST /api/orders` | `DataSource`, `ShippingConfigService`, `CurrencyService` |
| Đổi trạng thái | `OrderStatusService` (cancel, updateStatus); `PATCH /api/orders/:id/cancel`, `PATCH /api/admin/orders/:id/status` | `DataSource`, `PaymentAttemptService`, `RefundService`, `OrderQueryService` |
| Truy vấn | `OrderQueryService`; `GET /api/orders`, `/:id`; `GET /api/admin/orders`, `/:id` | `orderRepo`, `PaymentAttemptQueryService`, `RefundQueryService` |

## 2. Mục tiêu & ngoài phạm vi

- Ba cell `checkout/`, `status/`, `query/` + `shared/`; mỗi controller chỉ phục vụ một cell.
- **Không đổi hành vi**: route, quyền, response, transaction, thứ tự khoá, mã lỗi.
- Ngoài phạm vi: đổi logic.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

Theo common/0011 (cell là thư mục) và 0012 (cạnh `status → query` khai báo). Loại: giữ phẳng (không đạt "nhìn là biết").

### 3.2 Kiến trúc & ranh giới

```
src/modules/order/
  order.module.ts
  shared/    order.entity, order-item.entity, order.constant, order.presenter, order-payment-state.util
  checkout/  OrderCheckoutService, OrderCheckoutController (quote, checkout), dtos/order.dto
  status/    OrderStatusService, OrderStatusController (cancel), AdminOrderStatusController (status), dtos/admin-order.dto
  query/     OrderQueryService, order-needs-action.util, OrderQueryController, AdminOrderQueryController,
             dtos/public-order-query.dto, dtos/admin-order-query.dto
```
- `CELL_DEPENDENCIES.order = { status: ['query'] }` (đọc-sau-ghi của `cancel`/`updateStatus`).
- `OrderController` → `OrderQueryController` + `OrderCheckoutController` + `OrderStatusController`; `AdminOrderController` → `AdminOrderQueryController` + `AdminOrderStatusController`. Prefix `api/orders` và `api/admin/orders` giữ nguyên.
- `OrderModule` giữ providers, controllers theo cell; export `OrderQueryService`.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Package by feature (cell) | `order/*` | Tìm file theo chức năng | Entity dùng chung ở `shared/` |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Controller không còn gộp ba nhóm |
| I | ✔ | Cell chỉ nhận service của cell cần |
| O / L / D | n.a. | |

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Không đổi (không migration).

## 4. Kế hoạch test

Spec đi theo code vào cell; snapshot route–quyền (`route-table.flow.ts`) không đổi; toàn bộ unit/flow giữ nguyên; test kiến trúc cell (cạnh khai báo đúng, không cạnh chết).

## 5. Rủi ro & rollback

Hỏng import hoặc thứ tự đăng ký route. Giảm thiểu: công cụ viết lại import, `tsc`, snapshot route, toàn bộ test. Rollback: `git revert`.

## 6. Kết quả triển khai

- **File:** 22 file di chuyển bằng công cụ viết lại import; controller cũ tách thành 5 (`order-query`, `order-checkout`, `order-status`, `admin-order-query`, `admin-order-status`); `OrderModule` liệt kê controller theo cell; `CELL_DEPENDENCIES.order = { status: ['query'] }`.
- **Khác thiết kế:** không có.
- **Kiểm chứng:** `tsc`, biome, 842 unit, 883 flow (snapshot route–quyền không đổi), độ phủ 98/98 và 82/82.
- **Docs:** `order.md` (3, 4.7, 4.9).
