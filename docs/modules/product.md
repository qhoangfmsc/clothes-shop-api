# product (`src/modules/product`)

> Cập nhật lần cuối: 2026-10-18

## 1. Tổng quan

Module sản phẩm: API công khai để duyệt/tìm/xem chi tiết sản phẩm và API admin để tạo, sửa, xoá sản phẩm. Sản phẩm thuộc một category và một subcategory.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/product` |
| Route prefix | `/api/products` (public), `/api/admin/products` (admin) |
| Bảng DB | `products` |
| Module phụ thuộc | `category` (entity `Category`, `SubCategory`); `currency` (`CurrencyService.getVndPerUsd` — USD của giá, xem [currency](currency.md)) |
| Export | `ProductService` |

## 2. Mục đích & nghiệp vụ phục vụ

- Khách: xem danh sách sản phẩm đang bán (lọc theo danh mục, badge, giá, size, màu; tìm kiếm; sắp xếp), gợi ý tìm kiếm (autocomplete), xem chi tiết kèm sản phẩm liên quan.
- Admin: quản lý catalog (tạo/sửa/xoá, bật/tắt `status`, gán badge, đặt giá gốc/giá bán bằng VND).
- Giá lưu bằng VND nguyên; mọi response trả cả `priceVnd`/`priceUsd` (USD suy ra theo tỷ giá hiện tại).
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
| GET | `/api/products/:id?relatedLimit=` | Public | Chi tiết theo id + sản phẩm liên quan (số lượng do client chọn, mặc định 4) |
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
| `minPrice`, `maxPrice` | int | `≥ 0`, đơn vị VND; `price >= minPrice`, `price <= maxPrice` |
| `sizes` | string | ≤ 255; danh sách phẩy `S,M,L`; khớp nếu sản phẩm có ít nhất 1 size trong danh sách |
| `colors` | string | ≤ 255; danh sách phẩy tên màu `Red,Blue`; khớp theo `colors[].name` |
| `minRating` | int | 1–5 (`@Type(() => Number)`, `IsInt`, `Min(1)`, `Max(5)`); chỉ lấy sản phẩm có `ratingAverage >= minRating` (sản phẩm chưa có đánh giá bị loại) |
| `sort` | string | whitelist `price`, `name`, `createdAt`, `ratingAverage`, `ratingCount` (+ `-field`); mặc định `-createdAt`. Sản phẩm chưa có đánh giá (`ratingAverage` NULL) luôn xếp cuối, cả khi tăng dần; thứ tự phụ `id` ASC |

Luôn chỉ lấy `status = 'active'`. Response `paginated(...)`, mỗi phần tử là sản phẩm kèm `category`, `subcategory`, `ratingAverage` (number 1.0–5.0 hoặc `null`) và `ratingCount` (xem 4.2). Giá trả ra dạng `priceVnd`, `priceUsd`, `originalPriceVnd`, `originalPriceUsd` (cả hai `originalPrice…` là `null` khi không có giá gốc); không còn field `price`/`originalPrice`. Quy ước này áp dụng cho mọi nơi trả sản phẩm (chi tiết, `related`, admin, create/update, giỏ, wishlist, collection).

**GET `/api/products/autocomplete`** — `ProductAutocompleteQueryDto`: `q` (string, 2–255 ký tự, bắt buộc), `limit` (int, tuỳ chọn, mặc định 8, 1–10; vượt → 400). Khớp "chứa" `ILIKE '%q%'` trên `name` hoặc `slug` (ký tự `%`, `_`, `\` trong `q` được escape nên khớp theo nghĩa đen), chỉ `active`. Sắp xếp: tên bắt đầu bằng `q` lên trước, rồi `name` ASC. Response `{ data: [{ id, name, slug, priceVnd, priceUsd, image, badge }] }` (`image` là ảnh đầu tiên hoặc `null`, `badge` là `new`/`sale`/`bestseller`/`sold_out`/`limited`/`custom_order` hoặc `null`). `limit` nằm riêng trong DTO này (không kế thừa `PaginationQueryDto`), không phân trang; DTO nằm trong `NOT_LIST_DTO_FILES`.

**GET `/api/products/:id`** → `{ data: Product(+category, subcategory), related: Product[] }`. `ProductDetailQueryDto`: `relatedLimit` (int, tuỳ chọn, mặc định 4, 1–20; ngoài khoảng hoặc không phải số nguyên → 400). `related`: tối đa `relatedLimit` sản phẩm `active` cùng category, khác chính nó, mới nhất trước (ít hơn nếu category không đủ sản phẩm). `relatedLimit` nằm riêng trong DTO này (không phải API list, không kế thừa `PaginationQueryDto`); DTO nằm trong `NOT_LIST_DTO_FILES`. Không thấy → `404 Product not found`.

**GET `/api/admin/products`** — `AdminProductQueryDto`:

| Param | Ràng buộc |
|---|---|
| `search` | ≤ 255; `ILIKE` trên `name`, `slug`, `sku`, `description` |
| `status` | `IsIn(ACTIVE_STATUSES)` |
| `category` | slug category (≤ 255). Slug không tồn tại → trả list rỗng |
| `badge` | `IsIn(PRODUCT_BADGES)` |
| `minRating` | int 1–5, cùng ý nghĩa như list công khai |
| `sort` | whitelist `price`, `createdAt`, `name`, `ratingAverage`, `ratingCount`; mặc định `-createdAt` (sản phẩm chưa có đánh giá xếp cuối, thứ tự phụ `id` ASC) |

Kèm `category`, `subcategory` trong mỗi phần tử.

**POST `/api/admin/products`** — `CreateProductDto`:

| Field | Bắt buộc | Ràng buộc |
|---|---|---|
| `slug` | ✔ | string, not empty, ≤ 255 |
| `sku` | | string, ≤ 255; bỏ trống thì tự sinh |
| `name` | ✔ | string, not empty, ≤ 255 |
| `priceVnd` | ✔ | int, `1`–`1000000000` (VND) |
| `originalPriceVnd` | | int, `1`–`1000000000` (VND), phải `>= priceVnd` |
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

Response `{ data: Product }` (field giá như trên).

**PATCH `/api/admin/products/:id`** — `UpdateProductDto`: mọi field của create đều optional, cùng ràng buộc (mảng `images`/`sizes`/`colors` nếu gửi thì ≥ 1 phần tử). Tên cũ `price`/`originalPrice` và giá thập phân bị từ chối (field lạ / không phải số nguyên).

**DELETE `/api/admin/products/:id`** → `{ message: 'Product deleted successfully' }`. Không thấy → `404 Product not found`.

### 4.2 Dữ liệu

Bảng `products` (entity `Product extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `slug` | varchar(255) | UNIQUE (`UQ_products_slug`) |
| `sku` | varchar(255) | UNIQUE (`UQ_products_sku`) |
| `name` | varchar(255) | |
| `price` | bigint | giá bán VND (entity ép về number); `CK_products_price_positive`: `price > 0` |
| `original_price` | bigint | giá gốc VND, nullable; `CK_products_original_price`: NULL hoặc `>= price` |
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
| `rating_average` | numeric(2,1) | nullable; điểm trung bình của đánh giá `PUBLISHED` (1 chữ số thập phân); `CK_products_rating_average` NULL hoặc 1–5; index `IDX_products_rating_average`. Entity trả về dạng number |
| `rating_count` | integer | NOT NULL default 0; `CK_products_rating_count >= 0`; `CK_products_rating_pair`: `(rating_count = 0) = (rating_average IS NULL)` |
| `created_at`, `updated_at` | timestamptz | |

Migration `SetAllProductPricesTo2000Vnd` (dữ liệu, không đổi schema) đặt `price` = 2000 cho mọi sản phẩm và `original_price` = 2000 cho sản phẩm đang có giá gốc; giá cũ không được lưu lại.

Tham chiếu tới `products`: `reviews`, `wishlists`, `cart_items`, `collection_products` (ON DELETE CASCADE) và `order_items.product_id` (ON DELETE SET NULL).

### 4.3 Validation (3 tầng)

- **DTO**: như bảng ở 4.1 (`@IsNotEmpty`, `@MaxLength`, `@Min`, `@ArrayMinSize(1)`, `@IsIn(PRODUCT_BADGES | ACTIVE_STATUSES)`, `@ValidateNested` + `@Type` cho `colors`).
- **Service**:
  - `ensureSlugUnique`, `ensureSkuUnique` (private).
  - `originalPriceVnd >= priceVnd` (create và update, tính trên giá trị cuối cùng).
  - `categoryId`, `subcategoryId` phải tồn tại.
  - Subcategory phải thuộc category (`validateSubcategoryBelongsToCategory`).
- **DB**: UNIQUE `slug`/`sku`, CHECK giá/status/badge/mảng không rỗng/điểm đánh giá, FK RESTRICT cho category/subcategory (xem 4.2).
- `rating_average`/`rating_count` không nằm trong `CreateProductDto`/`UpdateProductDto` (field lạ bị từ chối): chỉ module [review](review.md) ghi chúng.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

**Tạo**: kiểm tra slug duy nhất → (nếu có `sku`) sku duy nhất → `originalPrice >= price` → tìm category rồi subcategory → subcategory thuộc category → `sku` = `dto.sku` hoặc `{category.slug}-{subcategory.slug}-{slug}` → lưu.

**Sửa**: tải sản phẩm kèm category/subcategory → kiểm tra slug/sku duy nhất chỉ khi giá trị đổi → đổi category/subcategory nếu có `categoryId`/`subcategoryId` → xác nhận subcategory thuộc category → kiểm tra giá trên giá trị cuối → gộp các field còn lại → nếu payload có `categoryId`, `subcategoryId` hoặc `slug` thì `sku` = `dto.sku` hoặc tự sinh lại theo công thức trên → lưu.

**Xoá**: xoá bản ghi; các bảng con xử lý theo FK ở 4.2 (không có chặn nghiệp vụ).

**Ý nghĩa của `badge` với luồng mua hàng**: `sold_out` và `custom_order` thuộc `NON_ORDERABLE_BADGES` — module [cart](cart.md) từ chối thêm vào giỏ và module [order](order.md) từ chối checkout. `limited` không bị chặn.

**List công khai**: dùng QueryBuilder join `category` (`cat`) và `subcategory` (`sub`); filter size/màu dùng `EXISTS` trên `jsonb_array_elements(_text)`; sort bằng `parseSort(sort, '-createdAt')` rồi `orderBy('p.<field>')`.

**List admin**: dùng `findAndCount` với `where` dạng mảng OR cho search (mỗi nhánh kèm filter status/badge/category/`minRating`); sort theo `ratingAverage` dùng `nulls: 'LAST'`, thứ tự phụ `id` ASC.

**Điểm đánh giá**: `ratingAverage`/`ratingCount` do [review](review.md) tính lại trong mỗi thao tác đánh giá (tạo, sửa sao, ẩn, hiện lại) và điền lại cho dữ liệu cũ bởi migration `AddReviewImagesAndProductRating`; module này chỉ đọc, sort và lọc theo chúng.

### 4.5 Error code

| Code | Tên | Khi nào |
|---|---|---|
| 1002 | `PRODUCT_SLUG_DUPLICATE` | Slug đã tồn tại |
| 1003 | `PRODUCT_SKU_DUPLICATE` | SKU đã tồn tại |
| 1004 | `PRODUCT_CATEGORY_NOT_FOUND` | Không thấy category hoặc subcategory |
| 1005 | `PRODUCT_SUBCATEGORY_MISMATCH` | Subcategory không thuộc category |
| 1009 | `PRODUCT_INVALID_PRICE` | `originalPriceVnd < priceVnd` |
| 1001 | `PRODUCT_NOT_FOUND` | Sản phẩm không tồn tại (chi tiết, sửa, xoá) — HTTP 404. Cũng được dùng ở [cart](cart.md) và [wishlist](wishlist.md) khi `productId` không tồn tại |

Sizes/colors/images rỗng không có error code riêng: bị chặn ở DTO (`ArrayMinSize(1)`) và CHECK DB.

### 4.6 Phụ thuộc & cấu hình

- `TypeOrmModule.forFeature([Product, Category, SubCategory])`; `CurrencyModule` (`CurrencyService`).
- `product.presenter.ts` (`presentProduct`) đổi `price`/`originalPrice` của entity thành cặp `...Vnd`/`...Usd`; module cart, wishlist, collection dùng lại hàm này.
- Không có biến môi trường riêng.
- `ProductService` được export nhưng chưa module nào inject.

### 4.7 Test

`product.presenter.spec.ts` — `presentProduct` (thay field giá bằng cặp Vnd/Usd, giá gốc `null`, không đổi entity gốc). `product.service.spec.ts` — lọc `minRating` và sort theo `ratingAverage`/`ratingCount` (public: điều kiện, `NULLS LAST`, thứ tự phụ; admin: `where`/`order`, kết hợp với search). Các phần còn lại của service chưa có spec riêng. `PublicProductQueryDto` và `AdminProductQueryDto` được `list-query.dto.spec.ts` kiểm tra tự động; `ProductAutocompleteQueryDto` và `ProductDetailQueryDto` nằm trong danh sách DTO không phải list. `findById`: `related` dùng `take` mặc định 4 và theo `relatedLimit`; `ProductDetailQueryDto`: mặc định 4, ép kiểu số, từ chối 0, âm, > 20, chữ, số thập phân.

### 4.8 Lưu ý hiện trạng

- `GET /api/products/:id` không lọc theo `status`: sản phẩm `disabled` vẫn xem được chi tiết theo id; `related` thì chỉ gồm `active`.
- `sort=price` và `minPrice`/`maxPrice` luôn theo VND (tiền gốc); không có lọc/sắp xếp theo USD.
- Khi sửa `slug`/`categoryId`/`subcategoryId` mà không gửi `sku`, `sku` được sinh lại theo công thức mặc định, kể cả khi sản phẩm đang dùng `sku` tuỳ chỉnh.
- Xoá sản phẩm không có `try/catch` riêng vì mọi FK trỏ tới `products` đều là `CASCADE` hoặc `SET NULL` (`order_items` giữ lại snapshot tên/giá/ảnh).
- Giá trị `size`/`color` ở giỏ hàng không được đối chiếu với `sizes`/`colors` của sản phẩm (xem [cart](cart.md)).
