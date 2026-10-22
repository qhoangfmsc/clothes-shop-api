# Tech spec

Tài liệu thiết kế **viết trước khi code**: vì sao làm, các phương án, kiến trúc, design pattern, kiểm tra SOLID, kế hoạch test. Khác với `docs/modules/` (hiện trạng, viết sau khi code).

Luật: `.claude/rules/feature-workflow.md` · Cách viết: skill `tech-spec` · Template: `.claude/skills/tech-spec/TEMPLATE.md`

Cấu trúc: `docs/specs/<module>/NNNN-slug.md` (số tăng dần theo từng module). Trạng thái: Draft → Approved → Implemented (hoặc Superseded bởi NNNN). Spec Implemented là lịch sử quyết định, không sửa lại phần thiết kế; thay đổi sau này là spec mới.

## Chỉ mục

| Module | Spec | Trạng thái | Nội dung |
|---|---|---|---|
| common | [0001 — Xoá code chết ở `common/`](common/0001-remove-dead-code.md) | Implemented | Bỏ BaseValidate, helper, transform, baseType, base.interface; giữ ApiEndpoint |
| common | [0002 — Test kiến trúc, allowlist chỉ co lại](common/0002-architecture-guard-tests.md) | Implemented | Hướng phụ thuộc, vòng module, export thừa, exception thô, kích thước service |
| order | [0001 — Trạng thái có kiểu và bảng chuyển trạng thái của đơn](order/0001-typed-statuses-and-order-transitions.md) | Implemented | Type union cho Order/Product/User status, ORDER_TRANSITIONS có kiểu chặt, luật kiến trúc cho cột status |
| common | [0003 — Chuẩn hoá lỗi: exception thô → throwAppError](common/0003-standardize-error-handling.md) | Implemented | 27 chỗ ở 6 service, 15 mã lỗi mới (order, review, cart, address, auth) |
| testing | [0001 — Khung flow test chạy trên Postgres thật](testing/0001-flow-test-infrastructure.md) | Implemented | Postgres docker, schema từ migration, boot app thật, builder, webhook ký sẵn, test matrix |
| testing | [0002 — Ma trận auth/quyền tự phát hiện và đo độ phủ endpoint](testing/0002-access-matrix-and-endpoint-coverage.md) | Implemented | Tự phát hiện route, snapshot quyền, ma trận 401/403, đo độ phủ có ratchet |
| testing | [0003 — Cấu hình flow test ở `.env.test`](testing/0003-flow-test-config-file.md) | Implemented | Một file ở root cho cả docker-compose và jest; cấu hình sai báo lỗi sớm |
