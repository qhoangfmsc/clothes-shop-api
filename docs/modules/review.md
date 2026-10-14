# review (`src/modules/review`)

> Cập nhật lần cuối: 2026-10-14

## 1. Tổng quan

Module đánh giá sản phẩm: khách đã mua và nhận hàng viết đánh giá (sao, tiêu đề, nội dung, cảm nhận về form/size, tối đa 5 ảnh), sửa một lần, bấm "hữu ích" cho đánh giá của người khác; API công khai trả danh sách đánh giá và bảng tổng hợp theo sản phẩm; admin kiểm duyệt sau (ẩn kèm lý do, hiện lại) và phản hồi đánh giá với tư cách cửa hàng.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/review` |
| Route prefix | `/api/reviews` (public + khách), `/api/my-reviews` (khách), `/api/admin/reviews` (admin) |
| Bảng DB | `reviews`, `review_votes` |
| Module phụ thuộc | `order` (đọc `Order`, `OrderItem` qua `EntityManager`/QueryBuilder để xác định dòng hàng đã mua); `media` (`MediaService`: upload và xác nhận ảnh đánh giá); ghi `products.rating_average`/`rating_count` qua `EntityManager`; entity tham chiếu `Product`, `User` |
| Export | `ReviewService` (module [pending-count](pending-count.md) dùng `countAwaitingReply`) |

## 2. Mục đích & nghiệp vụ phục vụ

- Trang sản phẩm: danh sách đánh giá đang hiển thị (lọc theo sao/fit/có ảnh, sort theo độ mới, sao, số "hữu ích") và bảng tổng hợp (điểm trung bình, số đánh giá, số đánh giá có ảnh, phân bố 1–5 sao, phân bố fit nhỏ/đúng size/rộng).
- Danh mục sản phẩm: điểm trung bình và số đánh giá được lưu sẵn trên `products` (xem [product](product.md)) để sort/lọc sản phẩm theo sao; module này giữ chúng đồng bộ.
- Khách: chỉ đánh giá được **dòng hàng** của đơn đã giao và đã thu tiền (nên mọi đánh giá của khách đều `verified = true`), trong hạn kể từ lúc giao; mỗi dòng hàng một đánh giá; sửa một lần; không xoá.
- Admin: đánh giá đăng ngay (`PUBLISHED`), kiểm duyệt sau bằng cách ẩn (`HIDDEN`) kèm lý do khi vi phạm; không có chức năng ẩn theo số sao. Admin trả lời đánh giá, phản hồi hiển thị công khai dưới đánh giá.

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Public + khách | `review.controller.ts` | `/api/reviews` | `GET` public; ghi cần JWT + permission | List đánh giá theo sản phẩm, tổng hợp; upload ảnh, tạo, sửa đánh giá; bấm/bỏ "hữu ích" |
| Khách | `my-review.controller.ts` | `/api/my-reviews` | JWT + permission | Đánh giá của tôi, dòng hàng chờ đánh giá, các đánh giá tôi đã bấm "hữu ích" |
| Admin | `admin-review.controller.ts` | `/api/admin/reviews` | JWT + permission | List/chi tiết, ẩn/hiện, đặt/xoá phản hồi của cửa hàng |

## 4. Chi tiết

### 4.1 API

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/reviews/:productId` | Public | Đánh giá `PUBLISHED` của một sản phẩm |
| GET | `/api/reviews/:productId/summary` | Public | Điểm trung bình, phân bố sao, phân bố fit |
| POST | `/api/reviews/images` | `REVIEW_CREATE` | Upload 1 ảnh để đính vào đánh giá |
| POST | `/api/reviews` | `REVIEW_CREATE` | Đánh giá một dòng hàng đã mua |
| PATCH | `/api/reviews/:reviewId` | `REVIEW_CREATE` | Sửa đánh giá của tôi (một lần) |
| POST | `/api/reviews/:reviewId/helpful` | `REVIEW_VOTE` | Bấm "hữu ích" (idempotent) |
| DELETE | `/api/reviews/:reviewId/helpful` | `REVIEW_VOTE` | Bỏ "hữu ích" |
| GET | `/api/my-reviews` | `REVIEW_VIEW` | Đánh giá của tôi, kể cả đã bị ẩn |
| GET | `/api/my-reviews/pending` | `REVIEW_VIEW` | Dòng hàng đang chờ tôi đánh giá |
| GET | `/api/my-reviews/votes?productId=` | `REVIEW_VIEW` | Id các đánh giá của sản phẩm mà tôi đã bấm "hữu ích" |
| GET | `/api/admin/reviews` | `REVIEW_ADMIN_VIEW` | Danh sách cho admin |
| GET | `/api/admin/reviews/:reviewId` | `REVIEW_ADMIN_VIEW` | Chi tiết một đánh giá |
| POST | `/api/admin/reviews/:reviewId/hide` | `REVIEW_ADMIN_MODERATE` | Ẩn đánh giá vi phạm (HTTP 201) |
| POST | `/api/admin/reviews/:reviewId/publish` | `REVIEW_ADMIN_MODERATE` | Hiện lại đánh giá đã ẩn (HTTP 201) |
| PUT | `/api/admin/reviews/:reviewId/reply` | `REVIEW_ADMIN_REPLY` | Đặt hoặc thay phản hồi của cửa hàng |
| DELETE | `/api/admin/reviews/:reviewId/reply` | `REVIEW_ADMIN_REPLY` | Xoá phản hồi của cửa hàng |

**GET `/api/reviews/:productId`** — `PublicReviewQueryDto` (extends `PaginationQueryDto`):

| Param | Ràng buộc |
|---|---|
| `rating` | int 1–5 (`@Type(() => Number)`, `IsInt`, `Min(1)`, `Max(5)`) |
| `fit` | `IsIn(REVIEW_FITS)` = `small`, `true_to_size`, `large` |
| `hasImages` | boolean tuỳ chọn (chỉ `true`/`false`, giá trị khác → 400): `true` = chỉ đánh giá có ảnh, `false` = chỉ đánh giá không ảnh |
| `sort` | whitelist `rating`, `createdAt`, `helpfulCount` (+ `-field`); mặc định `-createdAt` |

Luôn chỉ lấy `status = 'PUBLISHED'`; thứ tự phụ `id` ASC để phân trang ổn định. Response `paginated(...)`, mỗi phần tử (phần công khai):

```json
{ "id": "...", "author": "Nguyen Van A", "avatar": "", "rating": 5, "date": "2026-10-14", "createdAt": "...", "title": "...", "content": "...",
  "verified": true, "fit": "true_to_size", "images": ["https://.../a.jpg"], "size": "M", "color": "white", "helpfulCount": 3, "edited": false,
  "reply": { "content": "Cảm ơn bạn!", "repliedAt": "..." } }
```

`reply` là `null` khi cửa hàng chưa phản hồi; `fit` là `null` khi khách không chọn; `images` là mảng URL (`[]` khi không có ảnh). Không có `userId`, `orderItemId`, trạng thái hay ghi chú kiểm duyệt.

**GET `/api/reviews/:productId/summary`** → `{ data: { productId, ratingCount, ratingAverage, withImages, distribution: {"1".."5"}, fit: { small, true_to_size, large, total } } }`. Chỉ tính đánh giá `PUBLISHED`; `withImages` là số đánh giá có ít nhất một ảnh. `ratingAverage` làm tròn 1 chữ số thập phân (half-up, tính bằng số nguyên; bằng giá trị `ROUND(AVG(rating), 1)` lưu ở `products.rating_average`), `null` khi chưa có đánh giá; `fit.total` chỉ đếm đánh giá có chọn fit.

**POST `/api/reviews/images`** — `multipart/form-data`, field `file` (đúng 1 ảnh JPEG/PNG/WebP/GIF/AVIF xác định theo magic bytes, tối đa 5 MB, `FileInterceptor`). Ảnh lưu cùng bucket Supabase với thư viện admin nhưng đánh dấu `purpose = REVIEW` và `uploaded_by` = user nên không hiện ở `/api/admin/media`. Mỗi user tối đa 30 ảnh trong 24 giờ. Response `{ data: { url, mimeType, size } }`; chưa gắn vào đánh giá nào cho tới khi gửi `url` ở `images` của POST/PATCH. Lỗi: `MEDIA_FILE_REQUIRED (1602)`, `MEDIA_INVALID_TYPE (1603)`, `MEDIA_UPLOAD_LIMIT_REACHED (1607, 429)`, `MEDIA_STORAGE_ERROR (1605)`, `MEDIA_NOT_CONFIGURED (1601)` (xem [media](media.md)); file lớn hơn 5 MB bị `FileInterceptor` chặn với `413 File too large` thô (không có `errorCode`).

**POST `/api/reviews`** — `CreateReviewDto`:

| Field | Bắt buộc | Ràng buộc |
|---|---|---|
| `orderItemId` | ✔ | string, not empty, ≤ 16 (`items[].id` trong chi tiết đơn) |
| `rating` | ✔ | int 1–5 |
| `title` | | string (trim), ≤ 255 |
| `content` | | string (trim), ≤ 2000; không được chứa liên kết |
| `fit` | | `IsIn(REVIEW_FITS)` |
| `images` | | mảng string, ≤ 5 phần tử, không trùng, mỗi URL ≤ 1000 ký tự; chỉ nhận URL ảnh do chính user upload ở `POST /api/reviews/images` |

Response HTTP 201 `{ data: <góc nhìn tác giả> }`: phần công khai ở trên cộng `productId`, `orderItemId`, `product: { id, name, slug, image }`, `status`, `moderationNote` (chỉ có giá trị khi `HIDDEN`), `editedAt`, `canEdit`, `editableUntil` (`null` khi hết quyền sửa). Field lạ (vd `status`) bị `ValidationPipe` từ chối.

**PATCH `/api/reviews/:reviewId`** — `UpdateReviewDto`: `rating`, `title`, `content`, `fit`, `images` đều tuỳ chọn, cùng ràng buộc như create (`images` thay toàn bộ danh sách, `[]` = bỏ hết ảnh); phải gửi ít nhất một field (body rỗng → `400 Nothing to update`). Response `{ data: <góc nhìn tác giả> }`.

**GET `/api/my-reviews`** — `MyReviewQueryDto`: `status` (`IsIn(REVIEW_STATUSES)`), `productId` (≤ 16), `sort` (whitelist `createdAt`, `rating`; mặc định `-createdAt`). Response `paginated(...)` các phần tử góc nhìn tác giả.

**GET `/api/my-reviews/pending`** — `MyPendingReviewQueryDto`: `sort` (whitelist `deliveredAt`; mặc định `-deliveredAt`). Response `paginated(...)`, mỗi phần tử `{ orderItemId, orderId, productId, productName, productImage, size, color, quantity, deliveredAt, reviewDeadline }`.

**GET `/api/my-reviews/votes`** — `MyReviewVotesQueryDto` (không phân trang): `productId` bắt buộc, ≤ 16. Response `{ data: string[] }` (id các đánh giá của sản phẩm mà user đã bấm "hữu ích").

**POST/DELETE `/api/reviews/:reviewId/helpful`** → `{ data: { reviewId, helpfulCount, voted } }` (`voted = true` sau POST, `false` sau DELETE).

**GET `/api/admin/reviews`** — `AdminReviewQueryDto`:

| Param | Ràng buộc |
|---|---|
| `search` | ≤ 255; `ILIKE` trên `title`, `content`, `author` của đánh giá và `name` của sản phẩm |
| `status` | `IsIn(REVIEW_STATUSES)` = `PUBLISHED`, `HIDDEN` |
| `rating` | int 1–5 |
| `fit` | `IsIn(REVIEW_FITS)` |
| `hasImages` | boolean tuỳ chọn như ở list công khai |
| `product` | slug sản phẩm (≤ 255); slug không tồn tại → list rỗng |
| `userId` | id người viết (≤ 16) |
| `replied` | boolean tuỳ chọn (chỉ `true`/`false`, giá trị khác → 400): `true` = đã có phản hồi của cửa hàng, `false` = chưa có |
| `sort` | whitelist `createdAt`, `rating`, `helpfulCount`; mặc định `-createdAt` |

Response `paginated(...)`; mỗi phần tử là phần công khai cộng `productId`, `orderItemId`, `userId`, `product { id, name, slug, image }`, `status`, `moderationNote`, `moderatedBy`, `moderatedAt`, `editedAt`, `repliedBy`.

**POST `/api/admin/reviews/:reviewId/hide`** — `HideReviewDto`: `note` bắt buộc (trim, not empty, ≤ 500), là lý do ẩn và tác giả thấy. **POST `.../publish`** không có body. **PUT `.../reply`** — `ReplyReviewDto`: `content` bắt buộc (trim, not empty, ≤ 1000). Các endpoint admin trả `{ data: <góc nhìn admin> }` của đánh giá sau khi đổi.

### 4.2 Dữ liệu

Bảng `reviews` (entity `Review extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `product_id` | varchar(16) | NOT NULL; FK `FK_reviews_product` → `products(id)` ON DELETE CASCADE; index `IDX_reviews_product_id` |
| `user_id` | varchar(16) | nullable; FK `FK_reviews_user` → `users(id)` ON DELETE SET NULL; index `IDX_reviews_user_id` |
| `order_item_id` | varchar(16) | nullable; FK `FK_reviews_order_item` → `order_items(id)` ON DELETE SET NULL; `UQ_reviews_order_item_id` (mỗi dòng hàng một đánh giá; nhiều NULL được phép) |
| `author` | varchar(255) | snapshot tên người viết |
| `avatar` | varchar(500) | default `''`; snapshot ảnh |
| `rating` | int | `CHECK (rating >= 1 AND rating <= 5)` (không đặt tên, từ `InitSchema`) |
| `date` | varchar(50) | chuỗi ngày hiển thị |
| `title` | varchar(500) | default `''` |
| `content` | text | default `''` |
| `verified` | boolean | default `false` |
| `size` | varchar(50) | default `''`; snapshot size của dòng hàng |
| `color` | varchar(100) | default `''`; snapshot màu của dòng hàng |
| `fit` | varchar(20) | nullable; `CK_reviews_fit` NULL hoặc ∈ (`small`, `true_to_size`, `large`) |
| `images` | jsonb | NOT NULL, default `[]`; URL ảnh đính kèm; `CK_reviews_images`: là mảng và có ≤ 5 phần tử |
| `status` | varchar(10) | default `PUBLISHED`; `CK_reviews_status` ∈ (`PUBLISHED`, `HIDDEN`); index `IDX_reviews_status` |
| `helpful_count` | int | default 0; `CK_reviews_helpful_count >= 0` |
| `edited_at` | timestamptz | nullable; lúc khách sửa (chỉ một lần) |
| `moderation_note` | varchar(500) | nullable; `CK_reviews_hidden_note`: `status <> 'HIDDEN' OR moderation_note IS NOT NULL` |
| `moderated_by` | varchar(16) | nullable; FK `FK_reviews_moderated_by` → `users(id)` ON DELETE SET NULL; index `IDX_reviews_moderated_by` |
| `moderated_at` | timestamptz | nullable |
| `reply` | varchar(1000) | nullable; phản hồi của cửa hàng |
| `replied_by` | varchar(16) | nullable; FK `FK_reviews_replied_by` → `users(id)` ON DELETE SET NULL; index `IDX_reviews_replied_by` |
| `replied_at` | timestamptz | nullable; `CK_reviews_reply`: `(reply IS NULL) = (replied_at IS NULL)` |
| `created_at`, `updated_at` | timestamptz | |

Index composite `IDX_reviews_product_status_created` trên (`product_id`, `status`, `created_at` DESC) cho list công khai.

Ảnh đính kèm nằm trong bảng `media_files` của module [media](media.md) (`purpose = 'REVIEW'`, `uploaded_by` = người upload); `reviews.images` chỉ giữ URL, không có khoá ngoại.

Bảng `review_votes` (entity `ReviewVote extends BaseEntity`): `review_id` (NOT NULL, FK `FK_review_votes_review` → `reviews(id)` ON DELETE CASCADE), `user_id` (NOT NULL, FK `FK_review_votes_user` → `users(id)` ON DELETE CASCADE, index `IDX_review_votes_user_id`), `UQ_review_votes_review_user` trên (`review_id`, `user_id`), `created_at`, `updated_at`.

### 4.3 Validation (3 tầng)

- **DTO**: như bảng ở 4.1 (`@IsInt` + `@Min(1)` + `@Max(5)` cho `rating`, `@IsIn(REVIEW_FITS)`, `@MaxLength`, `@Transform(trim)`, `@IsNotEmpty` cho `note`/`reply`; `@IsArray` + `@ArrayMaxSize(5)` + `@ArrayUnique` + `@IsString({ each })` cho `images`; query DTO theo chuẩn list).
- **Service**:
  - Dòng hàng phải thuộc đơn của chính user, đơn `paymentStatus` ∈ `paid`/`refunded`, `status` ∈ `delivered`/`completed`, còn trong `REVIEW_WINDOW_DAYS` (30) ngày kể từ `delivered_at`, sản phẩm của dòng hàng còn tồn tại (`product_id` không NULL); mỗi dòng hàng một đánh giá (tính thuần ở `review-eligibility.util.ts`, kiểm tra tồn tại ở `create`).
  - Sửa: chỉ tác giả, chưa sửa lần nào, trong `REVIEW_EDIT_WINDOW_DAYS` (30) ngày kể từ lúc gửi, đánh giá chưa bị ẩn; `title`/`content` không chứa liên kết (`http(s)://…` hoặc `www.…`).
  - Ảnh: mọi URL trong `images` phải thuộc bucket hiện tại và trỏ tới ảnh `REVIEW` do chính user upload (`MediaService.resolveReviewImageUrls`); không đạt → `REVIEW_IMAGE_INVALID`. URL được dựng lại từ storage key trước khi lưu.
  - Vote: đánh giá phải `PUBLISHED`, không vote đánh giá của chính mình.
  - Ẩn/hiện: chỉ `PUBLISHED` → `HIDDEN` và ngược lại.
  - Catch DB error: vi phạm `UQ_reviews_order_item_id` (mã Postgres `23505`) khi hai request đồng thời cho cùng dòng hàng → `REVIEW_ALREADY_EXISTS`.
- **DB**: CHECK `rating`, `fit`, `status`, `helpful_count`, `hidden_note`, `reply`, `images`; UNIQUE `order_item_id` và (`review_id`, `user_id`); FK và index ở 4.2.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

**Tạo (`create`)** — kiểm tra liên kết trong `title`/`content` và xác nhận `images` (trước khi mở transaction); trong một transaction: nạp `OrderItem` rồi `Order` của user (không có → `REVIEW_NOT_ALLOWED` HTTP 404 `Order item not found`) → `computeReviewEligibility` (lý do: `ORDER_NOT_PAID`, `ORDER_NOT_DELIVERED`, `REVIEW_WINDOW_EXPIRED`, `PRODUCT_REMOVED`, đều `REVIEW_NOT_ALLOWED` HTTP 400 kèm message riêng) → đã có đánh giá cho dòng hàng → `REVIEW_ALREADY_EXISTS` HTTP 409 → khoá dòng sản phẩm (`pessimistic_write`, **trước** khi chèn đánh giá để hai đánh giá đồng thời không bế tắc ở khoá FK) → lưu với `author` = tên user (hoặc `Customer` nếu trống), `avatar` = ảnh user, `date` = ngày hiện tại `YYYY-MM-DD` (UTC), `verified = true`, snapshot `size`/`color` của dòng hàng, `status = PUBLISHED`, `images` → tính lại điểm sản phẩm (xem dưới). Trả lại bản đọc từ DB kèm sản phẩm.

**Sửa (`update`)** — trong transaction khoá dòng đánh giá (`pessimistic_write`) của user (không có → `REVIEW_NOT_FOUND` 404) → `reviewEditBlock`: `HIDDEN` (đánh giá đã bị ẩn), `ALREADY_EDITED`, `EDIT_WINDOW_EXPIRED` → đều `REVIEW_EDIT_NOT_ALLOWED` kèm message → gộp field gửi lên (`images` được xác nhận như create), đặt `edited_at`; nếu `rating` được gửi thì khoá sản phẩm và tính lại điểm sản phẩm.

**Điểm trên sản phẩm** — `products.rating_average` (làm tròn 1 chữ số, `null` khi chưa có) và `rating_count` được tính lại từ các đánh giá `PUBLISHED` của sản phẩm (`COUNT(*)`, `ROUND(AVG(rating), 1)`) bởi `refreshProductRating` trong cùng transaction với mọi thay đổi làm đổi tập hoặc điểm: tạo, sửa `rating`, ẩn, hiện lại. Trước mỗi lần tính, transaction khoá dòng sản phẩm (`pessimistic_write`), nên các thay đổi đồng thời trên cùng sản phẩm tuần tự và số liệu luôn tính trên dữ liệu đã commit; thứ tự khoá luôn là đánh giá → sản phẩm (create: sản phẩm → đánh giá mới). Vote và phản hồi không đổi điểm.

**Vote (`vote`/`unvote`)** — trong transaction khoá dòng đánh giá (`pessimistic_write`, nên các vote đồng thời tuần tự); đánh giá không có hoặc không `PUBLISHED` → `REVIEW_NOT_FOUND` 404; POST thêm dòng `review_votes` nếu chưa có (lặp lại không đổi gì), DELETE xoá dòng của user; `helpful_count` luôn được đặt lại bằng `COUNT(review_votes)` trong cùng transaction.

**Dòng hàng chờ đánh giá (`findPending`)** — `order_items` join `orders` của user, `status` ∈ `delivered`/`completed`, `payment_status` ∈ `paid`/`refunded`, `delivered_at >= now − 30 ngày`, `product_id IS NOT NULL`, chưa có dòng `reviews` trỏ tới. `reviewDeadline` = `delivered_at` + 30 ngày. Cùng điều kiện với `computeReviewEligibility`.

**Kiểm duyệt** — `hide` (`PUBLISHED` → `HIDDEN`, ghi `moderation_note`, `moderated_by`, `moderated_at`), `publish` (`HIDDEN` → `PUBLISHED`, xoá `moderation_note`, ghi lại `moderated_by`/`moderated_at`); mỗi thao tác chạy trong transaction khoá dòng đánh giá. Đánh giá `HIDDEN` biến mất khỏi list công khai, tổng hợp và bộ lọc/đếm theo sao; tác giả vẫn thấy ở `/api/my-reviews` kèm `moderationNote`.

**Đếm chờ phản hồi (`countAwaitingReply`)** — số đánh giá `status = PUBLISHED` và `reply IS NULL`, bằng `total` của `GET /api/admin/reviews?status=PUBLISHED&replied=false`; dùng cho badge `reviews` của [pending-count](pending-count.md).

**Phản hồi** — `reply` đặt hoặc thay `reply`, `replied_by`, `replied_at`; `DELETE` đưa cả ba về NULL. Phản hồi hiển thị công khai ở `reply` của list.

### 4.5 Error code

| Code | Tên | Khi nào |
|---|---|---|
| 1901 | `REVIEW_NOT_FOUND` | Đánh giá không tồn tại (admin; sửa; vote — đánh giá bị ẩn cũng trả mã này khi vote) — HTTP 404 |
| 1902 | `REVIEW_NOT_ALLOWED` | Dòng hàng không đánh giá được: không thuộc đơn của user hoặc không tồn tại (HTTP 404), đơn chưa thanh toán/chưa giao, quá hạn, sản phẩm đã bị xoá (HTTP 400) |
| 1903 | `REVIEW_ALREADY_EXISTS` | Dòng hàng đã có đánh giá (kể cả hai request đồng thời) — HTTP 409 |
| 1904 | `REVIEW_EDIT_NOT_ALLOWED` | Đã sửa một lần, quá hạn sửa, hoặc đánh giá đang bị ẩn |
| 1905 | `REVIEW_CONTENT_NOT_ALLOWED` | `title`/`content` chứa liên kết |
| 1906 | `REVIEW_INVALID_STATE` | Ẩn đánh giá đã ẩn, hiện đánh giá đang hiển thị |
| 1907 | `REVIEW_VOTE_OWN` | Vote đánh giá của chính mình |
| 1908 | `REVIEW_IMAGE_INVALID` | `images` chứa URL không phải ảnh đánh giá do chính user upload |

Ngoài ra, `PATCH` với body rỗng trả `400` thô (`BadRequestException('Nothing to update')`).

### 4.6 Phụ thuộc & cấu hình

- `TypeOrmModule.forFeature([Review, ReviewVote, Order, OrderItem])` và `MediaModule`; `ReviewService` inject `DataSource`, `Repository<Review>` và `MediaService`. Module export `ReviewService`.
- Hằng số ở `review.constant.ts`: `REVIEW_STATUSES`, `REVIEW_FITS`, `REVIEWABLE_ORDER_STATUSES`, `REVIEWABLE_PAYMENT_STATUSES`, `REVIEW_WINDOW_DAYS = 30`, `REVIEW_EDIT_WINDOW_DAYS = 30`, `REVIEW_MAX_IMAGES = 5`; ảnh đánh giá dùng `REVIEW_IMAGE_MAX_FILE_SIZE` (5 MB) và `REVIEW_UPLOAD_LIMIT_PER_DAY` (30) ở `media.constant.ts`. Cần `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET`, `SUPABASE_SERVICE_ROLE_KEY` để upload ảnh (xem [media](media.md)).
- Quyền: `REVIEW_CREATE 17000`, `REVIEW_VIEW 17001`, `REVIEW_VOTE 17002` (trong `DEFAULT_USER_PERMISSIONS`); `REVIEW_ADMIN_VIEW 18000`, `REVIEW_ADMIN_MODERATE 18001`, `REVIEW_ADMIN_REPLY 18002` (admin tự có, không nằm trong `DEFAULT_USER_PERMISSIONS`). Migration `AddReviewFeatures` cấp ba quyền khách cho user hiện có `ORDER_CREATE`.
- Biến môi trường: chỉ các biến Supabase của [media](media.md) cho upload ảnh.

### 4.7 Test

- `review-eligibility.util.spec.ts` — `computeReviewEligibility` (đơn đã trả/đã giao/đã hoàn tiền, từng trạng thái đơn bị từ chối, thiếu `delivered_at`, biên hạn 30 ngày, sản phẩm đã xoá), `reviewEditBlock` (ẩn, đã sửa, quá hạn, biên hạn sửa), `containsLink`.
- `review.service.spec.ts` (EntityManager giả trong bộ nhớ) — `create` (snapshot, tên/ảnh mặc định, đơn của người khác/không tồn tại → 404, chưa trả/chưa giao/quá hạn/sản phẩm đã xoá, đã có đánh giá → 409, vi phạm UNIQUE đồng thời → 409, lỗi DB khác được ném lại, từ chối liên kết trước khi chạm DB), `update` (sửa một lần, từ chối lần hai/quá hạn/đã ẩn, đánh giá của người khác → 404, body rỗng, liên kết), vote (đếm một lần dù gửi hai lần, nhiều người, bỏ vote chỉ xoá của mình, vote đánh giá của mình, đánh giá bị ẩn/không có → 404, khoá dòng), ẩn/hiện, đặt/thay/xoá phản hồi, list công khai (điều kiện `PUBLISHED`, filter rating/fit, sort, phân trang, không lộ field nội bộ), tổng hợp (trung bình, phân bố, fit, làm tròn, rỗng) và các DTO (`CreateReviewDto`, `UpdateReviewDto`, `HideReviewDto`).
- `review.service.spec.ts` (tiếp) — ảnh (lưu URL đã xác nhận, mặc định `[]`, ảnh không phải của user → 1908 và không lưu, sửa thay/xoá ảnh, ảnh sai không tiêu hao lần sửa, `uploadImage` uỷ quyền cho media với `REVIEW` (kiểm tra kích thước ở service chỉ là lớp phòng thủ thứ hai sau `FileInterceptor`), filter `hasImages` ở list công khai/admin, `withImages` của tổng hợp), đồng bộ `products.rating_*` (create khoá sản phẩm trước khi chèn, trung bình tính trên mọi đánh giá `PUBLISHED`, sửa sao mới tính lại, ẩn/hiện, ẩn đánh giá cuối về `null`, vote/phản hồi không đụng sản phẩm, làm tròn half-up khớp Postgres), `countAwaitingReply` cùng điều kiện với list admin, và DTO `images`.
- `list-query.dto.spec.ts` tự kiểm tra `PublicReviewQueryDto`, `MyReviewQueryDto`, `MyPendingReviewQueryDto`, `AdminReviewQueryDto`; `MyReviewVotesQueryDto` nằm trong `NOT_LIST_DTO_FILES` (không phân trang).
- Các QueryBuilder của `findMine`, `findPending`, `findAllAdmin`, `findMyVotes` và việc tính lại điểm sản phẩm khi có thao tác đồng thời không được kiểm chứng bằng unit test (bộ test dùng DB giả); chúng đã được chạy thủ công trên PostgreSQL thật (xem 4.8).

### 4.8 Lưu ý hiện trạng

- Chỉ hỗ trợ ảnh; chưa có video trong đánh giá.
- Ảnh đã upload nhưng không gắn vào đánh giá nào, và ảnh bị bỏ khỏi `images` khi sửa, vẫn nằm trên storage và trong `media_files` (không có job dọn dẹp); chỉ có giới hạn 30 ảnh/24 giờ mỗi user để chặn lạm dụng. Ảnh `REVIEW` không xoá được qua `/api/admin/media`.
- `GET /api/products` và `GET /api/products/:id` trả `ratingAverage`/`ratingCount` từ cột lưu sẵn trên `products`; số này tính lại trong mỗi thao tác đánh giá ở 4.4. Migration `AddReviewImagesAndProductRating` điền lại số cho dữ liệu cũ. Nếu `reviews` bị sửa trực tiếp trong DB (ngoài API), số lưu sẵn không tự cập nhật.
- Các đánh giá seed (migration `SeedData`) không có `user_id`/`order_item_id`, giữ `verified` như seed, không ai sửa được; admin ẩn/phản hồi được, user vote được.
- `date` là cột chuỗi giữ từ trước; đánh giá mới ghi `YYYY-MM-DD` (UTC), seed giữ chuỗi cũ. Thứ tự hiển thị theo `created_at`, không theo `date`.
- `author` là snapshot tên user lúc viết (không che tên); đổi tên user sau đó không cập nhật đánh giá cũ.
- Đơn đã hoàn tiền (`payment_status = refunded`) và dòng hàng đã nằm trong yêu cầu trả hàng vẫn đánh giá được; module không đọc `return_requests`.
- Điều kiện được đánh giá phụ thuộc `orders.delivered_at`, đơn `delivered`/`completed` luôn có giá trị này (xem [order](order.md)).
- `GET /api/reviews/:productId` và `/summary` không kiểm tra `productId` tồn tại: id không tồn tại trả list rỗng / `ratingCount: 0`.
- `helpful_count` là số đếm được lưu sẵn, đặt lại từ `review_votes` ở mỗi lượt vote/bỏ vote; vote đánh giá đã bị ẩn trả 404 (kể cả bỏ vote). Khi đánh giá được hiện lại, các vote cũ còn nguyên.
- Xoá sản phẩm xoá luôn đánh giá và vote của nó (CASCADE); xoá đơn/dòng hàng giữ đánh giá và đặt `order_item_id` về NULL; xoá user giữ đánh giá (`user_id` NULL) và xoá vote của user đó.
- Badge `reviews` của [pending-count](pending-count.md) đếm mọi đánh giá `PUBLISHED` chưa có phản hồi (không phân biệt số sao, không có khái niệm "đã xem"); đánh giá bị ẩn không tính.
- Migration `AddReviewFeatures` và `AddReviewImagesAndProductRating` đã được chạy thủ công trên PostgreSQL 16 tạm (toàn bộ chuỗi migration trên DB sạch, `down` rồi `up` lại, điền lại điểm cho đánh giá seed) cùng hai kịch bản tích hợp với `ReviewService`, `MediaService`, `ProductService` thật (tạo/vote/sửa/ẩn đồng thời, điểm sản phẩm luôn khớp tính lại từ `reviews`, ảnh chính chủ, giới hạn upload, sort/lọc sản phẩm theo sao với `NULLS LAST`, các CHECK/UNIQUE); các kịch bản này không nằm trong repo.
