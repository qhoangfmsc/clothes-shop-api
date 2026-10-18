# currency (`src/modules/currency`)

> Cập nhật lần cuối: 2026-10-17

## 1. Tổng quan

Module tiền tệ: tiền gốc của toàn hệ thống là **VND** (số nguyên), còn **USD** chỉ là giá trị suy ra khi trả API theo tỷ giá VND/USD. Module sở hữu tỷ giá (dòng `EXCHANGE_RATE` của `site_configs`, admin chỉnh được) và `CurrencyService` để các module khác đọc tỷ giá. Không có controller và không có bảng riêng.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/currency` (helper thuần dùng chung ở `src/common/utils/money.util.ts`) |
| Route prefix | không có — admin đổi tỷ giá qua `PUT /api/admin/site-config/EXCHANGE_RATE` ([site-config](site-config.md)) |
| Bảng DB | không có bảng riêng — dòng `EXCHANGE_RATE` (type `CURRENCY`) của `site_configs`; cột `orders.exchange_rate` ([order](order.md)) |
| Module phụ thuộc | `site-config` (`SiteConfigService.findValue`) |
| Export | `CurrencyService` |

## 2. Mục đích & nghiệp vụ phục vụ

- Phục vụ khách Việt Nam là chính: giá, phí ship, tổng đơn, số tiền chuyển khoản, hoàn tiền đều lưu và tính bằng VND.
- Khi giao diện chuyển sang ngôn ngữ nước ngoài, FE hiển thị USD. BE trả sẵn **cả hai giá trị** ở mọi API có tiền (FE không tự quy đổi); không có `Accept-Language` hay tham số chọn tiền tệ ở BE.
- Tỷ giá do admin đặt một chỗ duy nhất; đơn hàng chốt tỷ giá lúc đặt để USD của đơn không đổi khi tỷ giá thay đổi sau đó.

## 3. Submodule & chức năng

| Submodule | File | Chức năng |
|---|---|---|
| Tỷ giá | `exchange-rate-config.ts` | Kiểu, giá trị mặc định, parse/validate giá trị `EXCHANGE_RATE` |
| Dịch vụ | `currency.service.ts` | `getVndPerUsd()`, `toUsd(vnd)` |
| Helper | `src/common/utils/money.util.ts` | `vndToUsd`, `money`, `moneyOrNull`, `MAX_MONEY_VND` |
| Presenter | `product/product.presenter.ts`, `order/order.presenter.ts`, `payment/payment.presenter.ts` | Đổi field tiền của entity thành cặp `...Vnd`/`...Usd` |

## 4. Chi tiết

### 4.1 API

Module không có endpoint. Tỷ giá đọc/ghi qua API site-config:

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/site-config?key=EXCHANGE_RATE` | Public | Dòng thô (`data: null` nếu chưa có) |
| PUT | `/api/admin/site-config/EXCHANGE_RATE` | `SITE_CONFIG_UPSERT` | Đặt tỷ giá; `value` là chuỗi JSON `{"vndPerUsd": 25000}` |

**Quy ước field tiền trong mọi response** (`<tên>Vnd` số nguyên, `<tên>Usd` số có tối đa 2 chữ số thập phân; field `null` thì cả hai đều `null`):

| Module | Response | Field |
|---|---|---|
| [product](product.md), [collection](collection.md), [cart](cart.md), [wishlist](wishlist.md) | Sản phẩm | `priceVnd/Usd`, `originalPriceVnd/Usd` (`null` khi không có giá gốc) |
| [product](product.md) | Autocomplete | `priceVnd/Usd` |
| [cart](cart.md) | Giỏ | `subtotalVnd/Usd`, từng dòng `lineTotalVnd/Usd` |
| [shipping](shipping.md) | `GET /api/shipping` | `methods[].priceVnd/Usd`, `freeShippingThresholdVnd/Usd` (`null` khi tắt miễn phí ship) |
| [order](order.md) | Quote | `subtotalVnd/Usd`, `shippingFeeVnd/Usd`, `totalVnd/Usd`, `freeShippingThresholdVnd/Usd`, `exchangeRate` |
| [order](order.md) | Đơn (khách + admin) | `subtotalVnd/Usd`, `shippingFeeVnd/Usd`, `totalVnd/Usd`, `items[].priceVnd/Usd`, `exchangeRate` |
| [payment](payment.md) | QR (khách + admin), `GET /api/payments/:orderId/status`, phiên thanh toán, giao dịch, hoàn tiền | `amountVnd/Usd`, `paidAmountVnd/Usd`, `order.totalVnd/Usd`, `exchangeRate` (QR, status và view admin). `qrUrl` chỉ mang số VND vì chuẩn VietQR |
| [return](return.md) | Yêu cầu trả hàng | `items[].priceVnd/Usd`, `refund.amountVnd/Usd`, `order.totalVnd/Usd`, `order.shippingFeeVnd/Usd` (admin) |

Input (body/query) luôn là VND: `priceVnd`, `originalPriceVnd` (product), `priceVnd`/`freeShippingThresholdVnd` trong `SHIPPING_CONFIG`, `amountVnd` (xác nhận thanh toán thủ công), `minPrice`/`maxPrice` (lọc sản phẩm). Không API nào nhận USD.

### 4.2 Dữ liệu

Giá trị `EXCHANGE_RATE` (cột `site_configs.value`, chuỗi JSON):

```json
{ "vndPerUsd": 25000 }
```

`vndPerUsd` = số VND cho 1 USD. Cột `orders.exchange_rate` numeric(12,2) NOT NULL (`CK_orders_exchange_rate > 0`) lưu tỷ giá lúc đặt đơn ([order](order.md)). Migration `VndBaseCurrency` đổi kiểu cột tiền sang bigint, thêm `orders.exchange_rate`, mở rộng `CK_site_configs_type` thêm `CURRENCY` và seed dòng `EXCHANGE_RATE` (xem [common](common.md)).

### 4.3 Validation (3 tầng)

- **DTO**: `PUT /api/admin/site-config/:key` chỉ kiểm `value` là JSON không rỗng (xem [site-config](site-config.md)).
- **Service**: validator `validateExchangeRateConfigValue` (đăng ký trong `SITE_CONFIG_VALUE_VALIDATORS`) chạy khi upsert: `value` là JSON object, không có field lạ, `vndPerUsd` là số `1`–`1000000` tối đa 2 chữ số thập phân; sai → `SITE_CONFIG_VALUE_INVALID (1503)` nêu từng lỗi.
- **DB**: `CK_site_configs_type` cho phép type `CURRENCY`; `CK_orders_exchange_rate`.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

- `getVndPerUsd()` đọc dòng `EXCHANGE_RATE` mỗi lần gọi (không cache, admin đổi là áp dụng ngay). Chưa có dòng hoặc giá trị lưu không parse/validate được (log lỗi) → trả `DEFAULT_VND_PER_USD = 25000`, không làm lỗi API.
- Công thức: `usd = round(vnd / vndPerUsd, 2)` (`vndToUsd`). Mọi tổng được cộng bằng VND (số nguyên) trước rồi mới đổi sang USD, nên USD của tổng luôn là quy đổi của tổng VND (không phải tổng các USD đã làm tròn).
- Tỷ giá dùng cho USD:
  - Dữ liệu danh mục và giỏ (sản phẩm, giỏ, wishlist, collection, autocomplete, shipping, quote): tỷ giá hiện tại.
  - Dữ liệu gắn với một đơn (đơn, dòng đơn, phiên thanh toán, giao dịch, hoàn tiền, trả hàng): `orders.exchange_rate` chốt lúc checkout; giao dịch chưa khớp đơn nào (admin đối soát) dùng tỷ giá hiện tại.
- Số tiền khách chuyển khoản (`payment_attempts.amount`) bằng đúng `orders.total` (VND), không còn bước quy đổi tỷ giá.

### 4.5 Error code

| Code | Tên | Khi nào |
|---|---|---|
| 1503 | `SITE_CONFIG_VALUE_INVALID` | Admin lưu `EXCHANGE_RATE` sai cấu trúc (mã thuộc nhóm site-config) |

### 4.6 Phụ thuộc & cấu hình

`CurrencyModule` import `SiteConfigModule` và export `CurrencyService`; được import bởi `ProductModule`, `CartModule`, `WishlistModule`, `CollectionModule`, `ShippingModule`, `OrderModule`, `PaymentModule`. Không có biến môi trường (tỷ giá chỉ nằm ở dòng `EXCHANGE_RATE`).

### 4.7 Test

- `currency.service.spec.ts` — `getVndPerUsd` (đọc dòng mỗi lần, fallback khi thiếu dòng/JSON hỏng/sai cấu trúc), `toUsd`, `parseExchangeRateConfig`, `validateExchangeRateConfigValue` (lỗi 1503).
- `src/common/utils/money.util.spec.ts` — `vndToUsd` (làm tròn 2 chữ số, nhận chuỗi số), `money`, `moneyOrNull`.
- `product/product.presenter.spec.ts`, `order/order.presenter.spec.ts` — đổi field tiền, tỷ giá chốt trên đơn.
- `site-config/site-config.service.spec.ts` — lưu và từ chối `EXCHANGE_RATE`.

### 4.8 Lưu ý hiện trạng

- USD chỉ để hiển thị: mọi phép tính, so sánh, lọc, sắp xếp và thanh toán đều bằng VND.
- Ngoại lệ có chủ đích là dữ liệu do bên ngoài tạo ra, BE không can thiệp: số tiền trong ảnh `qrUrl` của VietQR, và `raw_payload`/`transferAmount` SePay gửi qua webhook (lưu nguyên văn, chỉ VND). Mọi field tiền BE tự trả ra, kể cả số tiền trong thông báo lỗi 1710, đều có cả VND và USD.
- Giá USD của sản phẩm có thể lẻ (vd 350.000₫ ở tỷ giá 26.000 là 13.46); không có giá USD đặt riêng cho từng sản phẩm.
- Đổi tỷ giá chỉ ảnh hưởng USD hiển thị của dữ liệu danh mục/giỏ/báo giá và đơn đặt sau đó; đơn đã đặt giữ tỷ giá cũ.
- Xoá dòng `EXCHANGE_RATE` (`DELETE` site-config) → hệ thống dùng tỷ giá mặc định 25000.
- Migration chỉ đổi kiểu cột và tên khoá của `SHIPPING_CONFIG`, không nhân giá trị cũ với tỷ giá: giá sản phẩm, phí ship, ngưỡng miễn phí ship đang có trong DB được hiểu là VND và do admin nhập lại; đơn cũ giữ số cũ (làm tròn) với tỷ giá seed.
