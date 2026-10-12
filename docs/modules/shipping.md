# shipping (`src/modules/shipping`)

> Cập nhật lần cuối: 2026-10-12

## 1. Tổng quan

Module cung cấp dữ liệu tĩnh về các phương thức vận chuyển và chính sách đổi trả. Không có bảng DB, không có service; dữ liệu là hằng số ngay trong controller.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/shipping` |
| Route prefix | `/api/shipping` |
| Bảng DB | không có — dữ liệu tĩnh |
| Module phụ thuộc | không |
| Export | không |

## 2. Mục đích & nghiệp vụ phục vụ

Cho trang giao hàng/đổi trả và bước chọn phương thức vận chuyển ở FE đọc cùng một nguồn thông tin.

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Shipping | `shipping.controller.ts` | `/api/shipping` | `@Public()` | Trả toàn bộ dữ liệu vận chuyển + đổi trả |

## 4. Chi tiết

### 4.1 API

| Method | Path | Truy cập | Mô tả |
|---|---|---|---|
| GET | `/api/shipping` | Public | Phương thức vận chuyển, chính sách đổi trả, ngưỡng miễn phí, ghi chú |

Response `{ data: SHIPPING_DATA }`:

| Field | Nội dung |
|---|---|
| `methods[]` | `{ id, name, description, estimatedDays, price, freeAbove?, icon }` |
| `returnPolicy` | `{ days: 30, description, conditions[] }` |
| `freeShippingThreshold` | `150` |
| `notes[]` | Ghi chú hiển thị (miễn phí ship trên $150, giao quốc tế một số nước, gói quà +$5) |

`methods`:

| `id` | Tên | Thời gian | `price` | Khác |
|---|---|---|---|---|
| `standard` | Standard Shipping | 5-7 business days | 8 | `freeAbove: 150`, icon `truck` |
| `express` | Express Shipping | 2-3 business days | 15 | icon `express` |
| `store-pickup` | Store Pickup | 1-2 business days | 0 | icon `store` |

`returnPolicy`: 30 ngày; điều kiện: hàng chưa mặc và còn nguyên trạng, còn đủ tag, có bao bì gốc, hàng sale là final sale.

### 4.2 Dữ liệu

Không có bảng. Dữ liệu là hằng số `SHIPPING_DATA` trong `shipping.controller.ts`.

### 4.3 Validation (3 tầng)

Không có input nên không có DTO, service hay DB validation.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

Controller trả nguyên hằng số. Phí ship thực tế khi tạo đơn được tính ở module [order](order.md) bằng bảng phí riêng trong `order.service.ts`.

### 4.5 Error code

Không có.

### 4.6 Phụ thuộc & cấu hình

Không có.

### 4.7 Test

Chưa có test.

### 4.8 Lưu ý hiện trạng

- Giá/ngưỡng ship ở đây và trong `order.service.ts` (`SHIPPING_FEES`, `FREE_SHIPPING_THRESHOLD`) được khai báo độc lập, không dùng chung hằng số.
- Phương thức giao hàng hợp lệ khi checkout (`standard`, `express`, `store-pickup`) trùng với `id` của `methods` nhưng được khai báo riêng ở `CreateOrderDto`.
- `ShippingModule` không có provider/service, chỉ có controller; `ApiTags('Shipping')` được mô tả trong cấu hình Swagger.
