# 0001 — Kế hoạch flow test cho module wishlist

> Module: `wishlist` · Trạng thái: Implemented · Ngày: 2026-10-23 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Chiến dịch test toàn diện (`test/PROGRESS.md`, skill `test-campaign`) phủ ca thành công và ca lỗi cho từng route. Module wishlist có 4 route (batch 19), hành vi idempotent (thêm lại, bỏ thứ không có) và ràng buộc UNIQUE `(user_id, product_id)` mà unit test với DB giả không kiểm chứng được.

## 2. Mục tiêu & ngoài phạm vi

Mỗi route wishlist có ca thành công và ca lỗi nghiệp vụ trên Postgres thật; ba route không có ca lỗi nghiệp vụ được ghi `exempt` kèm lý do. Ngoài phạm vi: đổi hành vi (lỗi 500 khi thêm đồng thời được ghi ở `test/PROGRESS.md` và `wishlist.md` 4.8).

## 3. Thiết kế (batch)

3.3/3.4: không thêm pattern.

| Batch | Route | Flow |
|---|---|---|
| 19 | `GET /api/wishlist`, `DELETE /api/wishlist/:productId`, `POST /api/wishlist/:productId`, `GET /api/wishlist/check/:productId` | `test/flows/wishlist/wishlist.flow.ts` |

## 4. Kế hoạch test

Theo skill `test-campaign`; phá thử các điểm sở hữu, idempotent và trình bày sản phẩm.

## 5. Rủi ro & rollback

`git revert` commit của batch.

## 6. Kết quả triển khai

- 12 flow test. Phá thử 8 điểm đều bị bắt. 1 phát hiện cần quyết định: thêm đồng thời cùng sản phẩm trả 500.
- **Tổng module:** 4/4 route wishlist đủ ca (3 route `exempt` ca lỗi). Độ phủ toàn cục sau batch 19: thành công 79/98, lỗi 71/89, baseline 21 route.
- **Docs:** `wishlist.md` (4.7, 4.8), `test/README.md`, `test/PROGRESS.md`.
