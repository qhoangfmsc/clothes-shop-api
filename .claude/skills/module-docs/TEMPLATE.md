# <Tên module> (`src/modules/<folder>`)

> Cập nhật lần cuối: YYYY-MM-DD

## 1. Tổng quan

<2–4 câu: module là gì, nằm ở đâu trong hệ thống, dữ liệu nằm ở bảng nào hay là dữ liệu tĩnh.>

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/<folder>` |
| Route prefix | `/api/...` |
| Bảng DB | `<table>` (hoặc "không có — dữ liệu tĩnh") |
| Module phụ thuộc | <module khác / dịch vụ ngoài> |
| Export | <service/entity module này export cho module khác> |

## 2. Mục đích & nghiệp vụ phục vụ

<Module giải quyết việc gì, ai dùng (khách / admin), phục vụ luồng nghiệp vụ nào. Chỉ viết những gì code đang làm.>

## 3. Submodule & chức năng

| Submodule | Controller | Route prefix | Truy cập | Chức năng |
|---|---|---|---|---|
| <Public / Admin / ...> | `xxx.controller.ts` | `/api/...` | Public / JWT / permission | <liệt kê ngắn> |

## 4. Chi tiết

### 4.1 API

| Method | Path | Truy cập | Mô tả |
|---|---|---|---|
| GET | `/api/...` | Public | ... |

Với từng endpoint cần nói rõ: query/body (field, kiểu, ràng buộc), shape response, lỗi có thể trả.

### 4.2 Dữ liệu

<Entity → bảng, cột, kiểu, nullable/default, quan hệ + ON DELETE, UNIQUE / CHECK / INDEX (lấy từ migration, không đoán).>

### 4.3 Validation (3 tầng)

- **DTO**: ...
- **Service**: ...
- **DB**: ...

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

<Từng luồng quan trọng theo thứ tự bước thực tế trong service: tính toán, transaction, state transition, side effect.>

### 4.5 Error code

| Code | Tên | Khi nào |
|---|---|---|
| 1xxx | `E...ErrorCode.X` | ... |

<Ghi rõ code nào đã khai báo nhưng service chưa dùng, và chỗ nào đang ném lỗi HTTP thô (`NotFoundException`...) thay vì `throwAppError`.>

### 4.6 Phụ thuộc & cấu hình

<Module khác import, biến môi trường, dịch vụ ngoài.>

### 4.7 Test

<File spec nào đang cover gì; "Chưa có test" nếu không có.>

### 4.8 Lưu ý hiện trạng

<Hành vi đặc biệt / điểm lệch chuẩn đang tồn tại trong code. Chỉ nêu sự thật, không đề xuất kế hoạch.>
