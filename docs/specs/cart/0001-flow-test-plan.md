# 0001 — Kế hoạch flow test cho module cart

> Module: `cart` · Trạng thái: Implemented · Ngày: 2026-10-22 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Chiến dịch test toàn diện (`test/PROGRESS.md`, skill `test-campaign`) phủ ca thành công và ca lỗi cho từng route. Module cart có 5 route (batch 08). Trước batch 08 chỉ có ca lỗi 2001–2003 (`cart-errors.flow.ts`) và unit test của `addItem` với stub.

## 2. Mục tiêu & ngoài phạm vi

Mỗi route cart có ca thành công và ca lỗi nghiệp vụ trên Postgres thật. Ngoài phạm vi: đổi hành vi (lỗi 500 khi cộng dồn > 99 và khi thêm đồng thời được ghi ở `test/PROGRESS.md` và `cart.md` 4.8, test không khẳng định hành vi đó).

## 3. Thiết kế (batch)

3.3/3.4: không thêm pattern.

| Batch | Route | Flow |
|---|---|---|
| 08 | `GET /api/cart`, `DELETE /api/cart/clear`, `POST /api/cart/items`, `DELETE /api/cart/items/:itemId`, `PATCH /api/cart/items/:itemId` | `test/flows/cart/cart.flow.ts` (+ `cart-errors.flow.ts`) |

`GET /api/cart` và `DELETE /api/cart/clear` không có input nên không có ca lỗi nghiệp vụ: ghi `exempt` kèm lý do trong `test/coverage-baseline.json`.

## 4. Kế hoạch test

Theo skill `test-campaign`; phá thử các điểm tiền và sở hữu.

## 5. Rủi ro & rollback

`git revert` commit của batch.

## 6. Kết quả triển khai

- 32 flow test. Phá thử 6 điểm (cộng dồn, khớp theo size, sở hữu dòng khi sửa, xoá sạch theo giỏ, USD của tổng tính từ tổng VND thay vì tổng USD đã làm tròn, kiểm badge) đều bị bắt.
- 2 phát hiện cần quyết định (cả hai trả 500): cộng dồn vượt 99 vi phạm CHECK ở DB; thêm đồng thời đua UNIQUE.
- **Tổng module:** 5/5 route đủ ca (2 route `exempt` ca lỗi). Độ phủ toàn cục sau batch 08: thành công 36/98, lỗi 36/94, baseline 63 route.
- **Docs:** `cart.md` (4.7, 4.8), `test/README.md`, `test/PROGRESS.md`.
