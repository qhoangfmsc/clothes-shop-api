# 0001 — Kế hoạch flow test cho module auth

> Module: `auth` · Trạng thái: Implemented · Ngày: 2026-10-23 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Chiến dịch test toàn diện (`test/PROGRESS.md`, skill `test-campaign`) phủ ca thành công và ca lỗi cho từng route. Module auth có 4 route (batch 20), là cửa vào của mọi quyền hạn và gọi ra Google. Trước batch 20 chỉ có unit test với mock và ma trận auth (401/403 theo kiểu thăm dò).

## 2. Mục tiêu & ngoài phạm vi

Mỗi route auth có ca thành công và ca lỗi nghiệp vụ trên Postgres thật; `GET /api/auth/me` và `GET /api/auth/permissions` chỉ có lỗi của guard nên `exempt` ca lỗi nghiệp vụ. Ngoài phạm vi: đổi hành vi (các điểm tìm thấy được ghi ở `test/PROGRESS.md` và `auth.md` 4.8).

## 3. Thiết kế (batch)

3.3/3.4: không thêm pattern. Google là biên ngoài duy nhất, được giả bằng `jest.spyOn` trên `OAuth2Client.prototype` (`verifyIdToken`, `getToken`) và `globalThis.fetch` (userinfo); không giả service nội bộ.

| Batch | Route | Flow |
|---|---|---|
| 20 | `POST /api/auth/google`, `GET /api/auth/me`, `GET /api/auth/permissions`, `POST /api/auth/refresh` | `test/flows/auth/auth.flow.ts` |

## 4. Kế hoạch test

Theo skill `test-campaign`; phá thử các điểm phân loại credential, loại token, trạng thái user và giá trị mặc định khi tạo user.

## 5. Rủi ro & rollback

`git revert` commit của batch.

## 6. Kết quả triển khai

- 23 flow test. Phá thử 8 điểm của auth đều bị bắt. 2 phát hiện cần quyết định (đăng nhập lần đầu đồng thời → 500; user bị khoá vẫn đăng nhập được).
- **Tổng module:** 4/4 route auth đủ ca (2 route `exempt` ca lỗi). Độ phủ toàn cục sau batch 21: thành công 86/98, lỗi 76/87, baseline 14 route.
- **Docs:** `auth.md` (4.7/4.8), `test/README.md`, `test/PROGRESS.md`.
