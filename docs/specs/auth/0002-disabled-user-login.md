# 0002 — Từ chối đăng nhập của user bị khoá

> Module: `auth` · Trạng thái: Approved · Ngày: 2026-10-23 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Test (batch 20) cho thấy `POST /api/auth/google` với user `status = 'disabled'` vẫn trả 201 kèm cả hai token (response `status: 'disabled'`); chỉ request kế tiếp mới bị `JwtStrategy` từ chối 401 và `refresh` trả 2202. Người dùng bị khoá nhận token vô dụng mà không biết vì sao, và hệ thống phát hành token cho tài khoản đã bị thu hồi. Các hệ thống định danh (Auth0 "blocked users", Firebase "disabled user") từ chối ngay lúc đăng nhập với lỗi riêng.

## 2. Mục tiêu & ngoài phạm vi

- Đăng nhập của user `disabled` bị từ chối trước khi phát hành token, mã lỗi riêng `AUTH_USER_DISABLED (2203)`, HTTP 403 (đã xác thực danh tính Google nhưng không được phép vào; 401 dành cho credential sai).
- Không cập nhật hồ sơ (`name`, `image`, `providerId`) của user bị khoá.
- Không đổi `refresh` (vẫn 2202) và `JwtStrategy` (vẫn 401 thô, không `errorCode`).

## 3. Thiết kế

Trong `upsertGoogleUser`: sau khi tìm thấy user theo email, nếu `status !== 'active'` → `throwAppError(AUTH_USER_DISABLED, undefined, 403)` trước `refreshGoogleProfile`. Cả nhánh "thua cuộc đua tạo user" đều đi qua cùng kiểm tra.

3.3: không dùng pattern mới. 3.4: S ✔.

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Flow | user `disabled` → 403 / 2203, không token, hồ sơ không đổi; sau khi admin bật lại thì đăng nhập được | `test/flows/auth/auth.flow.ts` |
| Phá thử | bỏ kiểm tra → flow đỏ | thủ công |

## 5. Rủi ro & rollback

Thấp. Frontend cần xử lý mã 2203 (hiển thị tài khoản bị khoá). Rollback: `git revert`.

## 6. Kết quả triển khai

_Điền sau khi làm xong._
