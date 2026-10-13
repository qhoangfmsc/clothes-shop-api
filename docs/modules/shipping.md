# shipping (`src/modules/shipping`)

> Cập nhật lần cuối: 2026-10-13

## 1. Tổng quan

Module cung cấp thông tin phương thức vận chuyển và chính sách đổi trả cho FE, đồng thời là nơi sở hữu cấu hình phí ship (`ShippingConfigService`). Phí ship, ngưỡng miễn phí và nội dung từng phương thức nằm trong dòng `SHIPPING_CONFIG` của bảng `site_configs` (admin chỉnh qua API site-config); chính sách đổi trả (số ngày, mô tả, điều kiện) cũng nằm trong cùng dòng đó. Không có bảng riêng.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/shipping` |
| Route prefix | `/api/shipping` |
| Bảng DB | không có bảng riêng — đọc dòng `SHIPPING_CONFIG` của `site_configs` ([site-config](site-config.md)) |
| Module phụ thuộc | `site-config` (`SiteConfigService.findValue`) |
| Export | `ShippingConfigService` (module [order](order.md) dùng khi checkout) |

## 2. Mục đích & nghiệp vụ phục vụ

- Cho trang giao hàng/đổi trả và bước chọn phương thức vận chuyển ở FE đọc cùng một nguồn thông tin.
- Là nguồn duy nhất của phí ship và ngưỡng miễn phí: giá hiển thị ở `GET /api/shipping` và phí tính khi checkout cùng đọc từ `SHIPPING_CONFIG`, admin đổi là có hiệu lực ngay.

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Shipping | `shipping.controller.ts` | `/api/shipping` | `@Public()` | Trả dữ liệu vận chuyển (từ config) + đổi trả |
| Config | `shipping-config.ts`, `shipping-config.service.ts` | — | nội bộ | Kiểu, giá trị mặc định, validate và đọc `SHIPPING_CONFIG` |

## 4. Chi tiết

### 4.1 API

| Method | Path | Truy cập | Mô tả |
|---|---|---|---|
| GET | `/api/shipping` | Public | Phương thức vận chuyển, chính sách đổi trả, ngưỡng miễn phí |

Response `{ data }`:

| Field | Nội dung |
|---|---|
| `methods[]` | `{ id, name, description, estimatedDays, price, icon }` lấy nguyên từ config (không có `freeAbove`; ngưỡng miễn phí áp cho cả 3 phương thức và nằm ở `freeShippingThreshold`) |
| `returnPolicy` | `{ days, description, conditions[] }` lấy từ config |
| `freeShippingThreshold` | Ngưỡng miễn phí từ config (`null` nếu tắt miễn phí ship) |

Giá trị mặc định của `methods` (dùng khi chưa có dòng `SHIPPING_CONFIG` hoặc giá trị lưu bị hỏng; cũng là giá trị seed của migration):

| `id` | Tên | Thời gian | `price` | icon |
|---|---|---|---|---|
| `standard` | Standard Shipping | 5-7 business days | 8 | `truck` |
| `express` | Express Shipping | 2-3 business days | 15 | `express` |
| `store-pickup` | Store Pickup | 1-2 business days | 0 | `store` |

Ngưỡng miễn phí mặc định: 150.

Giá trị mặc định của `returnPolicy`: `days = 30`, `description = "We accept returns within 30 days of purchase for a full refund."`, `conditions` = hàng chưa mặc và còn nguyên trạng, còn đủ tag, có bao bì gốc, hàng sale là final sale (tiếng Anh; admin đổi được qua config).

### 4.2 Dữ liệu

Không có bảng riêng. Cấu hình nằm ở `site_configs` (key `SHIPPING_CONFIG`, type `SHIPPING`, `value` là chuỗi JSON), xem [site-config](site-config.md). Cấu trúc `value`:

```json
{
  "freeShippingThreshold": 150,
  "methods": [
    { "id": "standard", "name": "...", "description": "...", "estimatedDays": "...", "price": 8, "icon": "truck" },
    { "id": "express", "...": "..." },
    { "id": "store-pickup", "...": "..." }
  ],
  "returnPolicy": { "days": 30, "description": "...", "conditions": ["..."] }
}
```

`returnPolicy` không bắt buộc trong giá trị lưu: dòng lưu trước khi có chính sách đổi trả (hoặc admin bỏ field này) được điền chính sách mặc định khi đọc và khi lưu.

### 4.3 Validation (3 tầng)

- **Public**: `GET /api/shipping` không có input.
- **Cấu hình** (khi admin `PUT /api/admin/site-config/SHIPPING_CONFIG`, kiểm bởi `parseShippingConfig` trong `shipping-config.ts`, sai → `SITE_CONFIG_VALUE_INVALID (1503)` nêu từng lỗi):
  - `value` là JSON object, không có field lạ ở mọi cấp.
  - `freeShippingThreshold`: số `0.01`–`99999999` tối đa 2 chữ số thập phân, hoặc `null` (tắt miễn phí ship).
  - `methods`: đúng 3 phần tử, mỗi `id` trong `standard`, `express`, `store-pickup` xuất hiện đúng một lần (thứ tự trong JSON không quan trọng, được chuẩn hoá khi lưu).
  - Mỗi phương thức: `name` (not empty ≤ 100), `description` (≤ 255, được rỗng), `estimatedDays` (not empty ≤ 100), `price` (số `0`–`99999999`, tối đa 2 chữ số thập phân), `icon` ∈ `truck`, `express`, `store`.
  - `returnPolicy` (tuỳ chọn): `days` số nguyên `1`–`365`, `description` ≤ 500 (được rỗng), `conditions` mảng tối đa 10 chuỗi, mỗi chuỗi not empty ≤ 255.
- **DB**: không có ràng buộc riêng ngoài `CK_site_configs_type` cho phép type `SHIPPING`.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

- `ShippingConfigService.get()` đọc `site_configs` key `SHIPPING_CONFIG` mỗi lần gọi (không cache, admin đổi là áp dụng ngay). Chưa có dòng, hoặc giá trị lưu không parse/validate được (log lỗi) → trả bản sao `DEFAULT_SHIPPING_CONFIG`, không làm lỗi checkout.
- `GET /api/shipping` trả `{ methods, returnPolicy, freeShippingThreshold }` lấy nguyên từ config.
- Checkout ([order](order.md)) gọi cùng `get()`: phí = `0` nếu `subtotal >= freeShippingThreshold` (khi ngưỡng không `null`), ngược lại `price` của phương thức đã chọn (không tìm thấy thì dùng `price` của `standard`).

### 4.5 Error code

| Code | Tên | Khi nào |
|---|---|---|
| 1503 | `SITE_CONFIG_VALUE_INVALID` | Admin lưu `SHIPPING_CONFIG` sai cấu trúc (mã thuộc nhóm site-config, xem [site-config](site-config.md)) |

### 4.6 Phụ thuộc & cấu hình

`ShippingModule` import `SiteConfigModule` và export `ShippingConfigService`; `OrderModule` import `ShippingModule`. Không có biến môi trường.

### 4.7 Test

- `shipping-config.spec.ts` — `parseShippingConfig` (config mặc định, số thập phân, `null`, chuẩn hoá thứ tự, các trường hợp bị từ chối) và `validateShippingConfigValue` (lỗi 1503).
- `shipping-config.service.spec.ts` — `ShippingConfigService.get` (đọc config, điền chính sách đổi trả mặc định khi thiếu, fallback khi thiếu dòng/JSON hỏng/sai cấu trúc, trả bản sao) và `ShippingController` (response mặc định không có `freeAbove` và `notes`, phản ánh thay đổi của admin, trả chính sách đổi trả đã cấu hình, ngưỡng `null`). `shipping-config.spec.ts` cũng cover các trường hợp `returnPolicy` hợp lệ/sai.

### 4.8 Lưu ý hiện trạng

- Giá và ngưỡng ship chỉ còn một nguồn (`SHIPPING_CONFIG`); không còn hằng số trùng trong `order.service.ts`. Danh sách phương thức hợp lệ khi checkout dùng chung `SHIPPING_METHOD_IDS` với config (`CreateOrderDto` import từ `shipping-config.ts`), nên admin chỉnh nội dung/phí chứ không thêm/bớt được phương thức.
- Ngưỡng miễn phí áp cho mọi phương thức khi checkout; response chỉ có `freeShippingThreshold`. Response không còn `notes` (các câu ghi chú cố định về gói quà và giao quốc tế trước đây không phải tính năng có thật).
- Báo giá phí ship cho một giỏ cụ thể lấy từ `POST /api/orders/quote` của module [order](order.md), không phải từ API này.
- Đơn vị tiền của `price`/ngưỡng giống `orders.total` (đơn vị cửa hàng, không phải VND; xem [payment](payment.md)). API này không trả ký hiệu tiền tệ; số VND tương ứng của một giỏ cụ thể nằm ở `amountVnd` của `POST /api/orders/quote` ([order](order.md)).
- Phí đã tính được ghi vào `orders.shipping_fee`/`total` lúc checkout; đổi config không ảnh hưởng đơn đã tạo hay phiên thanh toán đã tạo.
- Dòng `SHIPPING_CONFIG` bị xoá (`DELETE` site-config) → hệ thống dùng giá trị mặc định trong code, không lỗi.
- Nội dung `returnPolicy` mặc định là tiếng Anh; muốn hiển thị tiếng khác thì admin lưu văn bản mong muốn vào config.
