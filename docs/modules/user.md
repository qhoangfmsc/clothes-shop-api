# user (`src/modules/user`)

> Cập nhật lần cuối: 2026-10-12

## 1. Tổng quan

Chứa entity `User` (bảng `users`) mà mọi module khác tham chiếu, và API quản trị người dùng cho admin: xem danh sách/chi tiết, đổi role, trạng thái, permissions.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/user` |
| Route prefix | `/api/admin/users` |
| Bảng DB | `users` |
| Module phụ thuộc | không |
| Export | `TypeOrmModule` (repository `User`), `UserService` |

## 2. Mục đích & nghiệp vụ phục vụ

- Lưu danh tính khách và admin (tạo tự động khi đăng nhập Google — xem [auth](auth.md)).
- Admin cần tra cứu người dùng, khoá/mở tài khoản, nâng/hạ role, cấp permission chi tiết cho từng user.
- Là nơi lưu `role` và `permissions` mà `PermissionsGuard` đọc.

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Admin users | `admin-user.controller.ts` | `/api/admin/users` | JWT + permission | Danh sách (search/filter/sort/phân trang), chi tiết, cập nhật role/status/permissions |

Không có endpoint tạo/xoá user (user chỉ được tạo qua đăng nhập Google).

## 4. Chi tiết

### 4.1 API

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/admin/users` | `USER_ADMIN_VIEW` | Danh sách người dùng |
| GET | `/api/admin/users/:id` | `USER_ADMIN_VIEW` | Chi tiết 1 user |
| PATCH | `/api/admin/users/:id` | `USER_ADMIN_UPDATE` | Cập nhật `role`, `status`, `permissions` |

**GET list** — `AdminUserQueryDto` (extends `PaginationQueryDto`: `page`, `limit`):

| Param | Kiểu | Ràng buộc |
|---|---|---|
| `search` | string | ≤ 255; tìm `ILIKE %…%` trên `name`, `email` |
| `role` | string | `IsIn(USER_ROLES)` = `user`, `admin` |
| `status` | string | `IsIn(ACTIVE_STATUSES)` = `active`, `disabled` |
| `sort` | string | whitelist `name`, `email`, `createdAt` (+ dạng `-field`); mặc định `-createdAt` |

Response `paginated(...)`: mỗi phần tử `{ id, email, name, image, provider, role, permissions, status, createdAt, updatedAt }` (không trả `password`, `providerId`).

**GET `:id`** → `{ data: {...cùng các field trên} }`. Không thấy → `404` với `errorCode 1401`.

**PATCH `:id`** — `UpdateUserDto` (mọi field optional):

| Field | Ràng buộc |
|---|---|
| `role` | `IsString`, `IsIn(USER_ROLES)`, `MaxLength(20)` |
| `status` | `IsString`, `IsIn(ACTIVE_STATUSES)`, `MaxLength(20)` |
| `permissions` | `IsArray`, `IsInt({ each: true })` — mảng mã permission |

Response `{ data: {...user} }`.

### 4.2 Dữ liệu

Bảng `users` (entity `User extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `email` | varchar(255) | NOT NULL, UNIQUE (`UQ_users_email`) |
| `password` | varchar(255) | nullable (hiện không dùng, đăng nhập bằng Google) |
| `name` | varchar(255) | nullable |
| `image` | varchar(500) | nullable |
| `provider` | varchar(50) | nullable (`google`) |
| `provider_id` | varchar(255) | nullable (Google `sub`) |
| `role` | varchar(20) | default `user`; `CK_users_role` ∈ (`user`,`admin`) |
| `permissions` | jsonb | NOT NULL default `[]` |
| `status` | varchar(20) | default `active`; `CK_users_status` ∈ (`active`,`disabled`) |
| `created_at`, `updated_at` | timestamptz | |

Các bảng khác trỏ tới `users`: `addresses`, `wishlists`, `carts` (ON DELETE CASCADE), `orders`, `reviews` (ON DELETE SET NULL).

### 4.3 Validation (3 tầng)

- **DTO**: enum `role`/`status` dùng hằng chung `USER_ROLES`/`ACTIVE_STATUSES`; `permissions` là mảng số nguyên; query list whitelist sort và enum filter.
- **Service**: user phải tồn tại; admin không được tự sửa `role` hoặc `status` của chính mình (xem 4.4).
- **DB**: `UQ_users_email`, `CK_users_role`, `CK_users_status`.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

- **findAll**: `search` tạo điều kiện OR giữa `name` và `email`, mỗi nhánh kèm filter `role`/`status`; sort bằng `parseSort(sort, '-createdAt')`; phân trang `getPaging`.
- **update**: nếu `id` trùng `currentUser.id` và payload có `role` hoặc `status` → `USER_CANNOT_MODIFY_SELF`. Chỉ field có trong payload mới được ghi. Việc sửa `permissions` của chính mình không bị chặn.
- Giá trị mới của `role`/`permissions` có hiệu lực ngay ở request kế tiếp vì `JwtStrategy` nạp user từ DB mỗi request.

### 4.5 Error code

| Code | Tên | Khi nào |
|---|---|---|
| 1402 | `EUserErrorCode.USER_CANNOT_MODIFY_SELF` | Admin tự sửa `role`/`status` của mình (HTTP 400) |
| 1401 | `EUserErrorCode.USER_NOT_FOUND` | User không tồn tại (`findOne`, `update`) — HTTP 404 |

### 4.6 Phụ thuộc & cấu hình

Không phụ thuộc module khác. Được import bởi nhiều module khác qua `TypeOrmModule.forFeature([User])` hoặc import trực tiếp entity.

### 4.7 Test

Chưa có test riêng. `AdminUserQueryDto` được `list-query.dto.spec.ts` kiểm tra tự động.

### 4.8 Lưu ý hiện trạng

- Vì danh sách permission lưu theo từng user, user được tạo trước khi có permission mới sẽ không tự có permission đó; admin cần cập nhật qua `PATCH`.
- Không có endpoint xoá user; FK từ `orders`/`reviews` đặt `SET NULL`, từ `carts`/`addresses`/`wishlists` đặt `CASCADE` (đã sẵn ở DB).
