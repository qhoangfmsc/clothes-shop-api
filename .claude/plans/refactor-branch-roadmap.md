# Lộ trình nhánh `refactor/engineering-workflow`

Nhánh refactor lớn tách từ `main` (commit `aa97259`). Người dùng tự quyết định có merge vào `main` hay không. Chưa push.

## Nhịp làm việc (bắt buộc)

Mỗi phần: làm theo quy trình `.claude/rules/feature-workflow.md` (đọc → spec → code + test → docs) → **kiểm tra toàn bộ** → commit trên nhánh → báo cáo tóm tắt → **chờ người dùng xác nhận** rồi mới sang phần kế tiếp.

Kiểm tra toàn bộ sau mỗi phần (phải qua cả, và sau mỗi thay đổi đáng kể trong phần):
`npx tsc --noEmit` · `yarn lint` (không thêm cảnh báo; hiện có 5 cảnh báo cũ trong `src`) · `yarn test` (hiện 729 test) · `yarn test:flows` chạy ≥ 3 lần liên tiếp (hiện 11 test) · `npx nest build`. Sau khi commit: `git status` sạch.

Báo cáo mỗi phần: đã đổi gì (file), số liệu trước/sau, pattern/nguyên lý đã áp dụng và vì sao, docs/spec/test đã cập nhật, điều cần lưu ý, phần kế tiếp.

## Các phần

| # | Phần | Trạng thái |
|---|---|---|
| 1 | Tạo nhánh, mang code đang dở của `main` sang, quy trình (rules/skills), khung flow test + 11 flow đặt hàng–thanh toán–hoàn tiền, docs/spec/test matrix | Xong (4 commit) |
| 2 | P0-1: test hermetic (chặn mạng, env dịch vụ ngoài rỗng) + `routes.ts` tự phát hiện route + snapshot bảng route–quyền | Xong |
| 3 | P0-2: ma trận auth/quyền cho mọi route (401 các kiểu, 403, đủ quyền, admin, public) + invariants | Xong |
| 4 | P0-3: recorder độ phủ + `coverage-report.ts` + `coverage-baseline.json` (ratchet) + nối vào `yarn test:flows`; P0-4: đóng spec 0002 | Xong |
| 5 | Xoá code chết ở `common/` (`BaseValidate.ts`, `helper.ts`, `transform.ts`, `types/baseType.ts`, phần không dùng của `base.interface.ts`, `IBaseEntity`); giữ `ApiEndpoint` vì skill `.agent` quy định dùng | Xong |
| 6 | Quy ước được máy ép: test kiến trúc (`common/` không import `modules/`, không exception thô trong service mới, không `forwardRef`, không export thừa, trần kích thước service) với allowlist chỉ co lại | Xong |
| 7 | Chuẩn hoá lỗi: exception thô → `throwAppError` + error code (order, auth, cart, address, review), theo từng module, có flow/unit bảo vệ | Xong |
| 8 | Trạng thái: `as const` + type union cho `orders.status`/`payment_status`/`products.status`/`users.status`; bảng chuyển trạng thái của đơn có kiểu chặt (không có helper chung: return kiểm theo hành động, xem spec order/0001) | Xong |
| 9 | Gom khoá dòng: `findLocked` thay 25 literal (không có wrapper `withLock` chung vì các khung khác nhau, xem spec common/0004), hợp đồng khoá + flow song song | Xong |
| 10 | Tách `OrderService` thành `OrderQueryService`, `OrderCheckoutService`, `OrderStatusService` (di chuyển nguyên văn, có flow đặc tả truy vấn viết trước) | Xong |
| 11 | Ranh giới module: bỏ việc module khác với tay vào bảng `orders`/`products` (qua service export) — thiết kế trong spec, quyết định cùng người dùng | Chưa làm |
| 12+ | Chiến dịch test toàn diện: 25 batch theo `test/PROGRESS.md` (nhóm theo module, mỗi lần một batch). Thứ tự đã đổi: làm trước Phần 11 để có lưới an toàn | Đang làm (batch 01–21/25 xong; payment, order, return, cart, review, product, category, collection, address, wishlist, auth và user hoàn tất) |
| Cuối | Đối chiếu toàn bộ docs/spec/test matrix với code, chạy kiểm tra toàn bộ, báo cáo tổng kết | Chưa làm |

Thứ tự phần 5–11 có thể đổi theo ý người dùng. Phần 7–11 đụng code production nên mỗi phần có spec riêng ở `docs/specs/<module>/` và cần người dùng duyệt thiết kế trước khi code.
