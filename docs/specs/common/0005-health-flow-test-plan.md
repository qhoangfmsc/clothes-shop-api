# 0005 — Kế hoạch flow test cho health (`GET /`, `GET /health`)

> Module: `common` (bootstrap, `MainController`) · Trạng thái: Implemented · Ngày: 2026-10-23 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Hai route công khai của `MainController` (batch 25) phục vụ giám sát và chưa có test; nhánh DB lỗi của `/health` trả HTTP 200 với `status: 'error'`.

## 2. Mục tiêu & ngoài phạm vi

Kiểm lời chào, nhánh DB sống và nhánh DB lỗi. Ngoài phạm vi: đổi hành vi (không có ca lỗi nghiệp vụ nên cả hai route `exempt` ca lỗi trong `test/coverage-baseline.json`).

## 3. Thiết kế (batch)

3.3/3.4: không thêm pattern; nhánh lỗi dùng `jest.spyOn` trên `DataSource.query`.

| Batch | Route | Flow |
|---|---|---|
| 25 | `GET /`, `GET /health` | `test/flows/health/health.flow.ts` |

## 4. Kế hoạch test

Theo skill `test-campaign`; phá thử nhánh lỗi.

## 5. Rủi ro & rollback

`git revert` commit của batch.

## 6. Kết quả triển khai

- 3 flow test; phá thử nhánh lỗi bị bắt.
- **Docs:** `common.md` (bảng route), `test/README.md`, `test/PROGRESS.md`.
