---
name: tech-spec
description: Viết tech spec (thiết kế) TRƯỚC khi code cho clothes-shop-api — phương án, kiến trúc, design pattern, kiểm tra SOLID, dữ liệu, luồng/transaction, lỗi, kế hoạch test. Dùng ở bước ② của feature-workflow cho module mới, migration, luồng tiền, endpoint mới, đổi hạ tầng dùng chung; bản rút gọn cho bug/field/filter.
---

# tech-spec — thiết kế trước, code sau

Luật gốc: `.claude/rules/feature-workflow.md` (mục "Spec"). Template: `.claude/skills/tech-spec/TEMPLATE.md`. Ví dụ hoàn chỉnh: `docs/specs/testing/0001-flow-test-infrastructure.md`.

Spec trả lời **vì sao và thiết kế thế nào**, viết **trước** khi code. Docs module trả lời "hiện giờ làm gì", viết **sau**.

## Các bước

1. **Đánh số.** `ls docs/specs/<module>/` lấy số kế tiếp (`0001` nếu chưa có). Tên file `NNNN-slug-ngan.md` (kebab-case, không ngày).
2. **Copy template** vào `docs/specs/<module>/`, điền header (module, trạng thái Draft, ngày hôm nay).
3. **Điền theo thứ tự** (cỡ rút gọn: mục 1, 2, 3.3, 3.4, 4, 6):
   - **1 Bối cảnh:** hiện trạng đã đọc (trích file/hàm thật), vấn đề.
   - **2 Mục tiêu / ngoài phạm vi:** ngoài phạm vi quan trọng không kém, chống trượt phạm vi.
   - **3.1 Phương án:** ≥ 2 phương án thật (kể cả "không làm gì"), chọn một và nói vì sao.
   - **3.2 Kiến trúc:** code đặt ở đâu, phụ thuộc chiều nào, module nào bị chạm; kiểm tra không vòng, `common/` không import `modules/`.
   - **3.3 Pattern:** mỗi pattern có *vấn đề cụ thể* và *cái giá*. "Không dùng pattern" là hợp lệ. Tra skill `design-principles` để chọn.
   - **3.4 SOLID:** điền 5 dòng; ✘ phải có lý do chấp nhận.
   - **3.5–3.8:** dữ liệu (CHECK/FK/UNIQUE/INDEX), API, luồng + transaction + thứ tự khoá + idempotency, bảng lỗi/biên.
   - **4 Kế hoạch test:** liệt kê case theo tầng (unit / flow / ràng buộc DB) và file đích. Luồng chính phải có ≥ 1 flow.
   - **5 Rủi ro & rollback.**
4. **Trình người dùng** nếu có quyết định đáng kể (xem workflow), chuyển Draft → Approved khi được đồng ý (hoặc khi việc nhỏ, tự Approved).
5. **Sau khi code xong:** điền mục 6 (file đã đổi, khác thiết kế ở đâu và vì sao, docs và test đã cập nhật), chuyển **Implemented**. Spec Implemented là lịch sử — không sửa phần thiết kế về sau; thay đổi mới = spec mới, spec cũ ghi `Superseded bởi NNNN`.
6. **Cập nhật** `docs/specs/README.md` (bảng chỉ mục).

## Chất lượng một spec tốt

- Cụ thể: trích tên file, hàm, bảng, cột thật; không viết chung chung.
- Có lựa chọn bị loại và lý do (đây là phần người học được nhiều nhất).
- Có kế hoạch test đủ để người khác viết test từ đó.
- Cỡ rút gọn không quá ~30 dòng.
- Không chứa secret; không thay thế docs module và không chứa tài liệu cho FE.
