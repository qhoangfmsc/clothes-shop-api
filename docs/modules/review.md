# review (`src/modules/review`)

> Cập nhật lần cuối: 2026-10-12

## 1. Tổng quan

Module đánh giá sản phẩm, hiện chỉ có chiều đọc: API công khai lấy danh sách đánh giá của một sản phẩm.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/review` |
| Route prefix | `/api/reviews` |
| Bảng DB | `reviews` |
| Module phụ thuộc | không import module khác (entity tham chiếu `Product`, `User`) |
| Export | không |

## 2. Mục đích & nghiệp vụ phục vụ

Hiển thị các đánh giá (tác giả, điểm sao, tiêu đề, nội dung, nhãn đã mua) trên trang chi tiết sản phẩm. Dữ liệu đánh giá hiện có đến từ migration seed (6 review); module chưa có endpoint tạo/sửa/xoá.

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Public | `review.controller.ts` | `/api/reviews` | `@Public()` | List đánh giá theo sản phẩm, có sort và phân trang |

## 4. Chi tiết

### 4.1 API

| Method | Path | Truy cập | Mô tả |
|---|---|---|---|
| GET | `/api/reviews/:productId` | Public | Đánh giá của một sản phẩm |

`PublicReviewQueryDto` (extends `PaginationQueryDto`): `sort` whitelist `rating`, `createdAt` (+ `-field`), mặc định `-createdAt`. Không có `search`/filter.

Response `paginated(...)`, mỗi phần tử: `{ id, author, avatar, rating, date, title, content, verified }`.

### 4.2 Dữ liệu

Bảng `reviews` (entity `Review extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `product_id` | varchar(16) | NOT NULL; FK `FK_reviews_product` → `products(id)` ON DELETE CASCADE; index `IDX_reviews_product_id` |
| `user_id` | varchar(16) | nullable; FK → `users(id)` ON DELETE SET NULL; index `IDX_reviews_user_id` |
| `author` | varchar(255) | |
| `avatar` | varchar(500) | default `''` |
| `rating` | int | `CHECK (rating >= 1 AND rating <= 5)` |
| `date` | varchar(50) | chuỗi ngày hiển thị |
| `title` | varchar(500) | default `''` |
| `content` | text | default `''` |
| `verified` | boolean | default `false` |
| `created_at`, `updated_at` | timestamptz | |

### 4.3 Validation (3 tầng)

- **DTO**: `sort` whitelist; `page`/`limit` theo `PaginationQueryDto`.
- **Service**: không có kiểm tra nghiệp vụ.
- **DB**: CHECK `rating` 1–5, FK với `products` (CASCADE) và `users` (SET NULL).

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

`ReviewService.findByProductId(productId, query)`: QueryBuilder `where r.productId = :productId`, sort bằng `parseSort(sort, '-createdAt')`, phân trang `getPaging`, map sang các field công khai (không trả `userId`).

### 4.5 Error code

Không có error code riêng, không ném lỗi nghiệp vụ.

### 4.6 Phụ thuộc & cấu hình

`TypeOrmModule.forFeature([Review])`. Không có biến môi trường.

### 4.7 Test

Chưa có spec riêng; `PublicReviewQueryDto` được `list-query.dto.spec.ts` kiểm tra tự động.

### 4.8 Lưu ý hiện trạng

- Không kiểm tra `productId` có tồn tại: id không tồn tại trả danh sách rỗng (`total: 0`).
- Module chưa có chức năng tạo/sửa/xoá đánh giá và chưa có permission riêng cho review.
