# Tech spec

Tài liệu thiết kế **viết trước khi code**: vì sao làm, các phương án, kiến trúc, design pattern, kiểm tra SOLID, kế hoạch test. Khác với `docs/modules/` (hiện trạng, viết sau khi code).

Luật: `.claude/rules/feature-workflow.md` · Cách viết: skill `tech-spec` · Template: `.claude/skills/tech-spec/TEMPLATE.md`

Cấu trúc: `docs/specs/<module>/NNNN-slug.md` (số tăng dần theo từng module). Trạng thái: Draft → Approved → Implemented (hoặc Superseded bởi NNNN). Spec Implemented là lịch sử quyết định, không sửa lại phần thiết kế; thay đổi sau này là spec mới.

## Chỉ mục

| Module | Spec | Trạng thái | Nội dung |
|---|---|---|---|
| testing | [0001 — Khung flow test chạy trên Postgres thật](testing/0001-flow-test-infrastructure.md) | Implemented | Postgres docker, schema từ migration, boot app thật, builder, webhook ký sẵn, test matrix |
