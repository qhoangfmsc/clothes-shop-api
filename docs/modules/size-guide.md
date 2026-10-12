# size-guide (`src/modules/size-guide`)

> Cập nhật lần cuối: 2026-10-12

## 1. Tổng quan

Module cung cấp bảng hướng dẫn chọn size theo danh mục. Dữ liệu tĩnh nằm trong controller, không có bảng DB, không có service.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/size-guide` |
| Route prefix | `/api/size-guides` |
| Bảng DB | không có — dữ liệu tĩnh |
| Module phụ thuộc | không |
| Export | không |

## 2. Mục đích & nghiệp vụ phục vụ

Cho trang chi tiết sản phẩm hiển thị bảng size (số đo, mẹo đo) theo nhóm hàng.

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| Size guide | `size-guide.controller.ts` | `/api/size-guides` | `@Public()` | Lấy bảng size theo `category` |

## 4. Chi tiết

### 4.1 API

| Method | Path | Truy cập | Mô tả |
|---|---|---|---|
| GET | `/api/size-guides/:category` | Public | Bảng size của một nhóm |

Response `{ data: SizeGuide }` hoặc `{ data: null }` nếu `category` không có (HTTP 200, không báo lỗi).

`SizeGuide`: `{ category, title, description, unit: 'cm', columns[], rows[], tips[] }`. Các nhóm hiện có:

| `category` | Cột | Số dòng size |
|---|---|---|
| `tops` | Size, Bust, Waist, Length | 5 (XS–XL) |
| `skirts` | Size, Waist, Hips, Length | 5 (XS–XL) |
| `bags` | Size, Width, Height, Depth | 4 (Mini, Small, Medium, Large) |
| `jewelry` | Size, Circumference | 5 (size nhẫn 5–9) |

Mỗi nhóm có `tips[]` (3 gợi ý đo/chọn size). Mỗi dòng trong `rows` là object theo tên cột viết thường (`size`, `bust`, `waist`, `length`, `hips`, `width`, `height`, `depth`, `circumference`); giá trị là chuỗi (khoảng như `"80-84"` hoặc số đơn).

### 4.2 Dữ liệu

Không có bảng. Hằng số `SIZE_GUIDES: Record<string, any>` trong `size-guide.controller.ts`; khoá trùng với slug của 4 category seed (`tops`, `skirts`, `bags`, `jewelry`).

### 4.3 Validation (3 tầng)

Chỉ có path param `category` (string, không validate); không có DTO, service hay DB.

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

Tra khoá `category` trong hằng số; có thì trả, không có thì trả `{ data: null }`.

### 4.5 Error code

Không có.

### 4.6 Phụ thuộc & cấu hình

Không có.

### 4.7 Test

Chưa có test.

### 4.8 Lưu ý hiện trạng

- Bảng size không liên kết với `sizes` của sản phẩm hay với bảng `categories`; khoá `category` chỉ là chuỗi so khớp tên.
- Category tạo thêm từ admin sẽ không có bảng size nếu không thêm vào hằng số trong controller.
- Controller không có kiểu dữ liệu cho `SizeGuide` (dùng `any`).
