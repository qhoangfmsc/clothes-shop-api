# Rule: docs module — tài liệu hiện trạng, luôn khớp code

`docs/modules/<module>.md` mô tả **hiện trạng thực tế** của từng module (mục lục: `docs/README.md`). Quy trình tổng (Đọc → Spec → Code + Test → Docs) và Definition of Done nằm ở `.claude/rules/feature-workflow.md`; rule này chỉ quy định **bước Docs**: viết gì, ở đâu, tiêu chuẩn nào. Thao tác chi tiết: skill `module-docs`.

Docs và code là **một vòng khép kín**: không đụng vào module khi chưa đọc docs của nó, và việc về module **chưa xong** khi docs chưa khớp code.

## Ba loại tài liệu — không lẫn lộn

| Loại | Nơi | Nội dung | Thời điểm |
|---|---|---|---|
| **Docs module** | `docs/modules/<module>.md` | Hiện giờ hệ thống làm gì (API, dữ liệu, rule, luồng, lỗi, test, thiết kế đang dùng) | Sau khi code, luôn khớp code |
| **Tech spec** | `docs/specs/<module>/NNNN-slug.md` | Vì sao và thiết kế thế nào (phương án, pattern, SOLID, kế hoạch test) | **Trước** khi code; Implemented sau khi xong |
| **Kế hoạch / tiến độ** | `.claude/plans/`, `progress/` | Roadmap, phase, TODO | Ngoài `docs/` |

Nội dung "dự kiến", đề xuất, roadmap chỉ được nằm ở tech spec (phần thiết kế của thay đổi đang làm) hoặc `.claude/plans/`, **không bao giờ** trong `docs/modules/`.

## ① Đọc & hiểu (đầu vào của bước Docs)

- **Cập nhật module có sẵn**: đọc `docs/modules/<module>.md` **và** code thực tế (controller, service, DTO, entity, migration liên quan) và các spec của module ở `docs/specs/<module>/`. Docs lệch code thì code là sự thật; ghi nhận chỗ lệch để sửa.
- **Tạo module mới**: đọc `docs/README.md`, `docs/modules/common.md` và docs của module sẽ phụ thuộc/được tham chiếu.
- **Việc chạm nhiều module**: đọc docs của **tất cả** module bị ảnh hưởng.
- Chưa hiểu luồng thì hỏi người dùng, không đoán.

## Bước Docs — viết / cập nhật sau khi code

- **Tạo module mới** → tạo `docs/modules/<module>.md` từ `.claude/skills/module-docs/TEMPLATE.md` (đủ 4 phần) + thêm dòng vào bảng trong `docs/README.md`.
- **Cập nhật module** → sửa đúng các mục bị ảnh hưởng, xoá nội dung đã lỗi thời, đổi `Cập nhật lần cuối`.
- **Chạm hạ tầng dùng chung** (guard, permission, error code, pagination, enum dùng chung, env, migration, bootstrap, test infra) → sửa `docs/modules/common.md`.
- **Xoá/đổi tên module** → xoá/đổi tên file docs và dòng trong `docs/README.md`.
- Mỗi migration mới phải có trong bảng migration ở `common.md` và trong phần Dữ liệu của module sở hữu bảng.
- Mục **4.7 Test** của module liệt kê unit spec và flow test đang cover module, khớp `test/README.md`.
- Mục **4.9 Thiết kế & pattern** ghi pattern/ranh giới đang dùng trong module và spec tương ứng (module cũ bổ sung khi được chạm tới).

## Nội dung được và không được viết

- Chỉ ghi những gì **đã có** trong code, đúng như đang chạy. Mọi giá trị (default, giới hạn, mã lỗi, constraint) đọc từ code/migration, không đoán.
- Mỗi file module có đúng 4 phần: 1 Tổng quan · 2 Mục đích & nghiệp vụ · 3 Submodule & chức năng · 4 Chi tiết (API, dữ liệu, validation 3 tầng, luồng xử lý, error code, phụ thuộc/cấu hình, test, lưu ý hiện trạng, thiết kế & pattern).
- Điểm lệch chuẩn hoặc hành vi bất ngờ ghi ở mục **4.8 Lưu ý hiện trạng** (ở `common.md` là 4.13), như một sự thật trung tính.
- **Cấm** trong `docs/modules/`: tài liệu cho FE (changelog API, enum cho FE, hướng dẫn tích hợp); roadmap, kế hoạch, phase, TODO, "dự kiến", đề xuất; tính năng chưa tồn tại; secret hoặc giá trị thật của biến môi trường (chỉ ghi tên biến).
- Không tạo file docs theo phase, ngày hay đối tượng đọc. Ngoài `docs/modules/`, chỉ có `docs/specs/<module>/` cho tech spec (xem `feature-workflow.md`).

## Ngoại lệ không cần cập nhật docs

Thay đổi không đổi hành vi quan sát được: đổi tên biến nội bộ, format code, sửa comment, thêm test thuần không đổi code chạy. Khi dùng ngoại lệ này phải nói rõ trong báo cáo cuối.
