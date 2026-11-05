# 0001 — Kế hoạch flow test cho module product

> Module: `product` · Trạng thái: Implemented · Ngày: 2026-10-23 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Chiến dịch test toàn diện (`test/PROGRESS.md`, skill `test-campaign`) phủ ca thành công và ca lỗi cho từng route. Module product có 7 route (batch 13–14) và là nguồn của bộ lọc/sort catalog (QueryBuilder với `EXISTS` trên jsonb, `NULLS LAST`) mà unit test với DB giả không kiểm chứng được. Trước batch 13 chỉ có unit test cho presenter và vài nhánh service.

## 2. Mục tiêu & ngoài phạm vi

Mỗi route product có ≥ 1 ca thành công và ≥ 1 ca lỗi nghiệp vụ trên Postgres thật. Ngoài phạm vi: đổi hành vi (các lỗi 500 và khoảng trống validation tìm thấy được ghi ở `test/PROGRESS.md` và `product.md` 4.8, test không khẳng định hành vi đó).

## 3. Thiết kế (batch)

3.3/3.4: không thêm pattern; builder `b.product()` đã nhận ghi đè `category`/`subcategory`/`createdAt`/`ratingAverage`.

| Batch | Route | Flow |
|---|---|---|
| 13 | `GET /api/products`, `GET /api/products/:id`, `GET /api/products/autocomplete`, `GET /api/admin/products`, `POST /api/admin/products` | `test/flows/product/product-read.flow.ts`, `test/flows/product/product-admin.flow.ts` |
| 14 | `DELETE /api/admin/products/:id`, `PATCH /api/admin/products/:id` | `test/flows/product/product-admin.flow.ts` |

## 4. Kế hoạch test

Theo skill `test-campaign`; phá thử các điểm lọc, sort, biên giá và kiểm tra tạo.

## 5. Rủi ro & rollback

`git revert` commit của batch.

## 6. Kết quả triển khai

- **Batch 14:** 31 flow test. Phá thử 10 điểm đều bị bắt. 2 phát hiện về `PATCH` (response thiếu field không gửi; SKU `…-undefined` khi đổi danh mục không kèm `slug`), cùng một nguyên nhân gốc.
- **Tổng module:** 7/7 route product có ca thành công và ca lỗi trên Postgres thật; 5 phát hiện cần quyết định (xem `test/PROGRESS.md`). Độ phủ toàn cục sau batch 14: thành công 61/98, lỗi 58/93, baseline 40 route.
- **Docs:** `product.md` (4.7, 4.8), `test/README.md`, `test/PROGRESS.md`.
- **Batch 13:** 85 flow test. Phá thử 18 điểm đều bị bắt (1 điểm lọt lúc đầu rồi đã bịt). 3 phát hiện cần quyết định (500 khi tạo đồng thời, 500 khi `sku` tự sinh trùng, `PATCH` nhận chuỗi rỗng).
