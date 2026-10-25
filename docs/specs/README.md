# Tech spec

Tài liệu thiết kế **viết trước khi code**: vì sao làm, các phương án, kiến trúc, design pattern, kiểm tra SOLID, kế hoạch test. Khác với `docs/modules/` (hiện trạng, viết sau khi code).

Luật: `.claude/rules/feature-workflow.md` · Cách viết: skill `tech-spec` · Template: `.claude/skills/tech-spec/TEMPLATE.md`

Cấu trúc: `docs/specs/<module>/NNNN-slug.md` (số tăng dần theo từng module). Trạng thái: Draft → Approved → Implemented (hoặc Superseded bởi NNNN). Spec Implemented là lịch sử quyết định, không sửa lại phần thiết kế; thay đổi sau này là spec mới.

## Chỉ mục

| Module | Spec | Trạng thái | Nội dung |
|---|---|---|---|
| common | [0001 — Xoá code chết ở `common/`](common/0001-remove-dead-code.md) | Implemented | Bỏ BaseValidate, helper, transform, baseType, base.interface; giữ ApiEndpoint |
| common | [0002 — Test kiến trúc, allowlist chỉ co lại](common/0002-architecture-guard-tests.md) | Implemented | Hướng phụ thuộc, vòng module, export thừa, exception thô, kích thước service |
| payment | [0001 — Kế hoạch flow test cho module payment](payment/0001-flow-test-plan.md) | Implemented | Phủ ca thành công và ca lỗi cho 12 route payment theo batch |
| order | [0003 — Kế hoạch flow test cho module order](order/0003-flow-test-plan.md) | Implemented | Báo giá, đặt hàng, danh sách/chi tiết/đổi trạng thái admin: 8/8 route đủ ca |
| return | [0001 — Kế hoạch flow test cho module return](return/0001-flow-test-plan.md) | Implemented | Điều kiện, tạo, huỷ, duyệt, từ chối, nhận hàng và liên kết khoản hoàn: 10/10 route đủ ca |
| cart | [0002 — Giới hạn số lượng một dòng giỏ](cart/0002-quantity-limit-and-atomic-add.md) | Implemented | Lỗi 2004 khi vượt 99, cộng dồn nguyên tử |
| cart | [0001 — Kế hoạch flow test cho module cart](cart/0001-flow-test-plan.md) | Implemented | Xem, thêm, đổi số lượng, xoá dòng, xoá sạch: 5/5 route đủ ca; 2 phát hiện 500 chờ quyết định |
| media | [0001 — Kế hoạch flow test cho module media](media/0001-flow-test-plan.md) | Implemented | Ping, danh sách, upload, xoá với Storage giả ở biên: 4/4 route đủ ca |
| pending-count | [0001 — Kế hoạch flow test cho module pending-count](pending-count/0001-flow-test-plan.md) | Implemented | Số việc chờ theo quyền, khớp danh sách |
| common | [0010 — Giới hạn tần suất request](common/0010-rate-limiting.md) | Implemented | `@nestjs/throttler`, mặc định 120/phút, auth 10, upload 20, bỏ qua webhook/health, `TRUST_PROXY` |
| common | [0009 — Từ chối khởi động khi cấu hình production sai](common/0009-fail-fast-env-validation.md) | Implemented | `validateEnv` cho `ConfigModule`: JWT secret, DB, CORS, Google, SePay |
| common | [0008 — Lỗi toàn vẹn của DB trả mã lỗi đúng](common/0008-db-integrity-errors.md) | Implemented | Ánh xạ theo tên constraint, idempotent khi thua cuộc đua, lưới an toàn ở filter |
| common | [0007 — Cập nhật một phần an toàn (`PATCH`)](common/0007-safe-partial-update.md) | Implemented | `useDefineForClassFields: false`, `Update*Dto` = `PartialType(Create*Dto)`, quy ước `null` |
| common | [0006 — Ranh giới ghi giữa các module](common/0006-module-boundaries.md) | Implemented | 4 nhóm ghi chéo module → hàm của module chủ nhận `EntityManager` + luật máy chặn ghi chéo mới |
| common | [0005 — Kế hoạch flow test cho health](common/0005-health-flow-test-plan.md) | Implemented | `GET /` và `GET /health` |
| site-config | [0001 — Kế hoạch flow test cho module site-config](site-config/0001-flow-test-plan.md) | Implemented | Registry key, đặt/xoá cấu hình, chuẩn hoá và hiệu lực tức thời: 5/5 route đủ ca |
| shipping | [0001 — Kế hoạch flow test cho module shipping](shipping/0001-flow-test-plan.md) | Implemented | `GET /api/shipping` theo cấu hình admin, kiểm chéo với báo giá và hạn đổi trả |
| size-guide | [0001 — Kế hoạch flow test cho module size-guide](size-guide/0001-flow-test-plan.md) | Implemented | Bảng size tĩnh theo nhóm |
| auth | [0002 — Từ chối đăng nhập của user bị khoá](auth/0002-disabled-user-login.md) | Implemented | 403 / 2203 |
| auth | [0001 — Kế hoạch flow test cho module auth](auth/0001-flow-test-plan.md) | Implemented | Đăng nhập Google (giả ở biên), refresh, me, permissions: 4/4 route đủ ca; 2 phát hiện chờ quyết định |
| user | [0002 — Chỉ nhận mã permission có thật](user/0002-validate-permission-codes.md) | Implemented | `IsIn` + `ArrayUnique` |
| user | [0001 — Kế hoạch flow test cho module user](user/0001-flow-test-plan.md) | Implemented | Danh sách, chi tiết, sửa quyền/trạng thái: 3/3 route đủ ca; 1 phát hiện chờ quyết định |
| wishlist | [0001 — Kế hoạch flow test cho module wishlist](wishlist/0001-flow-test-plan.md) | Implemented | Thêm, danh sách, kiểm tra, bỏ: 4/4 route đủ ca; 1 phát hiện chờ quyết định |
| address | [0001 — Kế hoạch flow test cho module address](address/0001-flow-test-plan.md) | Implemented | Danh sách, tạo, sửa, xoá và cờ mặc định: 4/4 route đủ ca; 1 phát hiện chờ quyết định |
| collection | [0001 — Kế hoạch flow test cho module collection](collection/0001-flow-test-plan.md) | Implemented | Đọc công khai/admin, tạo, sửa, xoá: 5/5 route đủ ca; 2 phát hiện chờ quyết định |
| category | [0001 — Kế hoạch flow test cho module category](category/0001-flow-test-plan.md) | Implemented | Đọc công khai/admin, tạo, sửa, xoá, reorder và bất biến thứ hạng: 6/6 route đủ ca; 1 phát hiện chờ quyết định |
| product | [0001 — Kế hoạch flow test cho module product](product/0001-flow-test-plan.md) | Implemented | Đọc công khai, autocomplete, danh sách/tạo/sửa/xoá admin: 7/7 route đủ ca; 5 phát hiện chờ quyết định |
| review | [0001 — Kế hoạch flow test cho module review](review/0001-flow-test-plan.md) | Implemented | Đọc công khai, viết, sửa, vote, upload ảnh, kiểm duyệt, phản hồi: 16/16 route đủ ca |
| product | [0002 — Tách `ProductService` thành đọc và ghi](product/0002-split-product-service.md) | Implemented | ProductQueryService + ProductService; allowlist kích thước service về rỗng |
| category | [0002 — Tách `CategoryService` thành đọc và ghi](category/0002-split-category-service.md) | Implemented | CategoryQueryService + CategoryService |
| media | [0002 — Tách logic thuần của ảnh khỏi `MediaService`](media/0002-extract-media-file-util.md) | Implemented | media-file.util: sniff mime, tên key, tên hiển thị |
| return | [0003 — `return` chia cell: request, processing](return/0003-return-cells.md) | Implemented | 2 cell + shared, 4 service |
| order | [0004 — `order` chia cell: checkout, status, query](order/0004-order-cells.md) | Implemented | 3 cell + shared, cạnh status → query |
| common | [0012 — Cell phụ thuộc cell: khai báo tường minh](common/0012-declared-cell-dependencies.md) | Implemented | CELL_DEPENDENCIES, không vòng, không cạnh chết |
| payment | [0004 — `payment` chia cell, `refund` thành module riêng](payment/0004-payment-cells-and-refund-module.md) | Implemented | attempt/transaction/order-payments/sepay/shared + RefundModule |
| common | [0011 — Quy ước cell](common/0011-module-cells.md) | Implemented | module lớn chia thư mục chức năng, test kiến trúc ép |
| payment | [0003 — Tách `RefundService` thành đọc và ghi](payment/0003-split-refund-service.md) | Implemented | RefundQueryService + RefundService |
| return | [0002 — Tách `ReturnService` thành đọc và ghi](return/0002-split-return-service.md) | Implemented | ReturnQueryService + ReturnService + activeReturnQuantities |
| payment | [0002 — Tách `PaymentService` theo use case](payment/0002-split-payment-service.md) | Implemented | PaymentService (QR) + PaymentConfirmService + PaymentQueryService + assertOrderPayable |
| review | [0002 — Tách `ReviewService` thành đọc và ghi](review/0002-split-review-service.md) | Implemented | ReviewQueryService + ReviewService + review-view.util |
| order | [0002 — Tách `OrderService` theo use case](order/0002-split-order-service.md) | Implemented | OrderQueryService, OrderCheckoutService, OrderStatusService; di chuyển nguyên văn, có flow đặc tả truy vấn |
| order | [0001 — Trạng thái có kiểu và bảng chuyển trạng thái của đơn](order/0001-typed-statuses-and-order-transitions.md) | Implemented | Type union cho Order/Product/User status, ORDER_TRANSITIONS có kiểu chặt, luật kiến trúc cho cột status |
| common | [0004 — Một chỗ duy nhất cho khoá dòng (`findLocked`)](common/0004-locked-row-helper.md) | Implemented | Thay 25 literal khoá, luật kiến trúc, hợp đồng khoá và flow song song |
| common | [0003 — Chuẩn hoá lỗi: exception thô → throwAppError](common/0003-standardize-error-handling.md) | Implemented | 27 chỗ ở 6 service, 15 mã lỗi mới (order, review, cart, address, auth) |
| testing | [0001 — Khung flow test chạy trên Postgres thật](testing/0001-flow-test-infrastructure.md) | Implemented | Postgres docker, schema từ migration, boot app thật, builder, webhook ký sẵn, test matrix |
| testing | [0002 — Ma trận auth/quyền tự phát hiện và đo độ phủ endpoint](testing/0002-access-matrix-and-endpoint-coverage.md) | Implemented | Tự phát hiện route, snapshot quyền, ma trận 401/403, đo độ phủ có ratchet |
| testing | [0003 — Cấu hình flow test ở `.env.test`](testing/0003-flow-test-config-file.md) | Implemented | Một file ở root cho cả docker-compose và jest; cấu hình sai báo lỗi sớm |
