# 0008 — Lỗi toàn vẹn của DB trả mã lỗi đúng, không phải 500

> Module: `common` (+ product, collection, wishlist, auth, cart, category chỉ đổi cách bắt lỗi) · Trạng thái: Approved · Ngày: 2026-10-23

## 1. Bối cảnh & vấn đề

CLAUDE.md yêu cầu "bắt lỗi DB (FK RESTRICT, UNIQUE) và trả mã lỗi đẹp". Chiến dịch test cho thấy ở 7 chỗ quy tắc này bị bỏ sót vì cùng một mẫu **kiểm tra rồi mới ghi** (check-then-act), nên hai request đồng thời cùng qua bước kiểm tra và request thua vi phạm UNIQUE của DB → 500:

| Route | Ràng buộc DB | Quan sát |
|---|---|---|
| `POST /api/admin/products` | `UQ_products_slug`, `UQ_products_sku` | tạo đồng thời cùng slug → `[201, 500, 500]` |
| `POST /api/admin/products` | `UQ_products_sku` | `sku` tự sinh `{category}-{subcategory}-{slug}` trùng `sku` có sẵn → 500 (chỉ `sku` do client gửi mới được kiểm) |
| `POST /api/admin/collections` | `UQ_collections_slug` | `[201, 500, 400/1202]` |
| `POST /api/wishlist/:productId` | `UQ_wishlists_user_product` | bấm đúp → `[201, 500, 500]` (docs: thêm lại là idempotent) |
| `POST /api/cart/items` | `UQ_carts_user`, `UQ_cart_items_unique` | thêm đồng thời → `[201, 500, 500]` |
| `POST /api/auth/google` | `UQ_users_email` | đăng nhập lần đầu đồng thời → `[201, 500, 500]` |
| `PATCH` mọi route (`null`) | `NOT NULL` | `null` ở field tuỳ chọn không được lọc ở DTO |

Ngoài ra `ensure*Unique` + `catch (23505)` hiện có ở category ánh xạ **mọi** vi phạm UNIQUE sang `CATEGORY_SUBSLUG_DUPLICATE` (1103), kể cả khi vi phạm là `UQ_categories_slug` (đáng ra 1102).

Cách các hệ thống khác làm (đã tra cứu): DB là nguồn sự thật cuối cùng cho tính duy nhất; ứng dụng bắt lỗi vi phạm ràng buộc và ánh xạ theo **tên constraint** (Rails `RecordNotUnique`, Django `IntegrityError`); với thao tác idempotent dùng `INSERT … ON CONFLICT` hoặc "đọc lại sau khi thua" (PostgreSQL: `ON CONFLICT DO NOTHING/UPDATE` là cách chuẩn tránh lỗi unique trong get-or-create).

## 2. Mục tiêu & ngoài phạm vi

**Mục tiêu**
- Một helper trong `common/` đọc SQLSTATE và tên constraint của lỗi Postgres/TypeORM; các chỗ trên dùng nó để trả đúng mã lỗi nghiệp vụ.
- Thao tác idempotent (yêu thích, thêm giỏ, đăng nhập lần đầu) **thành công** khi thua cuộc đua, đúng như docs mô tả, thay vì báo lỗi.
- Lưới an toàn cuối ở `AllExceptionFilter`: lỗi toàn vẹn DB chưa được ánh xạ riêng trả 4xx kèm mã chung, không 500 (vi phạm dữ liệu từ client không phải lỗi máy chủ); vẫn log cảnh báo kèm tên constraint.
- Test bằng cuộc đua thật (nhiều request song song) cho từng chỗ.

**Ngoài phạm vi**
- Đổi các `ensure*Unique` hiện có (vẫn giữ cho đường thường; chỉ bổ sung bắt lỗi khi đua).
- Retry tự động cho `serialization_failure`/deadlock (không có trường hợp quan sát được).

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Helper theo constraint + "đọc lại khi thua" cho idempotent + lưới an toàn ở filter** | Đúng mã lỗi từng chỗ; idempotent thật; lưới cuối chống 500 mới | Thêm một helper và một nhánh ở filter |
| B. `INSERT … ON CONFLICT` thô (query builder) cho mọi get-or-create | Một câu lệnh, không race | Bỏ qua hook `@BeforeInsert` sinh id (đã gặp ở site-config, xem `site-config.service.ts`); phải sinh id tay; khó đọc |
| C. Khoá cố vấn (advisory lock) quanh mỗi thao tác tạo | Loại bỏ race hoàn toàn | Thêm khoá cho thao tác không tranh chấp tiền; tốn kém hơn và dễ quên |
| D. Chỉ lưới an toàn ở filter | Rẻ nhất | Mã lỗi chung chung, không idempotent: bấm đúp vẫn lỗi |

**Chọn A**: ánh xạ chính xác ở service (có ngữ cảnh), lưới chung ở filter cho phần còn sót. B bị loại vì hook id; C vì không cần cho dữ liệu này.

### 3.2 Kiến trúc & ranh giới

- `common/base/db-error.util.ts` (hàm thuần): `dbError(err)` → `{ code, constraint, column } | null` đọc từ `err.driverError ?? err`; hằng SQLSTATE `PG_UNIQUE_VIOLATION = '23505'`, `PG_NOT_NULL_VIOLATION = '23502'`, `PG_CHECK_VIOLATION = '23514'`, `PG_FOREIGN_KEY_VIOLATION = '23503'`; `throwOnConstraint(err, { [constraint]: errorCode })` ném `throwAppError` nếu lỗi là vi phạm của một constraint đã khai báo, ngược lại trả lại để caller ném lại lỗi gốc.
- `AllExceptionFilter`: nhánh mới trước nhánh 500 cho `QueryFailedError` có SQLSTATE thuộc nhóm toàn vẹn (23502/23503/23505/23514): 400 (`23502`, `23514`) hoặc 409 (`23503`, `23505`), `errorCode` chung mới `9101`–`9104`, message không lộ SQL (chỉ nêu cột/constraint); log `warn`.
- `common/` không import `modules/`; mã lỗi mới thuộc nhóm `common` (9xxx, cạnh 9001/9002 của guard).
- Dùng ở: product (slug, sku; sinh `sku` tự động cũng bắt), collection, category (thay phép ánh xạ cũ bằng theo constraint), wishlist, cart, auth.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Giải quyết vấn đề gì | Cái giá phải trả |
|---|---|---|---|
| Hàm tiện ích một điểm đổi | `db-error.util.ts` | 7 chỗ bắt lỗi UNIQUE cùng một mẫu (đủ rule of three) | Một file helper |
| Idempotency (đọc lại sau khi thua) | wishlist, cart, auth | Thao tác lặp/đồng thời cho cùng kết quả | Một truy vấn thêm trong nhánh hiếm |
| Filter (Nest) làm lưới cuối | `AllExceptionFilter` | Lỗi toàn vẹn mới nào cũng không thành 500 | Mã lỗi chung, kém thông tin hơn mã riêng |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Helper chỉ biết lỗi DB; service biết mã nghiệp vụ |
| O | ✔ | Thêm ràng buộc = thêm một dòng trong bảng ánh xạ |
| L / I | n.a. | |
| D | ✔ | Service không phụ thuộc `pg`, chỉ helper đọc cấu trúc lỗi |

### 3.5 Dữ liệu

Không đổi (không migration).

### 3.6 API / contract

Mã lỗi mới `9101 DB_NOT_NULL_VIOLATION`, `9102 DB_CHECK_VIOLATION` (HTTP 400), `9103 DB_UNIQUE_VIOLATION`, `9104 DB_FOREIGN_KEY_VIOLATION` (HTTP 409). Các route trên: cuộc đua cho kết quả đúng thay vì 500; wishlist/cart/auth thành công như thao tác lặp.

### 3.7 Luồng xử lý, transaction, lock

- Wishlist `add`: nếu `save` ném `UQ_wishlists_user_product` → đọc lại bản ghi, trả `created: false`.
- Cart `getOrCreateCart`: nếu tạo ném `UQ_carts_user` → đọc lại giỏ. `addItem`: nếu tạo dòng ném `UQ_cart_items_unique` → thử lại một lần từ bước tìm dòng (lúc đó thấy dòng, cộng dồn).
- Auth `googleLogin` lần đầu: nếu tạo ném `UQ_users_email` → đọc lại user và đi tiếp nhánh cập nhật.
- Product `create`/`update`, collection `create`/`update`, category: ánh xạ constraint → mã nghiệp vụ.
- Không đổi thứ tự khoá nào; không thao tác nào ở đây nằm trong luồng tiền.

### 3.8 Lỗi & trường hợp biên

| Tình huống | Hành vi mong đợi |
|---|---|
| Hai `POST` sản phẩm cùng slug đồng thời | một 201, một 400 / 1002 |
| `sku` tự sinh trùng `sku` có sẵn | 400 / 1003 |
| Hai lần bấm yêu thích đồng thời | cả hai 201, `created` đúng một `true` |
| Hai lần thêm giỏ đồng thời cho cùng dòng | cả hai 201, số lượng cộng dồn đúng |
| Hai lần đăng nhập lần đầu đồng thời | cả hai 201, một user |
| Vi phạm toàn vẹn chưa được ánh xạ riêng | 4xx với mã 91xx, có log |

## 4. Kế hoạch test

| Tầng | Case | Vị trí file |
|---|---|---|
| Unit | `dbError`, `throwOnConstraint` (đúng/sai constraint, lỗi không phải DB); nhánh filter cho 23502/23505/23514/23503 và 500 cho lỗi khác | `src/common/base/db-error.util.spec.ts`, `src/common/filter/exception.filter.spec.ts` |
| Flow (Postgres thật) | các cuộc đua ở 3.8 (song song bằng `Promise.all`), `sku` tự sinh trùng, category 1102 vs 1103 theo constraint | `test/flows/{product,collection,wishlist,cart,auth,category}/*.flow.ts` |
| Phá thử | bỏ ánh xạ ở từng chỗ → flow đỏ | thủ công |

## 5. Rủi ro & rollback

Rủi ro thấp: chỉ thêm nhánh bắt lỗi; lưới ở filter chỉ đổi 500 thành 4xx cho lỗi vi phạm dữ liệu. Rollback: `git revert`.

## 6. Kết quả triển khai

_Điền sau khi làm xong._
