# product (`src/modules/product`)

> Cập nhật lần cuối: 2026-10-12

## 1. Tổng quan

Module sản phẩm: API công khai để duyệt/tìm/xem chi tiết sản phẩm và API admin để tạo, sửa, xoá sản phẩm. Sản phẩm thuộc một category và một subcategory.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/product` |
| Route prefix | `/api/products` (public), `/api/admin/products` (admin) |
| Bảng DB | `products` |
| Module phụ thuộc | `category` (entity `Category`, `SubCategory`) |
| Export | `ProductService` |

## 2. Mục đích & nghiệp vụ phục vụ

- Khách: xem danh sách sản phẩm đang bán (lọc theo danh mục, badge, giá, size, màu; tìm kiếm; sắp xếp), gợi ý tìm kiếm (autocomplete), xem chi tiết kèm sản phẩm liên quan.
- Admin: quản lý catalog (tạo/sửa/xoá, bật/tắt `status`, gán badge, đặt giá gốc/giá bán).
- `badge` và `status` quyết định sản phẩm có hiển thị / có đặt hàng được hay không (xem 4.4).

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Public | `product.controller.ts` | `/api/products` | `@Public()` | List có filter/sort/phân trang, autocomplete, chi tiết + related |
| Admin | `admin-product.controller.ts` | `/api/admin/products` | JWT + permission | List (kể cả `disabled`), tạo, sửa, xoá |

## 4. Chi tiết

### 4.1 API

| Method | Path | Truy cập | Mô tả |
|---|---|---|---|
| GET | `/api/products` | Public | Danh sách sản phẩm `active` |
| GET | `/api/products/autocomplete?q=&limit=` | Public | Gợi ý sản phẩm (khớp chứa, tên bắt đầu bằng `q` lên trước) |
| GET | `/api/products/:id` | Public | Chi tiết theo id + 4 sản phẩm liên quan |
| GET | `/api/admin/products` | `PRODUCT_VIEW` | Danh sách cho admin |
| POST | `/api/admin/products` | `PRODUCT_CREATE` | Tạo sản phẩm |
| PATCH | `/api/admin/products/:id` | `PRODUCT_UPDATE` | Cập nhật sản phẩm |
| DELETE | `/api/admin/products/:id` | `PRODUCT_DELETE` | Xoá sản phẩm |

**GET `/api/products`** — `PublicProductQueryDto` (extends `PaginationQueryDto`):

| Param | Kiểu | Ràng buộc / hành vi |
|---|---|---|
| `search` | string | ≤ 255; `ILIKE %…%` trên `name`, `slug`, `description` |
| `category` | string | ≤ 255; lọc theo **slug** category |
| `subcategory` | string | ≤ 255; lọc theo **slug** subcategory |
| `badge` | string | `IsIn(PRODUCT_BADGES)` |
| `minPrice`, `maxPrice` | int | `≥ 0`; `price >= minPrice`, `price <= maxPrice` |
| `sizes` | string | ≤ 255; danh sách phẩy `S,M,L`; khớp nếu sản phẩm có ít nhất 1 size trong danh sách |
| `colors` | string | ≤ 255; danh sách phẩy tên màu `Red,Blue`; khớp theo `colors[].name` |
| `sort` | string | whitelist `price`, `name`, `createdAt` (+ `-field`); mặc định `-createdAt` |

Luôn chỉ lấy `status = 'active'`. Response `paginated(...)`, mỗi phần tử là entity `Product` kèm `category` và `subcategory`.

**GET `/api/products/autocomplete`** — `ProductAutocompleteQueryDto`: `q` (string, 2–255 ký tự, bắt buộc), `limit` (int, tuỳ chọn, mặc định 8, 1–10; vượt → 400). Khớp "chứa" `ILIKE '%q%'` trên `name` hoặc `slug` (ký tự `%`, `_`, `\` trong `q` được escape nên khớp theo nghĩa đen), chỉ `active`. Sắp xếp: tên bắt đầu bằng `q` lên trước, rồi `name` ASC. Response `{ data: [{ id, name, slug, price, image, badge }] }` (`price` là number, `image` là ảnh đầu tiên hoặc `null`, `badge` là `new`/`sale`/`bestseller`/`sold_out`/`limited`/`custom_order` hoặc `null`). `limit` nằm riêng trong DTO này (không kế thừa `PaginationQueryDto`), không phân trang; DTO nằm trong `NOT_LIST_DTO_FILES`.

**GET `/api/products/:id`** → `{ data: Product(+category, subcategory), related: Product[] }`. `related`: tối đa 4 sản phẩm `active` cùng category, khác chính nó, mới nhất trước. Không thấy → `404 Product not found`.

**GET `/api/admin/products`** — `AdminProductQueryDto`:

| Param | Ràng buộc |
|---|---|
| `search` | ≤ 255; `ILIKE` trên `name`, `slug`, `sku`, `description` |
| `status` | `IsIn(ACTIVE_STATUSES)` |
| `category` | slug category (≤ 255). Slug không tồn tại → trả list rỗng |
| `badge` | `IsIn(PRODUCT_BADGES)` |
| `sort` | whitelist `price`, `createdAt`, `name`; mặc định `-createdAt` |

Kèm `category`, `subcategory` trong mỗi phần tử.

**POST `/api/admin/products`** — `CreateProductDto`:

| Field | Bắt buộc | Ràng buộc |
|---|---|---|
| `slug` | ✔ | string, not empty, ≤ 255 |
| `sku` | | string, ≤ 255; bỏ trống thì tự sinh |
| `name` | ✔ | string, not empty, ≤ 255 |
| `price` | ✔ | number, `≥ 0.01` |
| `originalPrice` | | number, `≥ 0` |
| `images` | ✔ | mảng string, ≥ 1 phần tử |
| `categoryId` | ✔ | string, not empty (id nanoid16) |
| `subcategoryId` | ✔ | string, not empty (id nanoid16) |
| `badge` | | `IsIn(PRODUCT_BADGES)` hoặc `null` |
| `description` | ✔ | string, not empty |
| `material` | ✔ | string, not empty, ≤ 255 |
| `care` | ✔ | string, not empty, ≤ 500 |
| `sizes` | ✔ | mảng string, ≥ 1 phần tử |
| `colors` | ✔ | mảng `{ name, hex }` (cả hai string not empty), ≥ 1 phần tử |
| `tags` | ✔ | mảng string (có thể rỗng) |
| `status` | | `IsIn(ACTIVE_STATUSES)`, ≤ 20; mặc định DB `active` |

Response `{ data: Product }`.

**PATCH `/api/admin/products/:id`** — `UpdateProductDto`: mọi field của create đều optional, cùng ràng buộc (mảng `images`/`sizes`/`colors` nếu gửi thì ≥ 1 phần tử).

**DELETE `/api/admin/products/:id`** → `{ message: 'Product deleted successfully' }`. Không thấy → `404 Product not found`.

### 4.2 Dữ liệu

Bảng `products` (entity `Product extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `slug` | varchar(255) | UNIQUE (`UQ_products_slug`) |
| `sku` | varchar(255) | UNIQUE (`UQ_products_sku`) |
| `name` | varchar(255) | |
| `price` | decimal(10,2) | `CK_products_price_positive`: `price > 0` |
| `original_price` | decimal(10,2) | nullable; `CK_products_original_price`: NULL hoặc `>= price` |
| `images` | jsonb | default `[]`; `CK_products_images_not_empty` |
| `category_id` | varchar(16) | NOT NULL; FK `FK_products_category` → `categories(id)` ON DELETE RESTRICT; index `IDX_products_category_id` |
| `subcategory_id` | varchar(16) | NOT NULL; FK `FK_products_subcategory` → `subcategories(id)` ON DELETE RESTRICT; index `IDX_products_subcategory_id` |
| `badge` | varchar(50) | nullable; index `IDX_products_badge`; `CK_products_badge` NULL hoặc ∈ (`new`,`sale`,`bestseller`,`sold_out`,`limited`,`custom_order`) |
| `status` | varchar(20) | default `active`; `CK_products_status` ∈ (`active`,`disabled`); index `IDX_products_status` |
| `description` | text | |
| `material` | varchar(255) | |
| `care` | varchar(500) | |
| `sizes` | jsonb | default `[]`; `CK_products_sizes_not_empty` |
| `colors` | jsonb | default `[]` (`[{name, hex}]`); `CK_products_colors_not_empty` |
| `tags` | jsonb | default `[]` |
| `created_at`, `updated_at` | timestamptz | |

Tham chiếu tới `products`: `reviews`, `wishlists`, `cart_items`, `collection_products` (ON DELETE CASCADE) và `order_items.product_id` (ON DELETE SET NULL).

### 4.3 Validation (3 tầng)

- **DTO**: như bảng ở 4.1 (`@IsNotEmpty`, `@MaxLength`, `@Min`, `@ArrayMinSize(1)`, `@IsIn(PRODUCT_BADGES | ACTIVE_STATUSES)`, `@ValidateNested` + `@Type` cho `colors`).
- **Service**:
  - `ensureSlugUnique`, `ensureSkuUnique` (private).
  - `originalPrice >= price` (create và update, tính trên giá trị cuối cùng).
  - `categoryId`, `subcategoryId` phải tồn tại.
  - Subcategory phải thuộc category (`validateSubcategoryBelongsToCategory`).
- **DB**: UNIQUE `slug`/`sku`, CHECK giá/status/badge/mảng không rỗng, FK RESTRICT cho category/subcategory (xem 4.2).

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

**Tạo**: kiểm tra slug duy nhất → (nếu có `sku`) sku duy nhất → `originalPrice >= price` → tìm category rồi subcategory → subcategory thuộc category → `sku` = `dto.sku` hoặc `{category.slug}-{subcategory.slug}-{slug}` → lưu.

**Sửa**: tải sản phẩm kèm category/subcategory → kiểm tra slug/sku duy nhất chỉ khi giá trị đổi → đổi category/subcategory nếu có `categoryId`/`subcategoryId` → xác nhận subcategory thuộc category → kiểm tra giá trên giá trị cuối → gộp các field còn lại → nếu payload có `categoryId`, `subcategoryId` hoặc `slug` thì `sku` = `dto.sku` hoặc tự sinh lại theo công thức trên → lưu.

**Xoá**: xoá bản ghi; các bảng con xử lý theo FK ở 4.2 (không có chặn nghiệp vụ).

**Ý nghĩa của `badge` với luồng mua hàng**: `sold_out` và `custom_order` thuộc `NON_ORDERABLE_BADGES` — module [cart](cart.md) từ chối thêm vào giỏ và module [order](order.md) từ chối checkout. `limited` không bị chặn.

**List công khai**: dùng QueryBuilder join `category` (`cat`) và `subcategory` (`sub`); filter size/màu dùng `EXISTS` trên `jsonb_array_elements(_text)`; sort bằng `parseSort(sort, '-createdAt')` rồi `orderBy('p.<field>')`.

**List admin**: dùng `findAndCount` với `where` dạng mảng OR cho search (mỗi nhánh kèm filter status/badge/category).

### 4.5 Error code

| Code | Tên | Khi nào |
|---|---|---|
| 1002 | `PRODUCT_SLUG_DUPLICATE` | Slug đã tồn tại |
| 1003 | `PRODUCT_SKU_DUPLICATE` | SKU đã tồn tại |
| 1004 | `PRODUCT_CATEGORY_NOT_FOUND` | Không thấy category hoặc subcategory |
| 1005 | `PRODUCT_SUBCATEGORY_MISMATCH` | Subcategory không thuộc category |
| 1009 | `PRODUCT_INVALID_PRICE` | `originalPrice < price` |
| 1001 | `PRODUCT_NOT_FOUND` | Sản phẩm không tồn tại (chi tiết, sửa, xoá) — HTTP 404. Cũng được dùng ở [cart](cart.md) và [wishlist](wishlist.md) khi `productId` không tồn tại |

Sizes/colors/images rỗng không có error code riêng: bị chặn ở DTO (`ArrayMinSize(1)`) và CHECK DB.

### 4.6 Phụ thuộc & cấu hình

- `TypeOrmModule.forFeature([Product, Category, SubCategory])`.
- Không có biến môi trường riêng.
- `ProductService` được export nhưng chưa module nào inject.

### 4.7 Test

Chưa có spec riêng cho service. `PublicProductQueryDto` và `AdminProductQueryDto` được `list-query.dto.spec.ts` kiểm tra tự động; `ProductAutocompleteQueryDto` nằm trong danh sách DTO không phải list.

### 4.8 Lưu ý hiện trạng

- `GET /api/products/:id` không lọc theo `status`: sản phẩm `disabled` vẫn xem được chi tiết theo id; `related` thì chỉ gồm `active`.
- `ProductService.findAll(...)` (đánh dấu `@deprecated`) vẫn còn trong service nhưng không có controller hay module nào gọi.
- Khi sửa `slug`/`categoryId`/`subcategoryId` mà không gửi `sku`, `sku` được sinh lại theo công thức mặc định, kể cả khi sản phẩm đang dùng `sku` tuỳ chỉnh.
- Xoá sản phẩm không có `try/catch` riêng vì mọi FK trỏ tới `products` đều là `CASCADE` hoặc `SET NULL` (`order_items` giữ lại snapshot tên/giá/ảnh).
- Giá trị `size`/`color` ở giỏ hàng không được đối chiếu với `sizes`/`colors` của sản phẩm (xem [cart](cart.md)).
