---
name: module-docs
description: Bước ĐỌC và bước DOCS của quy trình làm việc clothes-shop-api (xem skill feature-workflow cho cả quy trình Đọc → Spec → Code + Test → Docs). Dùng để đọc docs/modules/<module>.md + code trước khi sửa src/modules, src/common, src/core, src/migrations, và để viết/cập nhật docs hiện trạng sau khi code xong. Không dùng cho tài liệu FE, roadmap hay kế hoạch; thiết kế trước khi code thuộc skill tech-spec.
---

# module-docs — đọc hiểu trước, viết docs hiện trạng sau

Luật gốc: `.claude/rules/module-docs.md` (nội dung docs) và `.claude/rules/feature-workflow.md` (quy trình tổng). Skill này là phần thao tác của **bước ① Đọc & hiểu** và **bước ④ Docs**. `docs/modules/` chỉ chứa những gì **đã có** trong code, mỗi module một file.

```
 ① Đọc & hiểu → ② Tech spec → ③ Code + Test → ④ Docs hiện trạng → ⑤ Đối chiếu & báo xong
   (giai đoạn A)  (tech-spec)    (giai đoạn B)    (giai đoạn C)       (giai đoạn D)
```

Không nhảy cóc: không code khi chưa đọc xong; không báo xong khi chưa xong docs.

---

## Giai đoạn A — Đọc & hiểu (trước khi viết code)

### A1. Xác định phạm vi

Liệt kê module bị ảnh hưởng: module chính + module phụ thuộc/tham chiếu (FK, gọi service, dùng chung enum/error code/permission). Tra bảng "Quan hệ giữa các module" trong `docs/README.md`.

### A2. Đọc docs

| Tình huống | Phải đọc |
|---|---|
| Cập nhật module có sẵn | `docs/modules/<module>.md` (đủ 4 phần) + `docs/modules/common.md` các mục liên quan + các spec của module ở `docs/specs/<module>/` (hiểu vì sao hiện thiết kế như vậy) |
| Tạo module mới | `docs/README.md`, `docs/modules/common.md`, docs của module sẽ phụ thuộc |
| Việc chạm nhiều module | docs của **tất cả** module trong phạm vi |
| Chạm hạ tầng dùng chung | `docs/modules/common.md` + docs của các module đang dùng phần đó |

### A3. Đọc code để đối chiếu

Với từng module trong phạm vi, đọc code thực tế:

| Phần | Nguồn |
|---|---|
| Route, quyền | `@Controller`, `@Public()`, `@Permissions(...)` trong `*.controller.ts` |
| Input | `dtos/*.dto.ts`, `*-query.dto.ts` |
| Luồng & business rule | `*.service.ts` |
| Dữ liệu | `*.entity.ts` **và** migration trong `src/migrations/` (CHECK, UNIQUE, FK ON DELETE, INDEX chỉ có trong migration) |
| Error code | `src/common/exceptions/error-codes.ts` + chỗ gọi `throwAppError` |
| Test hiện có | `*.spec.ts` cạnh code và `test/flows/<module>/` (xem `test/README.md`) |

### A4. Chốt hiểu biết trước khi code

- Nếu docs lệch code → **code là sự thật**. Ghi nhận chỗ lệch để sửa docs ở giai đoạn C (và nói với người dùng nếu đáng kể).
- Tự trả lời được: module làm gì, luồng hiện tại ra sao, thay đổi sắp làm chạm vào cột/endpoint/rule nào, module khác nào bị ảnh hưởng.
- Chưa trả lời được → hỏi người dùng, không đoán.

---

## Giai đoạn B — Code + test (theo tech spec)

Viết spec trước (skill `tech-spec`), rồi code theo spec, `CLAUDE.md` (validation 3 tầng, skill `list-api`, error code `[MM][EE]`, migration timestamp `Date.now()`) và `.claude/rules/engineering-principles.md`. Viết test cùng lượt (skill `module-test`).

Trong lúc làm, ghi nhanh (trong đầu hoặc scratchpad, **không** vào `docs/`) danh sách thay đổi để dùng ở giai đoạn C: endpoint, DTO field, cột/constraint/migration, error code, permission, env, business rule, test.

Kiểm tra: `npx tsc --noEmit && yarn lint && yarn test && yarn test:flows && npx nest build`.

---

## Giai đoạn C — Viết / cập nhật docs (bắt buộc, cùng lượt với code)

Lấy danh sách thay đổi bằng `git diff` / `git status` thay vì nhớ.

### C1. Tạo module mới

1. Copy `.claude/skills/module-docs/TEMPLATE.md` → `docs/modules/<module>.md`, điền ngày hôm nay.
2. Điền đủ 4 phần, đọc lại code vừa viết theo bảng ở A3 (không viết từ trí nhớ).
3. Thêm 1 dòng vào bảng module và cập nhật sơ đồ quan hệ trong `docs/README.md`.

### C2. Cập nhật module

1. Sửa **đúng các mục bị ảnh hưởng** trong `docs/modules/<module>.md` theo ánh xạ dưới.
2. Xoá nội dung đã lỗi thời; không để mô tả cũ lẫn mới; không ghi lịch sử thay đổi.
3. Sửa luôn chỗ docs lệch code đã phát hiện ở A4.
4. Đổi dòng `Cập nhật lần cuối`.

| Bạn đã đổi… | Sửa mục… |
|---|---|
| Endpoint, query/body, response | 3 (bảng submodule nếu thêm controller), 4.1 |
| Entity, cột, migration, FK, index | 4.2 + bảng migration trong `common.md` |
| Rule validate (DTO / service / DB) | 4.3 |
| Luồng xử lý, state transition, transaction | 4.4 |
| Error code | 4.5 (và bảng prefix trong `common.md` nếu thêm module/enum mới) |
| Env, module phụ thuộc, dịch vụ ngoài | 4.6 (và 4.10 `common.md` nếu thêm biến) |
| Test | 4.7 |
| Hành vi bất ngờ / lệch chuẩn phát sinh | 4.8 |
| Permission | 4.1 của module + bảng permission trong `common.md` |
| Guard, pagination, enum chung, helper chung | `common.md` + các module bị ảnh hưởng |
| Xoá / đổi tên module | xoá / đổi tên file + dòng trong `docs/README.md` |

### C3. Văn phong

- Tiếng Việt, ngắn, bảng/gạch đầu dòng; tên kỹ thuật trong backtick.
- Mọi giá trị cụ thể phải khớp code hiện tại.
- Cấm: tài liệu cho FE, roadmap/kế hoạch/TODO/"dự kiến"/đề xuất, tính năng chưa có, secret, file theo phase/ngày/tính năng.

---

## Giai đoạn D — Đối chiếu & báo xong (Definition of Done)

Chỉ được báo hoàn thành khi tick đủ:

- [ ] Giai đoạn A đã làm: đã đọc docs + code của mọi module trong phạm vi trước khi sửa.
- [ ] Type check, lint, unit test, flow test, build qua.
- [ ] Spec của việc này (nếu thuộc cỡ cần spec) ở trạng thái Implemented, mục 6 đã điền.
- [ ] `test/README.md` có dòng cho test mới/đổi; mục 4.7 của module khớp.
- [ ] Mục 4.9 (thiết kế & pattern) của module phản ánh đúng code vừa làm.
- [ ] Mỗi endpoint trong controller đều có trong bảng API của docs (và ngược lại, không còn endpoint ma).
- [ ] Mọi cột/constraint trong phần Dữ liệu đối chiếu được với entity + migration.
- [ ] Mọi error code / permission / env mới hoặc đổi đã có trong docs (module + `common.md` nếu dùng chung).
- [ ] Module mới: có file `docs/modules/<module>.md` đủ 4 phần và dòng trong `docs/README.md`.
- [ ] `Cập nhật lần cuối` đã đổi; không có nội dung kế hoạch hay tài liệu FE.
- [ ] Báo cáo cuối cho người dùng **liệt kê file spec, docs, test đã tạo/sửa** và 1–3 dòng về pattern/nguyên lý đã áp dụng.

Ngoại lệ không cần docs (phải nói rõ trong báo cáo): đổi tên biến nội bộ, format, sửa comment, thêm test thuần không đổi code chạy.
