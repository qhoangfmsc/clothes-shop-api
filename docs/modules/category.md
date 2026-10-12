# category (`src/modules/category`)

> Cập nhật lần cuối: 2026-10-12

## 1. Tổng quan

Module danh mục: quản lý `Category` và các `SubCategory` con, có thứ hạng hiển thị duy nhất `priority`. Public đọc danh sách/chi tiết; admin tạo, sửa (kèm đồng bộ subcategory), xếp lại thứ tự và xoá.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/category` |
| Route prefix | `/api/categories` (public), `/api/admin/categories` (admin) |
| Bảng DB | `categories`, `subcategories` |
| Module phụ thuộc | không (module `product` phụ thuộc vào module này) |
| Export | `CategoryService` |

## 2. Mục đích & nghiệp vụ phục vụ

- Cấu trúc điều hướng/lọc của cửa hàng: danh mục cấp 1 (tops, skirts, bags, jewelry…) và subcategory cấp 2.
- `priority` quyết định thứ tự hiển thị (1 = cao nhất), do admin quản lý và luôn là dãy liên tục 1..N không trùng.
- `heroImage` là ảnh banner của category (hiển thị ở lưới danh mục phía FE).

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Public | `category.controller.ts` | `/api/categories` | `@Public()` | List có search/sort/phân trang hoặc tra 1 category theo `slug` |
| Admin | `admin-category.controller.ts` | `/api/admin/categories` | JWT + permission | List, tạo (kèm subcategory), reorder, sửa, xoá |

## 4. Chi tiết

### 4.1 API

| Method | Path | Truy cập | Mô tả |
|---|---|---|---|
| GET | `/api/categories` | Public | List, hoặc 1 category nếu có `slug` |
| GET | `/api/admin/categories` | `CATEGORY_VIEW` | Danh sách cho admin |
| POST | `/api/admin/categories` | `CATEGORY_CREATE` | Tạo category (kèm subcategories) |
| PATCH | `/api/admin/categories/reorder` | `CATEGORY_UPDATE` | Sắp xếp lại toàn bộ category |
| PATCH | `/api/admin/categories/:id` | `CATEGORY_UPDATE` | Cập nhật category / subcategories / priority |
| DELETE | `/api/admin/categories/:id` | `CATEGORY_DELETE` | Xoá category |

`reorder` được khai báo trước `:id` để không bị bắt làm id.

**GET `/api/categories`** — `PublicCategoryQueryDto` (extends `PaginationQueryDto`):

| Param | Ràng buộc |
|---|---|
| `slug` | string ≤ 255. Có `slug` → bỏ qua các param list, trả 1 category: `{ data: {...} }`; không thấy → `404 Category not found` |
| `search` | ≤ 255; `ILIKE` trên `title`, `slug`, `description` |
| `sort` | whitelist `priority`, `title`, `createdAt`; mặc định `priority` (ASC) |

Response list `paginated(...)`, mỗi phần tử:

```json
{ "id", "slug", "title", "description", "heroImage", "priority",
  "subcategories": [{ "id", "slug", "label", "description", "count" }] }
```

**GET `/api/admin/categories`** — `AdminCategoryQueryDto`: `search` (≤ 255; `ILIKE` trên `slug`, `title`, `description`), `sort` (whitelist `priority`, `title`, `createdAt`; mặc định `priority`). Response `paginated(...)` với entity `Category` (kèm `subcategories` do `eager: true`).

**POST `/api/admin/categories`** — `CreateCategoryDto`:

| Field | Bắt buộc | Ràng buộc |
|---|---|---|
| `slug` | ✔ | string, not empty, ≤ 255 |
| `title` | ✔ | string, not empty, ≤ 255 |
| `description` | | string |
| `heroImage` | | string ≤ 500 (nullable) |
| `subcategories` | | mảng `CreateSubCategoryDto`, validate lồng nhau |

`CreateSubCategoryDto`: `slug` (not empty, ≤ 255), `label` (not empty, ≤ 255), `description` (string, optional), `count` (int ≥ 0, optional, mặc định 0).

Response `{ data: Category }`. `priority` không nhận từ client khi tạo.

**PATCH `/api/admin/categories/:id`** — `UpdateCategoryDto`: `slug`, `title` (≤ 255), `description`, `heroImage` (≤ 500), `priority` (int ≥ 1), `subcategories` (mảng `CreateSubCategoryDto`); tất cả optional. Response `{ data: Category }`.

**PATCH `/api/admin/categories/reorder`** — `ReorderCategoriesDto`: `ids` (mảng string, 1–500 phần tử, mỗi phần tử not empty ≤ 255). Response `{ data: [{ id, priority }] }` với `priority` = vị trí 1..N.

**DELETE `/api/admin/categories/:id`** → `{ message: 'Category deleted successfully' }`.

### 4.2 Dữ liệu

Bảng `categories` (entity `Category extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `slug` | varchar(255) | UNIQUE |
| `title` | varchar(255) | |
| `description` | text | default `''` |
| `hero_image` | varchar(500) | nullable |
| `priority` | int | NOT NULL, không default; `UQ_categories_priority` UNIQUE **DEFERRABLE INITIALLY DEFERRED**; `CK_categories_priority` `priority >= 1` |
| `created_at`, `updated_at` | timestamptz | |

Bảng `subcategories` (entity `SubCategory extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 (đã chuyển từ serial bằng migration) |
| `slug` | varchar(255) | `UQ_subcategories_category_slug` UNIQUE `(category_id, slug)` |
| `label` | varchar(255) | |
| `description` | text | default `''` |
| `count` | int | default 0; `CK_subcategories_count` `count >= 0` |
| `category_id` | varchar(16) | FK → `categories(id)` ON DELETE CASCADE; index `IDX_subcategories_category_id` |
| `created_at`, `updated_at` | timestamptz | |

Quan hệ: `Category.subcategories` là `OneToMany` với `eager: true, cascade: true`. `products.category_id` và `products.subcategory_id` trỏ tới đây bằng ON DELETE RESTRICT.

### 4.3 Validation (3 tầng)

- **DTO**: như 4.1; `@ValidateNested({ each: true })` + `@Type(() => CreateSubCategoryDto)`; `priority >= 1`; `ids` giới hạn 1–500.
- **Service**:
  - `ensureSlugUnique` cho category.
  - `validateSubCategorySlugs`: slug subcategory không trùng nhau trong cùng payload.
  - Lỗi DB `23505` khi create/update → `CATEGORY_SUBSLUG_DUPLICATE`.
  - `priority` phải nằm trong `1..max`.
  - `reorder` phải gửi đủ mọi category đúng 1 lần.
  - Xoá subcategory còn sản phẩm tham chiếu, hoặc xoá category còn sản phẩm: bắt lỗi FK `23503`.
- **DB**: UNIQUE slug, UNIQUE DEFERRABLE priority, CHECK priority/count, UNIQUE `(category_id, slug)`, FK CASCADE từ subcategories, FK RESTRICT từ products.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

**Khoá `priority`**: mọi thao tác đổi thứ hạng (create/update có `priority`/delete/reorder) chạy trong transaction và lấy `pg_advisory_xact_lock(hashtext('categories_priority'))` để tuần tự hoá.

**Tạo**: slug duy nhất → kiểm tra slug subcategory → transaction: khoá → `priority = MAX(priority) + 1` (category mới luôn nằm cuối) → lưu category cùng subcategories (cascade).

**Sửa**:
1. Category phải tồn tại; nếu `slug` đổi thì kiểm tra duy nhất.
2. Trong transaction (khoá nếu có `priority`): nạp category; nếu có `subcategories` → `reconcileSubCategories`; nếu có `priority` → `moveToPriority`; gộp các field còn lại; lưu.
3. `reconcileSubCategories` đồng bộ theo `slug`: subcategory có slug khớp được cập nhật tại chỗ (giữ nguyên `id`; cập nhật `label`, `description`, `count`), slug mới thì tạo mới, slug không còn trong payload thì bị xoá. Xoá bị FK RESTRICT → `CATEGORY_SUBCATEGORY_HAS_PRODUCTS` (kèm danh sách slug).
4. `moveToPriority(target)`: yêu cầu `1 ≤ target ≤ max`, các category nằm giữa dịch 1 bậc (+1 khi đẩy lên, −1 khi đẩy xuống).

**Reorder**: `ids` không trùng → trong transaction (khoá) nạp mọi id → có id lạ → `CATEGORY_NOT_FOUND` (kèm danh sách) → số lượng khác tổng số category → `CATEGORY_REORDER_INCOMPLETE` → gán `priority = vị trí + 1` lần lượt (UNIQUE deferrable nên không vướng giữa chừng).

**Xoá**: transaction (khoá) → tìm category → xoá (subcategory xoá theo CASCADE) → các category có `priority` lớn hơn giảm 1 để không để trống số. FK RESTRICT từ products (lỗi `23503`) → `CATEGORY_HAS_PRODUCTS`.

**List công khai**: phân trang trên bảng `categories` thuần trước, sau đó nạp subcategories cho đúng tập id của trang (tránh join 1-nhiều làm sai `LIMIT/OFFSET` và `total`).

### 4.5 Error code

| Code | Tên | Khi nào |
|---|---|---|
| 1102 | `CATEGORY_SLUG_DUPLICATE` | Slug category đã tồn tại |
| 1103 | `CATEGORY_SUBSLUG_DUPLICATE` | Slug subcategory trùng trong payload hoặc vi phạm `UQ_subcategories_category_slug` (lỗi DB 23505) |
| 1104 | `CATEGORY_HAS_PRODUCTS` | Xoá category còn sản phẩm |
| 1105 | `CATEGORY_SUBCATEGORY_HAS_PRODUCTS` | Bỏ subcategory còn sản phẩm |
| 1106 | `CATEGORY_REORDER_DUPLICATE_ID` | `ids` có phần tử trùng |
| 1107 | `CATEGORY_REORDER_INCOMPLETE` | `ids` không đủ mọi category |
| 1108 | `CATEGORY_PRIORITY_OUT_OF_RANGE` | `priority` ngoài `1..max` |
| 1101 | `CATEGORY_NOT_FOUND` | Category không tồn tại (`findBySlug`, `update`, `delete` — HTTP 404) hoặc có id không tồn tại trong `reorder` (HTTP 400, kèm danh sách id) |

### 4.6 Phụ thuộc & cấu hình

- `TypeOrmModule.forFeature([Category, SubCategory])`.
- Dùng `pg_advisory_xact_lock` của PostgreSQL.
- Không có biến môi trường riêng.

### 4.7 Test

Chưa có spec riêng. `PublicCategoryQueryDto` và `AdminCategoryQueryDto` được `list-query.dto.spec.ts` kiểm tra tự động.

### 4.8 Lưu ý hiện trạng

- `subcategories.count` là giá trị admin nhập, không được tự tính từ số sản phẩm.
- Khi bắt lỗi `23505` ở create/update, mọi vi phạm UNIQUE đều được map sang `CATEGORY_SUBSLUG_DUPLICATE`.
- `CategoryService.findAll()` (trả `{ data, total }` không phân trang) còn trong service nhưng không có nơi nào gọi.
- `PublicCategoryQueryDto` có field `slug` nhưng controller đọc `slug` riêng bằng `@Query('slug')` để phân nhánh.
- Subcategory được trả kèm trong cả list public lẫn admin; subcategory không có endpoint riêng.
