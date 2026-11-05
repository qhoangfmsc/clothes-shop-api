# 0001 — Kế hoạch flow test cho module address

> Module: `address` · Trạng thái: Implemented · Ngày: 2026-10-23 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Chiến dịch test toàn diện (`test/PROGRESS.md`, skill `test-campaign`) phủ ca thành công và ca lỗi cho từng route. Module address có 4 route (batch 18); trước đó chỉ có ca lỗi 2101 (`address-errors.flow.ts`), các đường thành công và việc giữ đúng một địa chỉ mặc định chưa có test.

## 2. Mục tiêu & ngoài phạm vi

Mỗi route address có ≥ 1 ca thành công và ≥ 1 ca lỗi nghiệp vụ trên Postgres thật (`GET /api/addresses` không có input nên `exempt` ca lỗi). Ngoài phạm vi: đổi hành vi (khoảng trống validation của `PATCH` được ghi ở `test/PROGRESS.md` và `address.md` 4.8).

## 3. Thiết kế (batch)

3.3/3.4: không thêm pattern.

| Batch | Route | Flow |
|---|---|---|
| 18 | `GET /api/addresses`, `POST /api/addresses`, `DELETE /api/addresses/:id`, `PATCH /api/addresses/:id` | `test/flows/address/address.flow.ts` (+ `address-errors.flow.ts`) |

## 4. Kế hoạch test

Theo skill `test-campaign`; phá thử các điểm sở hữu, thứ tự danh sách và cờ mặc định.

## 5. Rủi ro & rollback

`git revert` commit của batch.

## 6. Kết quả triển khai

- 40 flow test. Phá thử 8 điểm: 7 bị bắt; 1 mutant tương đương (chủ sở hữu lấy từ body, DTO đã cấm `userId`).
- 1 phát hiện cần quyết định: `PATCH` nhận chuỗi rỗng và response thiếu field không gửi.
- **Tổng module:** 4/4 route address có ca thành công và ca lỗi (hoặc `exempt`) trên Postgres thật. Độ phủ toàn cục sau batch 18: thành công 76/98, lỗi 70/92, baseline 25 route.
- **Docs:** `address.md` (4.7, 4.8), `test/README.md`, `test/PROGRESS.md`.
