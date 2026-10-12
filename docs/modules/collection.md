# collection (`src/modules/collection`)

> Cập nhật lần cuối: 2026-10-12

## 1. Tổng quan

Module bộ sưu tập: nhóm các sản phẩm theo chủ đề/mùa (ví dụ "Summer Reverie"). Public đọc danh sách hoặc 1 bộ sưu tập theo slug; admin tạo, sửa, xoá và gán danh sách sản phẩm.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/collection` |
| Route prefix | `/api/collections` (public), `/api/admin/collections` (admin) |
| Bảng DB | `collections`, `collection_products` (bảng nối) |
| Module phụ thuộc | `product` (entity `Product`) |
| Export | `CollectionService` |

## 2. Mục đích & nghiệp vụ phục vụ

- Trang bộ sưu tập của cửa hàng: ảnh, tiêu đề, mô tả, mùa (`season`) và các sản phẩm thuộc bộ sưu tập.
- Admin quản lý nội dung bộ sưu tập và chọn sản phẩm cho từng bộ sưu tập.

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Public | `collection.controller.ts` | `/api/collections` | `@Public()` | List có search/sort/phân trang hoặc 1 bộ sưu tập theo `slug` |
| Admin | `admin-collection.controller.ts` | `/api/admin/collections` | JWT + permission | List, tạo, sửa, xoá |

## 4. Chi tiết

### 4.1 API

| Method | Path | Truy cập | Mô tả |
|---|---|---|---|
| GET | `/api/collections` | Public | List, hoặc 1 bộ sưu tập nếu có `slug` |
| GET | `/api/admin/collections` | `COLLECTION_VIEW` | Danh sách cho admin |
| POST | `/api/admin/collections` | `COLLECTION_CREATE` | Tạo bộ sưu tập |
| PATCH | `/api/admin/collections/:id` | `COLLECTION_UPDATE` | Cập nhật |
| DELETE | `/api/admin/collections/:id` | `COLLECTION_DELETE` | Xoá |

**GET `/api/collections`** — `PublicCollectionQueryDto` (extends `PaginationQueryDto`):

| Param | Ràng buộc |
|---|---|
| `slug` | string ≤ 255. Có `slug` → bỏ qua param list, trả `{ data: Collection(+products, products.category, products.subcategory), products }`; không thấy → `404 Collection not found` |
| `search` | ≤ 255; `ILIKE` trên `name`, `slug` |
| `sort` | whitelist `name`, `createdAt`; mặc định `-createdAt` |

Response list `paginated(...)`: mỗi phần tử là entity `Collection` kèm mảng `products` (không kèm category/subcategory của sản phẩm).

**GET `/api/admin/collections`** — `AdminCollectionQueryDto`: `search` (≤ 255; `ILIKE` trên `slug`, `name`), `season` (string ≤ 100, lọc bằng so sánh bằng), `sort` (whitelist `name`, `createdAt`; mặc định `-createdAt`). Phần tử kèm `products`.

**POST `/api/admin/collections`** — `CreateCollectionDto`:

| Field | Bắt buộc | Ràng buộc |
|---|---|---|
| `slug` | ✔ | string, not empty, ≤ 255 |
| `name` | ✔ | string, not empty, ≤ 255 |
| `subtitle` | | string ≤ 500 |
| `description` | | string |
| `image` | ✔ | string, not empty, ≤ 500 |
| `productIds` | | mảng string not empty, tối đa 100 phần tử |
| `season` | | string ≤ 100 |

**PATCH `/api/admin/collections/:id`** — `UpdateCollectionDto`: các field trên đều optional. `productIds` gửi lên sẽ **thay thế toàn bộ** danh sách sản phẩm; không gửi thì giữ nguyên.

Response create/update: `{ data: Collection }`. Delete: `{ message: 'Collection deleted successfully' }`.

### 4.2 Dữ liệu

Bảng `collections` (entity `Collection extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `slug` | varchar(255) | UNIQUE |
| `name` | varchar(255) | |
| `subtitle` | varchar(500) | default `''` |
| `description` | text | default `''` |
| `image` | varchar(500) | NOT NULL |
| `season` | varchar(100) | default `''` |
| `created_at`, `updated_at` | timestamptz | |

Bảng nối `collection_products` (`@ManyToMany` + `@JoinTable`): `collection_id` (FK `FK_cp_collection` → `collections(id)` ON DELETE CASCADE), `product_id` (FK `FK_cp_product` → `products(id)` ON DELETE CASCADE), index `IDX_cp_product_id`. Bảng không có cột thứ tự.

### 4.3 Validation (3 tầng)

- **DTO**: như 4.1 (`@MaxLength`, `@ArrayMaxSize(100)`, `@IsNotEmpty({ each: true })`).
- **Service**: `ensureSlugUnique` (create; update chỉ khi slug đổi); `resolveProducts` kiểm tra mọi `productIds` tồn tại.
- **DB**: UNIQUE `slug`; FK CASCADE hai phía của bảng nối.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

- **Tạo**: slug duy nhất → (nếu có `productIds`) `resolveProducts` → lưu collection cùng quan hệ `products`.
- **Sửa**: nạp collection kèm `products` → slug đổi thì kiểm tra duy nhất → có `productIds` thì thay toàn bộ `products` bằng kết quả `resolveProducts` → gộp field còn lại → lưu.
- **Xoá**: xoá collection; các dòng trong `collection_products` bị xoá theo CASCADE; sản phẩm không bị ảnh hưởng.
- **List công khai**: phân trang trên bảng `collections` thuần trước rồi nạp `products` cho đúng tập id của trang (tránh join nhiều-nhiều làm sai `LIMIT/OFFSET` và `total`).
- `resolveProducts`: nếu số sản phẩm tìm được khác số `productIds` → `COLLECTION_PRODUCT_NOT_FOUND` kèm danh sách id thiếu.

### 4.5 Error code

| Code | Tên | Khi nào |
|---|---|---|
| 1202 | `COLLECTION_SLUG_DUPLICATE` | Slug đã tồn tại |
| 1203 | `COLLECTION_PRODUCT_NOT_FOUND` | Có `productIds` không tồn tại |
| 1201 | `COLLECTION_NOT_FOUND` | Bộ sưu tập không tồn tại (`findBySlug`, `update`, `delete`) — HTTP 404 |

### 4.6 Phụ thuộc & cấu hình

- `TypeOrmModule.forFeature([Collection, Product])`.
- Không có biến môi trường riêng.

### 4.7 Test

Chưa có spec riêng. `PublicCollectionQueryDto` và `AdminCollectionQueryDto` được `list-query.dto.spec.ts` kiểm tra tự động.

### 4.8 Lưu ý hiện trạng

- Public chi tiết (`?slug=`) và public list trả mọi sản phẩm của bộ sưu tập, không lọc theo `status` của sản phẩm.
- `resolveProducts` giữ thứ tự theo `productIds` ở bộ nhớ khi trả về, nhưng bảng nối không lưu thứ tự nên thứ tự đọc lại từ DB không được đảm bảo.
- `productIds` có phần tử trùng làm số sản phẩm tìm được nhỏ hơn số id gửi lên, nên bị trả `COLLECTION_PRODUCT_NOT_FOUND` với danh sách id thiếu rỗng.
- Public không có filter `season` (chỉ admin có).
- `CollectionService.findAll()` còn trong service nhưng không có nơi nào gọi.
