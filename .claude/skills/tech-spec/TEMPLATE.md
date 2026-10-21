# NNNN — <Tiêu đề ngắn của thay đổi>

> Module: `<module>` · Trạng thái: Draft · Ngày: YYYY-MM-DD
> Trạng thái: Draft → Approved → Implemented (hoặc Superseded bởi NNNN)

## 1. Bối cảnh & vấn đề

<Hiện trạng (đã đọc docs + code), vấn đề cần giải, vì sao làm bây giờ. 3–6 câu.>

## 2. Mục tiêu & ngoài phạm vi

**Mục tiêu**
- ...

**Ngoài phạm vi** (nêu rõ để không trượt phạm vi)
- ...

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. <chọn> | ... | ... |
| B. <loại> | ... | ... |

**Chọn A** vì ...

### 3.2 Kiến trúc & ranh giới

<Code nằm ở đâu (module/lớp nào), phụ thuộc chiều nào, module nào bị chạm. Vẽ sơ đồ ASCII nếu có từ 3 thành phần trở lên.
Kiểm tra: không phụ thuộc vòng, `common/` không import `modules/`, module không với tay vào bảng của module khác nếu đã có service/facade.>

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Giải quyết vấn đề gì | Cái giá phải trả |
|---|---|---|---|
| <tên> | <class/hàm> | <vấn đề cụ thể> | <độ phức tạp thêm> |

<"Không dùng pattern nào" là câu trả lời hợp lệ khi code đơn giản; phải nói lý do. Không thêm pattern chỉ để "đủ bộ".>

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú (class/hàm cụ thể) |
|---|---|---|
| S — một lý do để đổi | ✔/✘ | ... |
| O — mở rộng không sửa code cũ | ✔/✘ | ... |
| L — thay thế được | ✔/✘/n.a. | ... |
| I — interface nhỏ | ✔/✘/n.a. | ... |
| D — phụ thuộc abstraction | ✔/✘ | ... |

<Mục ✘ phải có lý do chấp nhận hoặc kế hoạch xử lý trong chính spec này.>

### 3.5 Dữ liệu

<Entity/cột/migration/constraint (CHECK, FK ON DELETE, UNIQUE, INDEX). "Không đổi" nếu không chạm DB.>

### 3.6 API / contract

<Endpoint, input, output, quyền, error code mới. "Không đổi" nếu không chạm API.>

### 3.7 Luồng xử lý, transaction, lock

<Các bước theo thứ tự; ranh giới transaction; thứ tự khoá (order → attempt…); idempotency; thao tác nào chấp nhận eventual.>

### 3.8 Lỗi & trường hợp biên

| Tình huống | Hành vi mong đợi |
|---|---|
| ... | ... |

## 4. Kế hoạch test

| Tầng | Case | Vị trí file |
|---|---|---|
| Unit | ... | `src/modules/<m>/<x>.spec.ts` |
| Flow (Postgres thật) | ... | `test/flows/<m>/<x>.flow.ts` |
| Ràng buộc DB | ... | cùng file flow |

<Mỗi dòng sẽ trở thành một dòng trong `test/README.md` (test matrix). Luồng chính phải có ít nhất 1 flow test.>

## 5. Rủi ro & rollback

<Rủi ro dữ liệu/tiền/race; cách quay lại (migration down, feature flag, revert).>

## 6. Kết quả triển khai

<Điền SAU khi làm xong, chuyển trạng thái sang Implemented:>
- File đã tạo/sửa: ...
- Khác với thiết kế ở đâu và vì sao: ...
- Docs đã cập nhật: ...
- Test đã thêm/sửa + dòng test matrix: ...
