# 0001 — Kế hoạch flow test cho module user

> Module: `user` · Trạng thái: Implemented · Ngày: 2026-10-23 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Chiến dịch test toàn diện (`test/PROGRESS.md`, skill `test-campaign`) phủ ca thành công và ca lỗi cho từng route. Module user có 3 route admin (batch 20–21); thay đổi `role`/`status`/`permissions` phải có hiệu lực ngay vì `JwtStrategy` đọc user từ DB mỗi request, điều mà chỉ test trên Postgres thật với HTTP đầy đủ mới chứng minh được.

## 2. Mục tiêu & ngoài phạm vi

Mỗi route user có ≥ 1 ca thành công và ≥ 1 ca lỗi nghiệp vụ, kể cả hiệu lực tức thời của thay đổi quyền. Ngoài phạm vi: đổi hành vi (mã permission lạ được ghi ở `test/PROGRESS.md` và `user.md` 4.8).

## 3. Thiết kế (batch)

3.3/3.4: không thêm pattern.

| Batch | Route | Flow |
|---|---|---|
| 20 | `GET /api/admin/users` | `test/flows/user/user.flow.ts` |
| 21 | `GET /api/admin/users/:id`, `PATCH /api/admin/users/:id` | `test/flows/user/user.flow.ts` |

## 4. Kế hoạch test

Theo skill `test-campaign`; phá thử các điểm lọc/tìm, ghi từng field và chặn tự sửa.

## 5. Rủi ro & rollback

`git revert` commit của batch.

## 6. Kết quả triển khai

- 26 flow test. Phá thử 7 điểm của user đều bị bắt. 1 phát hiện cần quyết định (`permissions` nhận mã lạ).
- **Tổng module:** 3/3 route user có ca thành công và ca lỗi nghiệp vụ trên Postgres thật.
- **Docs:** `user.md` (4.7/4.8), `test/README.md`, `test/PROGRESS.md`.
