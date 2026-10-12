---
name: module-docs
description: Quy trình khép kín Docs → Feature → Docs cho từng module của clothes-shop-api. BẮT BUỘC dùng trước khi sửa/tạo bất kỳ thứ gì trong src/modules, src/common, src/core, src/migrations (đọc docs/modules/<module>.md + code để hiểu module) và sau khi làm xong (viết/cập nhật docs rồi mới được báo hoàn thành). Không dùng cho tài liệu FE, roadmap hay kế hoạch.
---

# module-docs — vòng khép kín Docs → Feature → Docs

Luật gốc: `.claude/rules/module-docs.md`. Skill này là quy trình thao tác. `docs/` chỉ chứa những gì **đã có** trong code, mỗi module một file `docs/modules/<module>.md`.

```
 GIAI ĐOẠN A            GIAI ĐOẠN B          GIAI ĐOẠN C                GIAI ĐOẠN D
 Đọc & hiểu      →      Làm feature   →      Viết / cập nhật docs  →    Đối chiếu & báo xong
 (docs + code)          (code + test)        (docs/modules/*.md)        (checklist DoD)
```

Không được nhảy cóc: không làm B khi chưa xong A; không báo xong khi chưa xong C và D.

---

## Giai đoạn A — Đọc & hiểu (trước khi viết code)

### A1. Xác định phạm vi

Liệt kê module bị ảnh hưởng: module chính + module phụ thuộc/tham chiếu (FK, gọi service, dùng chung enum/error code/permission). Tra bảng "Quan hệ giữa các module" trong `docs/README.md`.

### A2. Đọc docs

| Tình huống | Phải đọc |
|---|---|
| Cập nhật module có sẵn | `docs/modules/<module>.md` (đủ 4 phần) + `docs/modules/common.md` các mục liên quan |
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
| Test hiện có | `*.spec.ts` |

### A4. Chốt hiểu biết trước khi code

- Nếu docs lệch code → **code là sự thật**. Ghi nhận chỗ lệch để sửa docs ở giai đoạn C (và nói với người dùng nếu đáng kể).
- Tự trả lời được: module làm gì, luồng hiện tại ra sao, thay đổi sắp làm chạm vào cột/endpoint/rule nào, module khác nào bị ảnh hưởng.
- Chưa trả lời được → hỏi người dùng, không đoán.

---

## Giai đoạn B — Làm feature

Theo `CLAUDE.md`: validation 3 tầng (DTO → service → migration), skill `list-api` cho API list, error code `[MM][EE]`, migration timestamp `Date.now()`.

Trong lúc làm, ghi nhanh (trong đầu hoặc scratchpad, **không** vào `docs/`) danh sách thay đổi để dùng ở giai đoạn C: endpoint, DTO field, cột/constraint/migration, error code, permission, env, business rule, test.

Kiểm tra: `npx tsc --noEmit && npx biome check src/ && yarn test && npx nest build`.

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
- [ ] Type check, lint, test, build qua.
- [ ] Mỗi endpoint trong controller đều có trong bảng API của docs (và ngược lại, không còn endpoint ma).
- [ ] Mọi cột/constraint trong phần Dữ liệu đối chiếu được với entity + migration.
- [ ] Mọi error code / permission / env mới hoặc đổi đã có trong docs (module + `common.md` nếu dùng chung).
- [ ] Module mới: có file `docs/modules/<module>.md` đủ 4 phần và dòng trong `docs/README.md`.
- [ ] `Cập nhật lần cuối` đã đổi; không có nội dung kế hoạch hay tài liệu FE.
- [ ] Báo cáo cuối cho người dùng **liệt kê file docs đã tạo/sửa**.

Ngoại lệ không cần docs (phải nói rõ trong báo cáo): đổi tên biến nội bộ, format, sửa comment, thêm test thuần không đổi code chạy.
