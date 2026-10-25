---
name: feature-workflow
description: Quy trình làm việc BẮT BUỘC của clothes-shop-api cho mọi việc chạm src/modules, src/common, src/core, src/migrations — Đọc & hiểu → Tech spec → Code + Test → Docs → Đối chiếu & báo xong. Dùng khi thêm module/feature/endpoint/migration, sửa module cũ, sửa bug có đổi hành vi, hoặc đổi hạ tầng dùng chung.
---

# feature-workflow — Đọc → Spec → Code + Test → Docs

Luật gốc: `.claude/rules/feature-workflow.md`. Kèm: `engineering-principles.md` (pattern, kiến trúc, convention, SOLID), `testing.md`, `module-docs.md`. Skill này là checklist thao tác, gọi các skill con đúng lúc.

```
① Đọc & hiểu → ② Tech spec → ③ Code + Test → ④ Docs hiện trạng → ⑤ Đối chiếu & báo xong
 module-docs     tech-spec     design-principles   module-docs        checklist bên dưới
                               + module-test
```

## ① Đọc & hiểu  → skill `module-docs` (giai đoạn A)

- [ ] Xác định module bị ảnh hưởng (tra "Quan hệ giữa các module" trong `docs/README.md`).
- [ ] Đọc `docs/modules/<module>.md`, code thực tế, spec cũ `docs/specs/<module>/`, `test/README.md` (luồng đã có test).
- [ ] Ghi nhận chỗ docs lệch code (code là sự thật). Chưa hiểu → hỏi người dùng.

## ② Tech spec  → skill `tech-spec`

- [ ] Chọn cỡ: đầy đủ / rút gọn / miễn (bảng trong rule).
- [ ] Tạo `docs/specs/<module>/NNNN-slug.md` từ template; điền bối cảnh, mục tiêu, phương án (≥ 2), kiến trúc, pattern (3.3), SOLID (3.4), dữ liệu, luồng, lỗi, **kế hoạch test**.
- [ ] Quyết định thiết kế đáng kể, đụng tiền/transaction/migration, hoặc nhiều phương án ngang nhau → trình người dùng (`AskUserQuestion` hoặc tóm tắt) **trước khi code**.

## ③ Code + Test  → `design-principles`, `module-test`, `list-api` (nếu API list)

- [ ] Code theo spec và các rule kỹ thuật (`engineering-principles.md` → kiến trúc, pattern, SOLID, convention). Lệch spec thì ghi lại để điền mục 6.
- [ ] Chạy `yarn impact --run unit` (và `--run flows`) trong lúc làm để thấy sớm bên liên quan bị vỡ.
- [ ] Viết test cùng lượt: unit cạnh code; **flow** nếu chạm luồng chính (xem `testing.md`). Sửa bug → test tái hiện trước.
- [ ] Chạy: `npx tsc --noEmit` · `yarn lint` · `yarn test` · `yarn test:flows` (Docker) · `npx nest build`.

## ④ Docs hiện trạng  → skill `module-docs` (giai đoạn C)

- [ ] Sửa `docs/modules/<module>.md` đúng mục bị ảnh hưởng (API, dữ liệu, validation, luồng, lỗi, test 4.7, lưu ý 4.8, thiết kế 4.9); `common.md` nếu chạm phần chung; `docs/README.md` nếu thêm module.
- [ ] Spec: điền mục 6, chuyển trạng thái **Implemented**; cập nhật `docs/specs/README.md`.
- [ ] `test/README.md`: thêm/sửa dòng test matrix.

## ⑤ Đối chiếu & báo xong

- [ ] `yarn impact`: ghi module đổi, bên liên quan trực tiếp/gián tiếp (kể cả admin), rồi chạy **toàn bộ** `yarn verify` (tsc, lint, check:docs, unit, build, flow). Luật: `.claude/rules/change-impact.md`.
- [ ] Đối chiếu docs với code từng endpoint, cột, constraint, error code, permission.
- [ ] Mọi mục Definition of Done trong rule đạt.
- [ ] Báo cáo cuối: **file spec, docs, test đã tạo/sửa** + 1–3 dòng pattern/nguyên lý đã áp dụng và vì sao + dòng **Phạm vi ảnh hưởng** + việc chưa chạy được (nếu có) nói thẳng.

## Mẹo giữ nhịp

- Việc nhỏ dùng spec rút gọn (~15 dòng), đừng bỏ qua nhưng cũng đừng viết dài.
- Phát hiện cần refactor ngoài phạm vi → ghi vào `docs/modules/common.md` 4.13 hoặc hỏi người dùng, không tự mở rộng phạm vi.
- Đang làm dở mà đổi hướng → cập nhật spec (còn Draft) trước, rồi mới đổi code.
