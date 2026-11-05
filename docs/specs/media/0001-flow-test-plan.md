# 0001 — Kế hoạch flow test cho module media

> Module: `media` · Trạng thái: Implemented · Ngày: 2026-10-23 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Chiến dịch test toàn diện (`test/PROGRESS.md`, skill `test-campaign`) phủ ca thành công và ca lỗi cho từng route. Module media có 4 route admin (batch 24) và gọi ra Supabase Storage; trước đó chỉ có unit test với mock. Đường ảnh `REVIEW` của khách đã được phủ ở flow review (batch 10).

## 2. Mục tiêu & ngoài phạm vi

Mỗi route media có ca thành công và ca lỗi nghiệp vụ trên Postgres thật, với Storage là biên ngoài duy nhất được giả. Ngoài phạm vi: đổi hành vi.

## 3. Thiết kế (batch)

3.3/3.4: không thêm pattern. Giả biên ngoài bằng `jest.spyOn(globalThis, 'fetch')` (đúng luật `testing.md`); không giả `MediaService`.

| Batch | Route | Flow |
|---|---|---|
| 24 | `GET /api/admin/media`, `POST /api/admin/media`, `DELETE /api/admin/media/:fileId`, `GET /api/admin/media/ping` | `test/flows/media/media.flow.ts` |

## 4. Kế hoạch test

Theo skill `test-campaign`; phá thử các điểm lọc `LIBRARY`, thứ tự xoá storage–DB, nhận diện loại ảnh theo byte và ánh xạ lỗi storage.

## 5. Rủi ro & rollback

`git revert` commit của batch.

## 6. Kết quả triển khai

- 25 flow test. Phá thử 11 điểm của media đều bị bắt. Không có phát hiện cần quyết định.
- **Tổng module:** 4/4 route media đủ ca.
- **Docs:** `media.md` (4.7), `test/README.md`, `test/PROGRESS.md`.
