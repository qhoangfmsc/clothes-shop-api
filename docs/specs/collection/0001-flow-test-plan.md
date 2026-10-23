# 0001 — Kế hoạch flow test cho module collection

> Module: `collection` · Trạng thái: Implemented · Ngày: 2026-10-23 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Chiến dịch test toàn diện (`test/PROGRESS.md`, skill `test-campaign`) phủ ca thành công và ca lỗi cho từng route. Module collection có 5 route (batch 17), quan hệ nhiều-nhiều với sản phẩm và phân trang hai bước (trang trên `collections`, rồi nạp `products`) mà unit test với DB giả không kiểm chứng được.

## 2. Mục tiêu & ngoài phạm vi

Mỗi route collection có ≥ 1 ca thành công và ≥ 1 ca lỗi nghiệp vụ trên Postgres thật. Ngoài phạm vi: đổi hành vi (khoảng trống validation và lỗi 500 tìm thấy được ghi ở `test/PROGRESS.md` và `collection.md` 4.8, test không khẳng định hành vi đó).

## 3. Thiết kế (batch)

3.3/3.4: không thêm pattern; dựng collection qua API admin.

| Batch | Route | Flow |
|---|---|---|
| 17 | `GET /api/collections`, `GET /api/admin/collections`, `POST /api/admin/collections`, `DELETE /api/admin/collections/:id`, `PATCH /api/admin/collections/:id` | `test/flows/collection/collection.flow.ts` |

## 4. Kế hoạch test

Theo skill `test-campaign`; phá thử các điểm tìm kiếm, sort, phân trang hai bước, thay danh sách sản phẩm và kiểm tra trùng slug.

## 5. Rủi ro & rollback

`git revert` commit của batch.

## 6. Kết quả triển khai

- 54 flow test. Phá thử 14 điểm đều bị bắt. 2 phát hiện cần quyết định (`PATCH` nhận chuỗi rỗng và response thiếu field không gửi; đua tạo cùng slug → 500).
- **Tổng module:** 5/5 route collection có ca thành công và ca lỗi nghiệp vụ trên Postgres thật. Độ phủ toàn cục sau batch 17: thành công 72/98, lỗi 69/93, baseline 29 route.
- **Docs:** `collection.md` (4.7, 4.8), `test/README.md`, `test/PROGRESS.md`.
