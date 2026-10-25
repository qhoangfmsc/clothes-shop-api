# 0012 — Cell phụ thuộc cell: khai báo tường minh, không vòng

> Module: `common` (quy ước kiến trúc) · Trạng thái: Approved · Ngày: 2026-10-25 · Bổ sung cho 0011

## 1. Bối cảnh & vấn đề

Quy tắc của 0011 ("cell chỉ import chính nó và `shared/`") gặp trường hợp thật ở `order`: sau khi đổi trạng thái, `OrderStatusService` trả chi tiết đơn qua `OrderQueryService` (đọc-sau-ghi, thiết kế từ order/0002). Hai service nằm ở hai cell khác nhau (`status/`, `query/`) và DI buộc phải import file class. Bỏ đường đọc-sau-ghi thì phải sao chép logic dựng view, trái nguyên tắc DRY ở chỗ nó đáng; đưa `OrderQueryService` vào `shared/` thì `shared/` chứa use case, không còn là nơi chứa dữ liệu dùng chung.

## 2. Mục tiêu & ngoài phạm vi

- Cho phép phụ thuộc cell → cell **khi được khai báo**, để cây phụ thuộc giữa các cell nhìn thấy ở một chỗ và bị máy ép không vòng.
- Ngoài phạm vi: đổi hành vi; cho phép import ngầm.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Bảng `CELL_DEPENDENCIES` trong `architecture-allowlist.test-utils.ts`: module → cell → các cell được import; test kiểm đồ thị không vòng và cạnh khai báo phải thật sự được dùng | Phụ thuộc giữa cell đọc được ở một nơi; thêm cạnh phải qua review | Thêm một bảng cấu hình |
| B. Cho import tự do giữa cell | Đơn giản | Mất ý nghĩa của cell, dễ thành mạng nhện |
| C. Chuyển service dùng chung sang `shared/` | Không cần bảng | `shared/` thành nơi chứa use case |

**Chọn A**.

### 3.2 Kiến trúc & ranh giới

`CELL_DEPENDENCIES: Record<module, Record<cell, readonly cell[]>>`. Test:
1. File trong cell chỉ import chính nó, `shared/` và các cell khai báo cho cell đó; `shared/` không import cell.
2. Đồ thị cạnh khai báo của mỗi module không có vòng.
3. Mỗi cạnh khai báo phải được dùng ít nhất một import thật (chống cạnh chết).

### 3.3 Design pattern áp dụng

Không dùng pattern; bảng cấu hình + test. Cái giá: thêm cạnh phải sửa bảng (có chủ ý).

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| D | ✔ | Cạnh phụ thuộc đi một chiều và công khai |
| S / O / L / I | n.a. | |

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Không đổi.

## 4. Kế hoạch test

Test kiến trúc cũ (một vi phạm thật bắt được ở payment) mở rộng; thêm hai nhánh (không vòng, không cạnh chết). Thử phá: khai báo cạnh thừa → đỏ; thêm import ngoài khai báo → đỏ.

## 5. Rủi ro & rollback

Thấp. Rollback: `git revert`.

## 6. Kết quả triển khai

_Điền sau khi làm xong._
