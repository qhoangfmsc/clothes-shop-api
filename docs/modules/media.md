# media (`src/modules/media`)

> Cập nhật lần cuối: 2026-10-14

## 1. Tổng quan

Module quản lý ảnh. File nằm trên Supabase Storage (qua REST API của Storage), bảng `media_files` lưu metadata để list/tìm kiếm/sắp xếp/phân trang bằng SQL. Hai nguồn ảnh dùng chung bucket: thư viện do admin upload (`purpose = LIBRARY`) và ảnh khách đính vào đánh giá (`purpose = REVIEW`, upload qua module [review](review.md)).

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/media` |
| Route prefix | `/api/admin/media` |
| Bảng DB | `media_files` |
| Dịch vụ ngoài | Supabase Storage (`{SUPABASE_URL}/storage/v1`) |
| Module phụ thuộc | `ConfigModule` (global) |
| Export | `MediaService` (module [review](review.md) dùng `upload` với `REVIEW` và `resolveReviewImageUrls`) |

## 2. Mục đích & nghiệp vụ phục vụ

Admin tải ảnh lên (ảnh sản phẩm, banner, hero…), xem thư viện ảnh và lấy URL công khai để dán vào các nội dung khác. Khách tải ảnh đính vào đánh giá của mình qua `POST /api/reviews/images` ([review](review.md)); các ảnh này không hiện ở thư viện admin. Các module khác (product, collection, category, site-config) lưu ảnh dưới dạng chuỗi URL; không có khoá ngoại tới `media_files`.

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

**GET list** — `MediaQueryDto` (extends `PaginationQueryDto`): `search` (≤ 255; `ILIKE` trên `name`), `sort` (whitelist `createdAt`, `name`, `size`; mặc định `-createdAt`). Chỉ liệt kê file `purpose = LIBRARY`. Response `paginated(...)`, mỗi phần tử `MediaFileDto`:

```json
{ "id", "name", "mimeType", "sizeOriginal", "createdAt", "url" }
```

`id` là id của dòng `media_files` (dùng để xoá); `sizeOriginal` là số byte; `createdAt` ISO 8601; `url` là URL công khai trên Supabase.

**POST** — `multipart/form-data`, field `file` (đúng 1 file, tối đa 10 MB theo `FileInterceptor`). Response `{ data: MediaFileDto }`.

**DELETE `:fileId`** → `{ ok: true }`. Chỉ xoá được file `LIBRARY`; id của ảnh `REVIEW` → `404 MEDIA_FILE_NOT_FOUND`.

### 4.2 Dữ liệu

Bảng `media_files` (entity `MediaFile extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `name` | varchar(255) | tên hiển thị (tên file gốc) |
| `storage_key` | varchar(255) | UNIQUE (`UQ_media_files_storage_key`); object key trong bucket |
| `mime_type` | varchar(100) | `CK_media_files_mime_type` ∈ (`image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`) |
| `size` | integer | bytes; `CK_media_files_size >= 0` |
| `purpose` | varchar(10) | NOT NULL, default `LIBRARY`; `CK_media_files_purpose` ∈ (`LIBRARY`, `REVIEW`); index `IDX_media_files_purpose` |
| `uploaded_by` | varchar(16) | nullable; FK `FK_media_files_uploaded_by` → `users(id)` ON DELETE SET NULL; chỉ ghi cho ảnh `REVIEW` (người upload), ảnh thư viện để NULL; index `IDX_media_files_uploaded_by_purpose_created` (`uploaded_by`, `purpose`, `created_at`) |
| `created_at`, `updated_at` | timestamptz | index `IDX_media_files_created_at` (`created_at DESC`) |

Hằng số (`media.constant.ts`): `MEDIA_MAX_FILE_SIZE = 10 MB`, `MEDIA_ALLOWED_MIME_TYPES` (5 loại ảnh trên), `MEDIA_KEY_PREFIX_LENGTH = 12`, `MEDIA_PURPOSES` (`LIBRARY`, `REVIEW`), `REVIEW_IMAGE_MAX_FILE_SIZE = 5 MB`, `REVIEW_UPLOAD_LIMIT_PER_DAY = 30`.

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
6. Lưu dòng `media_files` (`name` = tên gốc đã bỏ path/ký tự điều khiển, tối đa 255; `purpose`/`uploaded_by` theo tham số `owner`, mặc định `LIBRARY`/NULL). Nếu ghi DB lỗi → xoá object vừa upload trên storage (không để object mồ côi) rồi ném lại lỗi.

**Upload ảnh đánh giá (`upload(file, { purpose: 'REVIEW', uploadedBy })`)**: cùng các bước trên, thêm một bước giữa 3 và 4: đếm ảnh `REVIEW` của `uploadedBy` có `created_at` trong 24 giờ gần nhất; đạt `REVIEW_UPLOAD_LIMIT_PER_DAY` → `MEDIA_UPLOAD_LIMIT_REACHED` (429) và không gửi gì lên storage.

**Xác nhận ảnh đánh giá (`resolveReviewImageUrls(userId, urls)`)**: mọi URL phải bắt đầu bằng URL công khai của bucket hiện tại (đúng `SUPABASE_URL` + bucket), storage key giải mã được, và có dòng `media_files` với `purpose = REVIEW` và `uploaded_by = userId`. Đạt → trả URL dựng lại từ storage key theo đúng thứ tự (danh sách rỗng → `[]` không truy vấn); sai bất kỳ URL nào → `null`. Cần `SUPABASE_URL` + bucket (như `findAll`).

**Xoá**: tìm dòng theo `fileId` và `purpose = LIBRARY` (không có → `MEDIA_FILE_NOT_FOUND`, HTTP 404) → xoá object trên storage trước → xoá dòng DB sau. Lỗi storage thì dòng DB còn nguyên để retry.

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
| 1607 | `MEDIA_UPLOAD_LIMIT_REACHED` | 429 | User đã upload đủ `REVIEW_UPLOAD_LIMIT_PER_DAY` ảnh đánh giá trong 24 giờ |

### 4.6 Phụ thuộc & cấu hình

- Biến môi trường: `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET` (list và dựng URL); thêm `SUPABASE_SERVICE_ROLE_KEY` cho ping/upload/delete.
- `TypeOrmModule.forFeature([MediaFile])`, `ConfigService`, `fetch` (Node), `multer` qua `FileInterceptor` của `@nestjs/platform-express`.

### 4.7 Test

`media.service.spec.ts` — thư viện admin chỉ liệt kê `LIBRARY`; upload ghi `purpose`/`uploadedBy` (admin: `LIBRARY`/NULL, khách: `REVIEW`/user), giới hạn 30 ảnh/24 giờ (429, không gửi lên storage), chỉ xoá được `LIBRARY`, `resolveReviewImageUrls` (URL chuẩn hoá theo thứ tự, từ chối URL ngoài bucket/hỏng/không phải ảnh của user, danh sách rỗng không truy vấn). `MediaService.findAll`: dựng URL công khai khi chỉ có `SUPABASE_URL` + bucket (không cần service key); thiếu URL/bucket thì luôn trả 503 `errorCode 1601`, dù có hay không có dòng nào. `MediaQueryDto` được `list-query.dto.spec.ts` kiểm tra tự động.

### 4.8 Lưu ý hiện trạng

- Upload chỉ nhận 1 file mỗi request và chỉ nhận ảnh; chưa có sửa/đổi tên file.
- Admin upload hiện không ghi `uploaded_by` (NULL). File ảnh `REVIEW` không dùng nữa (bị bỏ khỏi đánh giá hoặc chưa từng gắn) vẫn còn trên storage và trong `media_files`; không có job dọn dẹp, và không xoá được qua API admin.
- File lớn hơn giới hạn `FileInterceptor` (10 MB thư viện, 5 MB ảnh đánh giá) bị chặn trước service với `413 File too large` thô (không có `errorCode`).
- Xoá file không kiểm tra file có đang được tham chiếu bởi URL ở product/collection/category/site-config hay không.
- Tên file ASCII hoá cho storage key, còn `name` hiển thị giữ tên gốc (Unicode).
