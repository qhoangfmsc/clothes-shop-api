# 0001 — Kế hoạch flow test cho module category

> Module: `category` · Trạng thái: Implemented · Ngày: 2026-10-23 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Chiến dịch test toàn diện (`test/PROGRESS.md`, skill `test-campaign`) phủ ca thành công và ca lỗi cho từng route. Module category có 6 route (batch 15–16) và giữ một bất biến khó: `priority` là dãy 1..N duy nhất, được bảo vệ bằng advisory lock, UNIQUE DEFERRABLE và dịch chỗ trong transaction. Trước batch 15 module chưa có test nào ngoài guard DTO.

## 2. Mục tiêu & ngoài phạm vi

Mỗi route category có ≥ 1 ca thành công và ≥ 1 ca lỗi nghiệp vụ trên Postgres thật, kể cả bất biến thứ hạng khi thao tác đồng thời. Ngoài phạm vi: đổi hành vi (khoảng trống validation của `PATCH` được ghi ở `test/PROGRESS.md` và `category.md` 4.8, test không khẳng định hành vi đó).

## 3. Thiết kế (batch)

3.3/3.4: không thêm pattern; `requestWhileAdvisoryLocked` (`test/support/locks.ts`) là bản của `requestWhileRowLocked` cho khoá advisory; dựng category qua API để thứ hạng là dãy 1..N.

| Batch | Route | Flow |
|---|---|---|
| 15 | `GET /api/categories`, `GET /api/admin/categories`, `POST /api/admin/categories`, `DELETE /api/admin/categories/:id`, `PATCH /api/admin/categories/:id` | `test/flows/category/category.flow.ts` |
| 16 | `PATCH /api/admin/categories/reorder` | `test/flows/category/category.flow.ts` |

## 4. Kế hoạch test

Theo skill `test-campaign`; phá thử các điểm thứ hạng, khoá advisory, đồng bộ subcategory và ánh xạ lỗi FK.

## 5. Rủi ro & rollback

`git revert` commit của batch.

## 6. Kết quả triển khai

- **Batch 15–16:** 74 flow test dùng chung một file, gồm hai ca giữ khoá advisory từ ngoài để chứng minh `create` và `reorder` chờ khoá. Phá thử 19 điểm đều bị bắt. 1 phát hiện cần quyết định (`PATCH` nhận `slug`/`title` rỗng; response `PATCH`/`POST` thiếu field không gửi).
- **Tổng module:** 6/6 route category có ca thành công và ca lỗi nghiệp vụ trên Postgres thật. Độ phủ toàn cục sau batch 16: thành công 67/98, lỗi 64/93, baseline 34 route.
- **Docs:** `category.md` (4.7, 4.8), `test/README.md`, `test/PROGRESS.md`.
