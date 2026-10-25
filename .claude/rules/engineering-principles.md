# Rule: nguyên tắc kỹ thuật — mục lục và nguyên tắc nền

Luật bắt buộc khi **thiết kế (spec) và viết code** trong `src/`. Mục tiêu: dự án **ổn định** (đổi một chỗ không vỡ chỗ khác) và **tường minh** (người đọc biết vì sao code có hình dạng này, và học được từ đó).

Mỗi chủ đề có một rule riêng, mô tả: là gì, vì sao, áp dụng thế nào trong dự án này, ví dụ đã đối chiếu code, cái gì được máy ép, checklist review.

| Chủ đề | Rule | Trả lời |
|---|---|---|
| Kiến trúc | [`architecture.md`](architecture.md) | Code nằm đâu? Module/cell chia thế nào? Ai được phụ thuộc ai? Transaction, khoá, tích hợp ngoài |
| Design pattern | [`design-patterns.md`](design-patterns.md) | Pattern nào **đang dùng**, nào **chỉ dùng khi có điều kiện**, nào **không dùng**, chọn thế nào |
| SOLID | [`solid.md`](solid.md) | Năm câu hỏi tự kiểm, áp vào NestJS của dự án, ví dụ tốt và chỗ còn lệch |
| Coding convention | [`coding-conventions.md`](coding-conventions.md) | Đặt tên, bố cục, lỗi, log, cấu hình, API, test, comment, git |
| Comment | [`comments.md`](comments.md) | Khi nào comment, dài bao nhiêu |
| Phạm vi ảnh hưởng | [`change-impact.md`](change-impact.md) | Đổi một chỗ thì phải kiểm lại những bên liên quan nào, bằng cách nào |
| Cổng lên production | [`release-gate.md`](release-gate.md) | Hook, CI, kiểm docs/test/build, bảo vệ nhánh `main`, deploy, hậu kiểm |

Giáo trình mở rộng và mẫu code: skill `design-principles`. Quy trình làm việc: `feature-workflow.md`. Test: `testing.md`. Docs: `module-docs.md`.

## Nguyên tắc nền

1. **Pattern là công cụ, không phải mục tiêu.** Chỉ dùng khi gọi tên được vấn đề cụ thể nó giải. "Không dùng pattern nào" là kết luận hợp lệ. Cấm thêm abstraction "để sau này".
2. **Rule of three.** Lần 1 viết thẳng, lần 2 chấp nhận lặp, lần 3 gom thành helper/pattern dùng chung.
3. **Tường minh hơn khéo léo.** Ưu tiên code đọc là hiểu; một pattern làm code khó đọc hơn vấn đề nó giải thì bỏ.
4. **Có lý do, có cái giá.** Mỗi pattern/ranh giới được chọn nói được: giải vấn đề gì, cái giá là gì. Ghi ở spec (mục 3.3, 3.4) và một dòng comment ở chỗ định nghĩa.
5. **Máy kiểm, không phải trí nhớ.** Quy ước quan trọng phải được ép bằng test hoặc lint; vi phạm cũ nằm trong allowlist chỉ co lại. Cái chưa ép được thì rule nói thẳng "chỉ review".
6. **Code mới theo chuẩn; code cũ sửa khi chạm tới.** Không refactor hàng loạt ngoài phạm vi. Chỗ cũ còn lệch chuẩn ghi ở `docs/modules/common.md` mục 4.13 như sự thật trung tính.

## Những gì đang được máy ép

| Nhóm | Test/lint | Nội dung |
|---|---|---|
| Kiến trúc | `src/common/architecture/architecture.spec.ts` | Hướng phụ thuộc, vòng module, export thừa, `throwAppError`, `findLocked`, ghi chéo module, `status` type union, cell, kích thước service |
| Convention | `src/common/architecture/conventions.spec.ts` | Tên file + hậu tố vai trò, tên class theo tên file, DTO trong `dtos/`, controller không chạm DB, không exception HTTP thô, không `console.*`, module không đọc `process.env` |
| API | `list-query.dto.spec.ts`, `update-dto.spec.ts`, `test/flows/access` | Chuẩn list, `PATCH`, route–quyền |
| Format/lint | Biome | `yarn lint` |

Đỏ vì vi phạm mới → sửa code, **không** thêm vào allowlist. Đỏ vì "allowlist chưa giảm" → giảm allowlist cùng lượt.

## Giải thích cho người đọc / người học

- Spec ghi pattern và SOLID đã áp dụng cùng lý do (mục 3.3, 3.4).
- Chỗ định nghĩa pattern có 1 dòng comment: tên pattern + vấn đề nó giải (giải thích dài ở spec).
- Báo cáo cuối nêu **1–3 dòng**: pattern/nguyên lý đã dùng ở đâu và vì sao (hoặc vì sao cố ý không dùng).
