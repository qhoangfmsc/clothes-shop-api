# 0001 — Kế hoạch flow test cho module pending-count

> Module: `pending-count` · Trạng thái: Implemented · Ngày: 2026-10-23 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Chiến dịch test toàn diện (`test/PROGRESS.md`, skill `test-campaign`) phủ ca thành công và ca lỗi cho từng route. `GET /api/admin/pending-counts` (batch 24) gộp số liệu của bốn module và phải luôn bằng `total` của các danh sách đã lọc; docs ghi việc khớp số trên Postgres thật chưa có test tự động.

## 2. Mục tiêu & ngoài phạm vi

Chứng minh bằng dữ liệu thật rằng từng số khớp danh sách tương ứng, giảm khi xử lý xong, và key theo quyền. Ngoài phạm vi: đổi hành vi.

## 3. Thiết kế (batch)

3.3/3.4: không thêm pattern; dùng lại các step của flow order-payment và return để dựng việc chờ.

| Batch | Route | Flow |
|---|---|---|
| 24 | `GET /api/admin/pending-counts` | `test/flows/pending-count/pending-count.flow.ts` |

## 4. Kế hoạch test

Theo skill `test-campaign`; phá thử các điểm quyền theo key và việc bỏ key khi bằng 0.

## 5. Rủi ro & rollback

`git revert` commit của batch.

## 6. Kết quả triển khai

- 6 flow test. Phá thử 4 điểm của pending-count đều bị bắt. Route chỉ có lỗi của guard nên `exempt` ca lỗi.
- **Docs:** `pending-count.md` (4.7), `test/README.md`, `test/PROGRESS.md`.
