# Rule: quy trình làm việc — Đọc → Spec → Code + Test → Docs

Mọi việc chạm `src/modules`, `src/common`, `src/core`, `src/migrations` đi đủ 5 bước, đúng thứ tự. Quy trình thao tác: skill `feature-workflow`. Rule này thay cho vòng "Docs → Feature → Docs" cũ; phần *nội dung docs* vẫn theo `module-docs.md`.

```
① ĐỌC & HIỂU → ② TECH SPEC → ③ CODE + TEST → ④ DOCS (hiện trạng) → ⑤ ĐỐI CHIẾU & BÁO XONG
  docs+code     (thiết kế)      theo spec        khớp code vừa làm       Definition of Done
  spec cũ
```

| Bước | Làm gì | Sản phẩm |
|---|---|---|
| ① | Đọc `docs/modules/<module>.md`, code thực tế, và spec cũ ở `docs/specs/<module>/`. Docs lệch code thì code là sự thật. Chưa hiểu thì hỏi, không đoán. | Hiểu biết |
| ② | Viết spec trước khi code (skill `tech-spec`): vấn đề, phương án, kiến trúc, pattern, SOLID, dữ liệu, luồng, lỗi, **kế hoạch test**. Quyết định thiết kế đáng kể → cho người dùng xem/hỏi trước khi code. | `docs/specs/<module>/NNNN-slug.md` (Draft) |
| ③ | Code theo spec và các rule kỹ thuật (`engineering-principles.md` → `architecture.md`, `design-patterns.md`, `solid.md`, `coding-conventions.md`); viết/ cập nhật test cùng lượt theo `testing.md`. | Code + test xanh |
| ④ | Cập nhật `docs/modules/<module>.md` (+ `common.md` nếu chạm phần chung) theo skill `module-docs`; điền mục 6 của spec và chuyển **Implemented**; cập nhật `test/README.md`. | Docs, spec, matrix khớp code |
| ⑤ | Chạy toàn bộ kiểm tra, **kiểm lại bên liên quan** (`change-impact.md`, `yarn impact`), đối chiếu checklist, báo cáo. | Báo cáo cuối |

## Spec — bắt buộc cỡ nào

| Cỡ thay đổi | Spec |
|---|---|
| **Đầy đủ**: module mới, migration, luồng tiền/transaction/khoá, API/endpoint mới, đổi state machine, đổi hạ tầng dùng chung | Đủ mục của `.claude/skills/tech-spec/TEMPLATE.md` |
| **Rút gọn**: sửa bug, thêm field/filter/sort, đổi default, đổi rule validate nhỏ | Chỉ mục 1 (bối cảnh), 2 (mục tiêu), 3.3–3.4 (pattern, SOLID — có thể ghi "không đổi/đạt"), 3.9 (một dòng ảnh hưởng), 4 (test), 6 (kết quả) |
| **Miễn**: đổi tên biến nội bộ, format, sửa comment, thêm test thuần không đổi code chạy | Không cần; nói rõ trong báo cáo |

Spec đánh số `NNNN` tăng dần **theo từng module** (`0001`, `0002`...). Trạng thái: Draft → Approved → Implemented (hoặc Superseded). Spec đã Implemented là lịch sử quyết định: **không sửa lại nội dung thiết kế**; thay đổi sau này là spec mới (ghi `Superseded bởi NNNN` ở spec cũ nếu thay thế).

## Phân vai: spec, docs, test

| | Trả lời câu hỏi | Thời điểm | Nơi |
|---|---|---|---|
| Tech spec | Vì sao và thiết kế thế nào? | **Trước** khi code | `docs/specs/<module>/` |
| Docs module | Hiện giờ hệ thống làm gì? | **Sau** khi code | `docs/modules/<module>.md` |
| Test | Có còn đúng không? | **Cùng** lúc với code | `src/**.spec.ts`, `test/flows/` |

## Definition of Done

Chỉ được báo xong khi đủ cả:

1. `npx tsc --noEmit`, `yarn lint`, `yarn test`, `yarn test:flows`, `yarn check:docs` đều qua (hoặc nêu rõ vì sao không chạy được); `yarn verify` chạy đủ chuỗi này.
2. Spec đã ở trạng thái Implemented với mục 6 điền đủ (hoặc nêu lý do miễn).
3. Docs module (và `common.md` nếu chạm phần chung) khớp code.
4. Test mới/cập nhật đủ theo `testing.md`, `test/README.md` có dòng tương ứng.
5. Code tuân các rule kỹ thuật (`engineering-principles.md` và bốn rule con).
6. **Bên liên quan đã kiểm lại** theo `change-impact.md`: module trực tiếp/gián tiếp (kể cả phía admin) chạy lại test xanh, docs của họ còn đúng.
7. Báo cáo cuối nêu: **file spec, file docs, file test đã tạo/sửa**, **1–3 dòng về pattern/nguyên lý đã áp dụng và vì sao**, và dòng **Phạm vi ảnh hưởng** (module đổi · bên liên quan đã kiểm lại · flow/unit đã chạy · việc không chạy được).

Chưa đủ thì chưa xong, không được tóm tắt "đã xong".
