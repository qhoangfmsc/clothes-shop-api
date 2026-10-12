# Rule: quy trình khép kín Docs → Feature → Docs

`docs/` là tài liệu BE thực tế, mỗi module một file `docs/modules/<module>.md` (mục lục: `docs/README.md`). Docs và code là **một vòng khép kín**: không đụng vào module khi chưa đọc docs của nó, và một việc về module **chưa xong** khi docs của module chưa khớp với code.

Quy trình thao tác chi tiết: skill `module-docs` (`.claude/skills/module-docs/SKILL.md`). Rule này là luật bắt buộc, không có ngoại lệ "làm nhanh".

## Vòng khép kín (3 bước, đúng thứ tự)

```
 ① ĐỌC & HIỂU  →  ② LÀM FEATURE  →  ③ VIẾT / CẬP NHẬT DOCS  →  (xong)
   docs + code        code + test         khớp với code vừa làm
```

### ① Đọc & hiểu — TRƯỚC khi sửa hoặc thêm bất cứ thứ gì

- **Cập nhật module có sẵn**: phải đọc `docs/modules/<module>.md` **và** code thực tế của module (controller, service, DTO, entity, migration liên quan). Đối chiếu hai bên; nếu docs lệch code thì ghi nhận chỗ lệch (code là sự thật), rồi mới bắt đầu.
- **Tạo module mới**: đọc `docs/README.md` và `docs/modules/common.md` (guard, permission, pagination, error code, migration convention), và docs của các module sẽ phụ thuộc/được tham chiếu.
- **Việc chạm nhiều module** (checkout, FK giữa bảng…): đọc docs của **tất cả** module bị ảnh hưởng.
- Chưa đọc xong thì chưa được viết code. Nếu sau khi đọc vẫn chưa hiểu luồng, hỏi người dùng thay vì đoán.

### ② Làm feature

Theo các chuẩn trong `CLAUDE.md` (validation 3 tầng, list-api, error code, migration…). Chạy `npx tsc --noEmit`, `npx biome check src/`, `yarn test`.

### ③ Viết / cập nhật docs — bắt buộc, cùng lượt với code

- **Tạo module mới** → tạo `docs/modules/<module>.md` từ `.claude/skills/module-docs/TEMPLATE.md` (đủ 4 phần) + thêm dòng vào bảng trong `docs/README.md`.
- **Cập nhật module** → sửa đúng các mục bị ảnh hưởng trong `docs/modules/<module>.md`, xoá nội dung đã lỗi thời, đổi `Cập nhật lần cuối`.
- **Chạm hạ tầng dùng chung** (guard, permission, error code, pagination, enum dùng chung, env, migration) → sửa `docs/modules/common.md`.
- **Xoá/đổi tên module** → xoá/đổi tên file docs và dòng trong `docs/README.md`.
- Mỗi migration mới phải xuất hiện trong bảng migration ở `common.md` và trong phần Dữ liệu của module sở hữu bảng.

## Định nghĩa "xong" (Definition of Done)

Một thay đổi trong `src/modules/**`, `src/common/**`, `src/core/**`, `src/migrations/**` **chỉ được báo là xong** khi đủ cả:

1. Code chạy đúng: type check, lint, test đều qua.
2. Docs của mọi module bị ảnh hưởng đã được cập nhật khớp với code (đối chiếu lại từng endpoint, cột, constraint, error code, permission đã đổi).
3. Câu báo cáo cuối cùng cho người dùng nêu rõ **file docs nào đã được tạo/sửa**.

Nếu thiếu bước 2, việc coi như chưa hoàn thành — không được tóm tắt "đã xong".

Ngoại lệ duy nhất (không cần docs): thay đổi không đổi hành vi quan sát được — đổi tên biến nội bộ, format code, sửa comment, thêm test thuần mà không đổi code chạy. Khi dùng ngoại lệ này phải nói rõ trong báo cáo cuối.

## Nội dung được và không được viết trong docs/

- Chỉ ghi những gì **đã có** trong code, đúng như đang chạy. Mọi giá trị (default, giới hạn, mã lỗi, constraint) đọc từ code/migration, không đoán.
- Mỗi file module có đúng 4 phần: 1 Tổng quan · 2 Mục đích & nghiệp vụ · 3 Submodule & chức năng · 4 Chi tiết (API, dữ liệu, validation 3 tầng, luồng xử lý, error code, phụ thuộc/cấu hình, test, lưu ý hiện trạng).
- Điểm lệch chuẩn hoặc hành vi bất ngờ ghi ở mục **4.8 Lưu ý hiện trạng**, như một sự thật trung tính.
- **Cấm**: tài liệu cho FE (changelog API, enum cho FE, hướng dẫn tích hợp); roadmap, kế hoạch, phase, TODO, "dự kiến", đề xuất; tính năng chưa tồn tại; secret hoặc giá trị thật của biến môi trường (chỉ ghi tên biến).
- Không tạo file docs theo phase, ngày, tính năng hay đối tượng đọc — chỉ file theo module. Kế hoạch/tiến độ để ở `.claude/plans/` hoặc `progress/`.
