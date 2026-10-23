# 0002 — Chỉ nhận mã permission có thật

> Module: `user` · Trạng thái: Approved · Ngày: 2026-10-23 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

`PATCH /api/admin/users/:id` nhận `permissions` là mọi mảng số nguyên: mã không có trong enum `Permission` (vd `99999`) và mã trùng được lưu. Quyền lạ vô nghĩa nhưng làm hỏng dữ liệu phân quyền (khó audit, sau này một mã mới trùng số sẽ tự cấp quyền ngoài ý muốn). Các hệ thống phân quyền (Keycloak, Casbin…) kiểm theo registry khi gán.

## 2. Mục tiêu & ngoài phạm vi

- `permissions` chỉ nhận mã thuộc enum `Permission`, không trùng; sai → 400 (validation).
- Ngoài phạm vi: dọn mã lạ đã lưu từ trước; đổi cách lưu quyền.

## 3. Thiết kế

`UpdateUserDto.permissions`: thêm `@IsIn(PERMISSION_CODES, { each: true })` và `@ArrayUnique()`, với `PERMISSION_CODES` suy từ enum (chỉ giá trị số) đặt cạnh enum trong `permissions.constant.ts`. 3.3: không pattern mới. 3.4: S ✔, O ✔ (thêm quyền vào enum là tự hợp lệ).

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Flow | mã lạ, mã trùng, mã đúng → 400/400/200; mảng rỗng vẫn hợp lệ (thu hồi hết quyền) | `test/flows/user/user.flow.ts` |

## 5. Rủi ro & rollback

Thấp. Rollback: `git revert`.

## 6. Kết quả triển khai

_Điền sau khi làm xong._
