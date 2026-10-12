# media (`src/modules/media`)

> Cập nhật lần cuối: 2026-10-12

## 1. Tổng quan

Module quản lý ảnh do admin upload. File nằm trên Supabase Storage (qua REST API của Storage), bảng `media_files` lưu metadata để list/tìm kiếm/sắp xếp/phân trang bằng SQL.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/media` |
| Route prefix | `/api/admin/media` |
| Bảng DB | `media_files` |
| Dịch vụ ngoài | Supabase Storage (`{SUPABASE_URL}/storage/v1`) |
| Module phụ thuộc | `ConfigModule` (global) |
| Export | `MediaService` |

## 2. Mục đích & nghiệp vụ phục vụ

Admin tải ảnh lên (ảnh sản phẩm, banner, hero…), xem thư viện ảnh và lấy URL công khai để dán vào các nội dung khác. Các module khác (product, collection, category, site-config) lưu ảnh dưới dạng chuỗi URL; không có khoá ngoại tới `media_files`.

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Admin media | `admin-media.controller.ts` | `/api/admin/media` | JWT + permission | Ping storage, list, upload 1 ảnh, xoá |

## 4. Chi tiết

### 4.1 API

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/admin/media/ping` | `MEDIA_VIEW` | Kiểm tra kết nối Supabase Storage và bucket |
| GET | `/api/admin/media` | `MEDIA_VIEW` | Danh sách file (phân trang) |
| POST | `/api/admin/media` | `MEDIA_UPLOAD` | Upload 1 ảnh (multipart, field `file`) |
| DELETE | `/api/admin/media/:fileId` | `MEDIA_DELETE` | Xoá 1 file |

**GET `/ping`** → `{ ok: true, bucket, public }` (`public` = bucket có public hay không). Bucket không tồn tại (Supabase trả 404/400) → `MEDIA_NOT_CONFIGURED`.

**GET list** — `MediaQueryDto` (extends `PaginationQueryDto`): `search` (≤ 255; `ILIKE` trên `name`), `sort` (whitelist `createdAt`, `name`, `size`; mặc định `-createdAt`). Response `paginated(...)`, mỗi phần tử `MediaFileDto`:

```json
{ "id", "name", "mimeType", "sizeOriginal", "createdAt", "url" }
```

`id` là id của dòng `media_files` (dùng để xoá); `sizeOriginal` là số byte; `createdAt` ISO 8601; `url` là URL công khai trên Supabase.

**POST** — `multipart/form-data`, field `file` (đúng 1 file, tối đa 10 MB theo `FileInterceptor`). Response `{ data: MediaFileDto }`.

**DELETE `:fileId`** → `{ ok: true }`.

### 4.2 Dữ liệu

Bảng `media_files` (entity `MediaFile extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `name` | varchar(255) | tên hiển thị (tên file gốc) |
| `storage_key` | varchar(255) | UNIQUE (`UQ_media_files_storage_key`); object key trong bucket |
| `mime_type` | varchar(100) | `CK_media_files_mime_type` ∈ (`image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`) |
| `size` | integer | bytes; `CK_media_files_size >= 0` |
| `created_at`, `updated_at` | timestamptz | index `IDX_media_files_created_at` (`created_at DESC`) |

Hằng số (`media.constant.ts`): `MEDIA_MAX_FILE_SIZE = 10 MB`, `MEDIA_ALLOWED_MIME_TYPES` (5 loại ảnh trên), `MEDIA_KEY_PREFIX_LENGTH = 12`.

### 4.3 Validation (3 tầng)

- **DTO / Controller**: query list theo `MediaQueryDto`; upload giới hạn `fileSize` 10 MB và `files: 1`; field phải tên `file`.
- **Service**: có file và buffer không rỗng; loại file xác định bằng magic bytes (không tin `mimetype` client); cấu hình storage đầy đủ; file cần xoá phải tồn tại.
- **DB**: UNIQUE `storage_key`, CHECK `mime_type`, CHECK `size >= 0`.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

**Upload**:
1. `getConfig()` (đọc env mỗi lần gọi) — thiếu biến → `MEDIA_NOT_CONFIGURED` (503) kèm tên biến thiếu.
2. Không có file/buffer rỗng → `MEDIA_FILE_REQUIRED`.
3. Xác định mime theo magic bytes: JPEG (`FF D8 FF`), PNG (8 byte signature), GIF (`GIF87a`/`GIF89a`), WebP (`RIFF....WEBP`), AVIF (`ftyp` + `avif`/`avis`); không khớp → `MEDIA_INVALID_TYPE`.
4. Tạo storage key: `{12 ký tự hex ngẫu nhiên}-{tên đã làm sạch}.{đuôi theo mime}`. Tên làm sạch: bỏ đuôi cũ, bỏ dấu (NFD), `đ` → `d`, chữ thường, ký tự ngoài `[a-z0-9]` → `-`, cắt tối đa 80 ký tự, rỗng thì dùng `image`.
5. `POST {baseUrl}/storage/v1/object/{bucket}/{key}` với header `Content-Type`, `Cache-Control: max-age=31536000`, `x-upsert: false`, kèm `Authorization: Bearer` + `apikey` bằng service role key; timeout 15 s.
6. Lưu dòng `media_files` (`name` = tên gốc đã bỏ path/ký tự điều khiển, tối đa 255). Nếu ghi DB lỗi → xoá object vừa upload trên storage (không để object mồ côi) rồi ném lại lỗi.

**Xoá**: tìm dòng theo `fileId` (không có → `MEDIA_FILE_NOT_FOUND`, HTTP 404) → xoá object trên storage trước → xoá dòng DB sau. Lỗi storage thì dòng DB còn nguyên để retry.

**Map lỗi từ Supabase (`assertOk`)**: 401/403 → `MEDIA_NOT_CONFIGURED` (503, "check SUPABASE_SERVICE_ROLE_KEY"); 413 hoặc body `EntityTooLarge` → `MEDIA_FILE_TOO_LARGE` (413); còn lại → `MEDIA_STORAGE_ERROR` (502). Không kết nối được/timeout → `MEDIA_STORAGE_ERROR` (502, "Cannot reach media storage"). Chỉ log phần đầu body lỗi, không log header/key.

**URL công khai**: `{baseUrl}/storage/v1/object/public/{bucket}/{key}` (đã `encodeURIComponent` bucket và key).

**List**: kiểm tra cấu hình URL công khai một lần ở đầu (`getPublicConfig()`, chỉ cần `SUPABASE_URL` + `SUPABASE_STORAGE_BUCKET`, không cần service key; thiếu → `MEDIA_NOT_CONFIGURED` 503 kèm tên biến thiếu, kể cả khi chưa có file nào), dùng `typeormListQuery` (sort + search + phân trang), rồi map `items` sang `MediaFileDto` và trả bằng `paginated()`.

**Cấu hình**: `getPublicConfig()` (URL + bucket) dùng cho dựng URL ở list; `getConfig()` (thêm `SUPABASE_SERVICE_ROLE_KEY`) dùng cho mọi lời gọi Storage API (ping, upload, delete).

### 4.5 Error code

| Code | Tên | HTTP | Khi nào |
|---|---|---|---|
| 1601 | `MEDIA_NOT_CONFIGURED` | 503 | Thiếu env (list: thiếu `SUPABASE_URL`/bucket; ping/upload/delete: thiếu cả service key), bucket không tồn tại, hoặc Supabase từ chối credential |
| 1602 | `MEDIA_FILE_REQUIRED` | 400 | Không có field `file` hoặc file rỗng |
| 1603 | `MEDIA_INVALID_TYPE` | 400 | Không phải ảnh JPEG/PNG/WebP/GIF/AVIF |
| 1604 | `MEDIA_FILE_NOT_FOUND` | 404 | Xoá file không tồn tại |
| 1605 | `MEDIA_STORAGE_ERROR` | 502 | Storage lỗi hoặc không kết nối được |
| 1606 | `MEDIA_FILE_TOO_LARGE` | 413 | Storage từ chối vì file quá lớn |

### 4.6 Phụ thuộc & cấu hình

- Biến môi trường: `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET` (list và dựng URL); thêm `SUPABASE_SERVICE_ROLE_KEY` cho ping/upload/delete.
- `TypeOrmModule.forFeature([MediaFile])`, `ConfigService`, `fetch` (Node), `multer` qua `FileInterceptor` của `@nestjs/platform-express`.

### 4.7 Test

`media.service.spec.ts` — `MediaService.findAll`: dựng URL công khai khi chỉ có `SUPABASE_URL` + bucket (không cần service key); thiếu URL/bucket thì luôn trả 503 `errorCode 1601`, dù có hay không có dòng nào. `MediaQueryDto` được `list-query.dto.spec.ts` kiểm tra tự động.

### 4.8 Lưu ý hiện trạng

- Upload chỉ nhận 1 file mỗi request và chỉ nhận ảnh; chưa có sửa/đổi tên file.
- Xoá file không kiểm tra file có đang được tham chiếu bởi URL ở product/collection/category/site-config hay không.
- Tên file ASCII hoá cho storage key, còn `name` hiển thị giữ tên gốc (Unicode).
