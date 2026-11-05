<!-- Điền đủ trước khi xin merge vào main. Luật: .claude/rules/release-gate.md -->

## Thay đổi gì và vì sao

<!-- 1–3 câu. Nêu spec: docs/specs/<module>/NNNN-slug.md -->

## Quy trình (Đọc → Spec → Code + Test → Docs)

- [ ] Spec: `docs/specs/<module>/NNNN-…md` ở trạng thái **Implemented**, mục 6 đã điền (hoặc thay đổi miễn spec: ghi lý do)
- [ ] Docs module khớp code (`docs/modules/<module>.md`, `common.md` nếu chạm phần chung), `test/README.md` có dòng test mới
- [ ] Test đi kèm: unit cạnh code; flow nếu chạm tiền, trạng thái đơn, thanh toán, hoàn tiền, trả hàng, auth

## Phạm vi ảnh hưởng (`yarn impact`)

- Module đã đổi:
- Bên liên quan đã kiểm lại (trực tiếp / gián tiếp / phía admin):
- Đã chạy: <!-- yarn verify / yarn impact --run flows … -->

## Rủi ro production

- [ ] Migration chạy được trên dữ liệu hiện có, có `down`; đã ghi vào `docs/modules/common.md`
- [ ] Biến môi trường mới: đã thêm vào `core/env.validation.ts`, `test/support/test-env.ts`, docs (chỉ tên biến) và **đặt trên Render trước khi deploy**
- [ ] Hợp đồng API thay đổi (đổi/xoá field, đổi mã lỗi) đã ghi ở docs và được duyệt

## Miễn trừ (nếu có)

<!-- Thay đổi không đổi hành vi (đổi tên nội bộ, format, comment): thêm trailer vào một commit
     No-Test: <lý do>
     No-Docs: <lý do> -->
