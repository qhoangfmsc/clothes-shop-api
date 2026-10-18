# site-config (`src/modules/site-config`)

> Cập nhật lần cuối: 2026-10-16

## 1. Tổng quan

Module cấu hình theo `key`: các banner nội dung trang, cấu hình phí ship và tỷ giá VND/USD. Mỗi key gắn với đúng một `type`; `value` là chuỗi JSON. Với banner, FE/admin tự định hình nội dung và BE không diễn giải; riêng key mà BE đọc để tính toán (`SHIPPING_CONFIG`, `EXCHANGE_RATE`) có validator cấu trúc riêng.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/site-config` |
| Route prefix | `/api/site-config` (public), `/api/admin/site-config` (admin) |
| Bảng DB | `site_configs` |
| Module phụ thuộc | không |
| Export | `SiteConfigService` |

## 2. Mục đích & nghiệp vụ phục vụ

Admin chỉnh nội dung hero/banner ở các vị trí cố định của trang (Shop, New In, Collections, menu điều hướng) phí ship/ngưỡng miễn phí ship và tỷ giá VND/USD mà không cần deploy; FE công khai đọc theo key để render, BE đọc `SHIPPING_CONFIG` để tính phí khi checkout và `EXCHANGE_RATE` ([currency](currency.md)) để suy ra giá USD.

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Public | `site-config.controller.ts` | `/api/site-config` | `@Public()` | Lấy 1 config theo key |
| Admin | `admin-site-config.controller.ts` | `/api/admin/site-config` | JWT + permission | Liệt kê key khả dụng, list config đã lưu, upsert, xoá |

## 4. Chi tiết

### 4.1 API

| Method | Path | Truy cập | Mô tả |
|---|---|---|---|
| GET | `/api/site-config?key=` | Public | Lấy 1 config |
| GET | `/api/admin/site-config/keys` | `SITE_CONFIG_VIEW` | Mọi key khả dụng kèm type (kể cả key chưa cấu hình) |
| GET | `/api/admin/site-config` | `SITE_CONFIG_VIEW` | Các config đã lưu |
| PUT | `/api/admin/site-config/:key` | `SITE_CONFIG_UPSERT` | Tạo mới hoặc cập nhật theo key |
| DELETE | `/api/admin/site-config/:key` | `SITE_CONFIG_DELETE` | Xoá theo key |

**GET `/api/site-config`** — `PublicSiteConfigQueryDto`: `key` bắt buộc, `IsEnum(SiteConfigKey)`. Response `{ data: SiteConfig | null }` (chưa có dòng → `data: null`). Đây là DTO không phải list.

**GET `/keys`** → `{ data: [{ key, type }] }`.

**GET list admin** → `{ data: SiteConfig[], total }` (sắp theo `key` ASC, không phân trang).

**PUT `/:key`** — `UpsertSiteConfigDto`: `value` (`IsJSON`, not empty; chuỗi JSON). Response `{ data: SiteConfig }`. `type` do BE suy ra từ key.

**DELETE `/:key`** → `{ message: 'Site config deleted successfully' }`.

Registry (`site-config.constant.ts`):

| Key (`SiteConfigKey`) | Type (`SiteConfigType`) |
|---|---|
| `SHOP_HERO_BANNERS` | `BANNER` |
| `NEW_IN_HERO_BANNERS` | `BANNER` |
| `COLLECTIONS_HERO_BANNERS` | `BANNER` |
| `NAV_MENU_BANNERS` | `BANNER` |
| `SHIPPING_CONFIG` | `SHIPPING` |
| `EXCHANGE_RATE` | `CURRENCY` |

`SiteConfigType` có bốn giá trị: `BANNER`, `TEXT` (chưa có key nào dùng `TEXT`), `SHIPPING`, `CURRENCY`.

Cấu trúc `value` của `SHIPPING_CONFIG` và quy tắc validate: xem [shipping](shipping.md). Admin sửa qua `PUT /api/admin/site-config/SHIPPING_CONFIG` với `value` là chuỗi JSON của cấu hình; `GET /api/site-config?key=SHIPPING_CONFIG` trả dòng thô, FE nên đọc `GET /api/shipping`. Cấu trúc `value` của `EXCHANGE_RATE` (`{"vndPerUsd": 25000}`) và quy tắc validate: xem [currency](currency.md).

### 4.2 Dữ liệu

Bảng `site_configs` (entity `SiteConfig extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `key` | varchar(64) | UNIQUE (`UQ_site_configs_key`) |
| `type` | varchar(32) | `CK_site_configs_type` ∈ (`BANNER`, `TEXT`, `SHIPPING`, `CURRENCY`) |
| `value` | text | chuỗi JSON |
| `created_at`, `updated_at` | timestamptz | |

Migration `AddSiteConfig` seed 4 key banner với `value = '[]'`; migration `AddShippingConfig` mở rộng CHECK và seed `SHIPPING_CONFIG` (type `SHIPPING`) với phí/ngưỡng đang áp dụng lúc đó (standard 8, express 15, store-pickup 0, miễn phí từ 150; các số này sau `VndBaseCurrency` được hiểu là VND), không ghi đè nếu đã có dòng. Migration `VndBaseCurrency` mở rộng CHECK thêm `CURRENCY`, seed dòng `EXCHANGE_RATE` (tỷ giá 25000; không ghi đè nếu đã có dòng) và đổi tên khoá trong `SHIPPING_CONFIG` sang `priceVnd`/`freeShippingThresholdVnd` (giá trị làm tròn về số nguyên, không nhân tỷ giá).

### 4.3 Validation (3 tầng)

- **DTO**: `key` thuộc enum `SiteConfigKey` (public); `value` là JSON hợp lệ và không rỗng (admin).
- **Service**: `key` ở route admin phải thuộc `SiteConfigKey` (path param là string tự do nên được kiểm tra thủ công); key có validator trong `SITE_CONFIG_VALUE_VALIDATORS` (`site-config.validators.ts`, hiện `SHIPPING_CONFIG` và `EXCHANGE_RATE`) phải qua validator cấu trúc, sai → `SITE_CONFIG_VALUE_INVALID`; xoá yêu cầu config tồn tại.
- **DB**: UNIQUE `key`, CHECK `type` (gồm `CURRENCY`).

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

- **Upsert**: key không thuộc registry → `SITE_CONFIG_KEY_INVALID`; nếu key có validator thì `value` được validate và thay bằng bản JSON chuẩn hoá (sai → `SITE_CONFIG_VALUE_INVALID`); `type` = `SITE_CONFIG_KEY_TYPE[key]`; tìm dòng theo key: có thì cập nhật `value` và `type`, chưa thì tạo mới. Cố ý không dùng `repo.upsert()` vì câu `INSERT … ON CONFLICT` thô bỏ qua hook `@BeforeInsert` nên id không được sinh.
- **Delete**: không tìm thấy → `SITE_CONFIG_NOT_FOUND`; xoá dòng thật (sau đó public trả `data: null` cho key đó).
- **Đọc cho BE**: `findValue(key)` trả `value` thô hoặc `null` (dùng bởi `ShippingConfigService`).
- **Thêm key mới** nằm ở `SiteConfigKey` + `SITE_CONFIG_KEY_TYPE` (BE sở hữu registry; FE không tự tạo key); type mới cần migration mở rộng `CK_site_configs_type`.

### 4.5 Error code

| Code | Tên | Khi nào |
|---|---|---|
| 1501 | `SITE_CONFIG_NOT_FOUND` | Xoá key chưa có dòng |
| 1502 | `SITE_CONFIG_KEY_INVALID` | Upsert với key ngoài registry |
| 1503 | `SITE_CONFIG_VALUE_INVALID` | Upsert key có validator (`SHIPPING_CONFIG`, `EXCHANGE_RATE`) với `value` sai cấu trúc; message liệt kê từng lỗi |

### 4.6 Phụ thuộc & cấu hình

`TypeOrmModule.forFeature([SiteConfig])`. Không có biến môi trường. `site-config.validators.ts` import hàm validate thuần từ `shipping/shipping-config.ts` và `currency/exchange-rate-config.ts` (không phụ thuộc module Nest); `ShippingModule` và `CurrencyModule` import `SiteConfigModule`.

### 4.7 Test

- `site-config.service.spec.ts` — `upsert` (lưu `SHIPPING_CONFIG` với type `SHIPPING` sau khi validate, lưu `EXCHANGE_RATE` với type `CURRENCY`, từ chối cấu hình ship/tỷ giá sai với 1503 và không lưu, cập nhật dòng có sẵn, key banner vẫn nhận JSON bất kỳ, key lạ → 1502) và `findValue`.

### 4.8 Lưu ý hiện trạng

- Admin `DELETE` với key ngoài registry cũng trả `SITE_CONFIG_NOT_FOUND` (không phân biệt với key hợp lệ nhưng chưa có dòng).
- Với key banner, BE chỉ kiểm tra `value` là JSON hợp lệ, không kiểm tra cấu trúc bên trong (ví dụ danh sách `{ image, title, href }`); chỉ `SHIPPING_CONFIG` và `EXCHANGE_RATE` được kiểm cấu trúc.
- Danh sách admin trả `{ data, total }`, không phân trang (số key cố định).
