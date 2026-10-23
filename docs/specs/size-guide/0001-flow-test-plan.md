# 0001 — Kế hoạch flow test cho module size-guide

> Module: `size-guide` · Trạng thái: Implemented · Ngày: 2026-10-23 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Chiến dịch test toàn diện (`test/PROGRESS.md`, skill `test-campaign`) phủ ca thành công và ca lỗi cho từng route (batch 23). Trước đó module chỉ có unit test với mock hoặc chưa có test.

## 2. Mục tiêu & ngoài phạm vi

Mỗi route có ca thành công và ca lỗi nghiệp vụ trên Postgres thật; route không thể có lỗi nghiệp vụ được ghi `exempt` kèm lý do trong `test/coverage-baseline.json`. Ngoài phạm vi: đổi hành vi.

## 3. Thiết kế (batch)

3.3/3.4: không thêm pattern.

| Batch | Route | Flow |
|---|---|---|
| 23 | `GET /api/size-guides/:category` | `test/flows/size-guide/size-guide.flow.ts` |

## 4. Kế hoạch test

Theo skill `test-campaign`.

## 5. Rủi ro & rollback

`git revert` commit của batch.

## 6. Kết quả triển khai

- 10 flow test; phá thử 1 điểm bị bắt.
- **Docs:** `size-guide.md` (4.7), `test/README.md`, `test/PROGRESS.md`.
