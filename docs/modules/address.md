# address (`src/modules/address`)

> Cập nhật lần cuối: 2026-10-12

## 1. Tổng quan

Module sổ địa chỉ giao hàng của người dùng đã đăng nhập: danh sách, thêm, sửa, xoá, và đánh dấu địa chỉ mặc định.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/address` |
| Route prefix | `/api/addresses` |
| Bảng DB | `addresses` |
| Module phụ thuộc | không |
| Export | `AddressService` |

## 2. Mục đích & nghiệp vụ phục vụ

Khách lưu nhiều địa chỉ nhận hàng và chọn một địa chỉ khi checkout (module [order](order.md) nhận `addressId`, sao chép nội dung địa chỉ vào đơn hàng). Mọi thao tác luôn gắn với `user.id` lấy từ token.

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Address | `address.controller.ts` | `/api/addresses` | JWT + permission | List, create, update, delete |

## 4. Chi tiết

### 4.1 API

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/addresses` | `ADDRESS_VIEW` | Danh sách địa chỉ của user |
| POST | `/api/addresses` | `ADDRESS_CREATE` | Tạo địa chỉ |
| PATCH | `/api/addresses/:id` | `ADDRESS_UPDATE` | Cập nhật địa chỉ |
| DELETE | `/api/addresses/:id` | `ADDRESS_DELETE` | Xoá địa chỉ |

**POST** — `CreateAddressDto`:

| Field | Bắt buộc | Ràng buộc |
|---|---|---|
| `label` | | string ≤ 100 |
| `fullName` | ✔ | string, not empty, ≤ 255 |
| `phone` | ✔ | string, not empty, ≤ 50 |
| `addressLine1` | ✔ | string, not empty, ≤ 500 |
| `addressLine2` | | string ≤ 500 |
| `city` | ✔ | string, not empty, ≤ 255 |
| `province` | | string ≤ 255 |
| `postalCode` | | string ≤ 20 |
| `country` | | string ≤ 100 (mặc định DB `Vietnam`) |
| `isDefault` | | boolean (mặc định `false`) |

**PATCH** — `UpdateAddressDto`: cùng các field, tất cả optional.

Response: `GET` → `{ data: Address[], total }` (không phân trang; mặc định trước, rồi mới nhất trước); `POST`/`PATCH` → `{ data: Address }`; `DELETE` → `{ success: true }`.

### 4.2 Dữ liệu

Bảng `addresses` (entity `Address extends BaseEntity`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | varchar(16) PK | nanoid16 |
| `user_id` | varchar(16) | FK → `users(id)` ON DELETE CASCADE; index `IDX_addresses_user_id` |
| `label` | varchar(100) | default `''` |
| `full_name` | varchar(255) | |
| `phone` | varchar(50) | |
| `address_line_1` | varchar(500) | |
| `address_line_2` | varchar(500) | default `''` |
| `city` | varchar(255) | |
| `province` | varchar(255) | default `''` |
| `postal_code` | varchar(20) | default `''` |
| `country` | varchar(100) | default `Vietnam` |
| `is_default` | boolean | default `false` |
| `created_at`, `updated_at` | timestamptz | |

### 4.3 Validation (3 tầng)

- **DTO**: như 4.1.
- **Service**: địa chỉ cần sửa/xoá phải thuộc `user.id` hiện tại, nếu không `404 Address not found`.
- **DB**: FK `user_id` CASCADE, NOT NULL các cột bắt buộc.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

- `create` / `update` với `isDefault = true`: trước hết bỏ cờ mặc định của mọi địa chỉ khác của user (`UPDATE ... SET is_default = false WHERE user_id AND is_default = true`), sau đó lưu.
- `findAll`: sắp `isDefault DESC`, `createdAt DESC`.
- `update`: gộp payload vào bản ghi hiện có bằng `Object.assign`.
- `remove`: xoá hẳn bản ghi.

### 4.5 Error code

Không có error code riêng; không tìm thấy địa chỉ ném `NotFoundException('Address not found')` (HTTP 404).

### 4.6 Phụ thuộc & cấu hình

`TypeOrmModule.forFeature([Address])`. Không có biến môi trường. Module `order` đọc entity `Address` trực tiếp trong transaction checkout.

### 4.7 Test

Chưa có test.

### 4.8 Lưu ý hiện trạng

- Thao tác đổi cờ mặc định không nằm trong transaction.
- Địa chỉ đầu tiên không tự động là mặc định; xoá địa chỉ mặc định không tự chọn địa chỉ khác làm mặc định.
- Không giới hạn số địa chỉ của mỗi user và không kiểm tra định dạng số điện thoại.
- Sửa/xoá địa chỉ không ảnh hưởng đơn hàng đã tạo, vì đơn lưu bản sao địa chỉ.
