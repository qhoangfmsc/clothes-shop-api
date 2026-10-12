# site-config (`src/modules/site-config`)

> Cập nhật lần cuối: 2026-10-12

## 1. Tổng quan

Module cấu hình nội dung trang theo `key` (hiện là các banner). Mỗi key gắn với đúng một `type`; `value` là chuỗi do FE/admin tự định hình (thường là `JSON.stringify` của một mảng), BE không diễn giải bên trong.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/site-config` |
| Route prefix | `/api/site-config` (public), `/api/admin/site-config` (admin) |
| Bảng DB | `site_configs` |
| Module phụ thuộc | không |
| Export | `SiteConfigService` |

## 2. Mục đích & nghiệp vụ phục vụ

Admin chỉnh nội dung hero/banner ở các vị trí cố định của trang (Shop, New In, Collections, menu điều hướng) mà không cần deploy; FE công khai đọc theo key để render.

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

`SiteConfigType` có hai giá trị: `BANNER`, `TEXT` (chưa có key nào dùng `TEXT`).

### 4.2 Dữ liệu

Bảng `site_configs` (entity `SiteConfig extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `key` | varchar(64) | UNIQUE (`UQ_site_configs_key`) |
| `type` | varchar(32) | `CK_site_configs_type` ∈ (`BANNER`, `TEXT`) |
| `value` | text | chuỗi JSON |
| `created_at`, `updated_at` | timestamptz | |

Migration `AddSiteConfig` seed 4 key trên với `value = '[]'`.

### 4.3 Validation (3 tầng)

- **DTO**: `key` thuộc enum `SiteConfigKey` (public); `value` là JSON hợp lệ và không rỗng (admin).
- **Service**: `key` ở route admin phải thuộc `SiteConfigKey` (path param là string tự do nên được kiểm tra thủ công); xoá yêu cầu config tồn tại.
- **DB**: UNIQUE `key`, CHECK `type`.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

- **Upsert**: key không thuộc registry → `SITE_CONFIG_KEY_INVALID`; `type` = `SITE_CONFIG_KEY_TYPE[key]`; tìm dòng theo key: có thì cập nhật `value` và `type`, chưa thì tạo mới. Cố ý không dùng `repo.upsert()` vì câu `INSERT … ON CONFLICT` thô bỏ qua hook `@BeforeInsert` nên id không được sinh.
- **Delete**: không tìm thấy → `SITE_CONFIG_NOT_FOUND`; xoá dòng thật (sau đó public trả `data: null` cho key đó).
- **Thêm key mới** nằm ở `SiteConfigKey` + `SITE_CONFIG_KEY_TYPE` (BE sở hữu registry; FE không tự tạo key).

### 4.5 Error code

| Code | Tên | Khi nào |
|---|---|---|
| 1501 | `SITE_CONFIG_NOT_FOUND` | Xoá key chưa có dòng |
| 1502 | `SITE_CONFIG_KEY_INVALID` | Upsert với key ngoài registry |

### 4.6 Phụ thuộc & cấu hình

`TypeOrmModule.forFeature([SiteConfig])`. Không có biến môi trường.

### 4.7 Test

Chưa có test.

### 4.8 Lưu ý hiện trạng

- Admin `DELETE` với key ngoài registry cũng trả `SITE_CONFIG_NOT_FOUND` (không phân biệt với key hợp lệ nhưng chưa có dòng).
- BE chỉ kiểm tra `value` là JSON hợp lệ, không kiểm tra cấu trúc bên trong (ví dụ danh sách `{ image, title, href }`).
- Danh sách admin trả `{ data, total }`, không phân trang (số key cố định).
