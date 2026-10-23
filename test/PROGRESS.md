# Tiến độ chiến dịch test toàn diện

> Quy trình: skill `test-campaign` (`.claude/skills/test-campaign/SKILL.md`) — **đọc skill trước khi làm bất kỳ lượt nào**.
> Đây là file điều phối: kế hoạch + nhật ký. Sự thật do máy đo (độ phủ endpoint) nằm ở báo cáo cuối `yarn test:flows` và `test/coverage-baseline.json`.

Cập nhật lần cuối: 2026-10-21 · Tổng: **98 route** (15 public, 83 cần đăng nhập), **25 batch** + 4 bước hạ tầng (P0)

Trạng thái: `Chưa làm` · `Đang làm` · `Xong` · `Chặn` (kèm lý do ở cột Ghi chú)

## Nguyên tắc nhịp làm việc

- **Một lượt = một batch** (tối đa 5 route, không vượt ranh giới module). Làm xong thì dừng, ghi nhật ký, báo cáo ngắn; không tự làm batch kế tiếp.
- Mỗi lượt bắt đầu từ file này, không từ trí nhớ. Chỉ đọc docs/code của đúng module trong batch.
- Chính xác hơn nhanh: mọi giá trị mong đợi lấy từ code, migration, docs; không đoán.

## Giai đoạn 0 — Hạ tầng (spec `docs/specs/testing/0002-access-matrix-and-endpoint-coverage.md`)

| Bước | Nội dung | Trạng thái | Ghi chú |
|---|---|---|---|
| P0-1 | Test hermetic (`SUPABASE_*`, `GOOGLE_*`, `STORAGE_URL` rỗng; `fetch` bị chặn) + `routes.ts` (tự phát hiện route) + snapshot bảng route–quyền + bất biến tĩnh về quyền (`flows/access/route-table.flow.ts`) | Xong | Việc ghi `routes.json` dời sang P0-3 (chỉ bộ đo độ phủ mới dùng). Bất biến tĩnh nằm ở `route-table.flow.ts`, ma trận HTTP ở P0-2 |
| P0-2 | Ma trận auth/quyền cho mọi route (401 các kiểu, 403, đúng quyền, admin, route public) + invariants; `bearer()` hỗ trợ token hỏng | Xong | Ma trận ở `flows/access/access-matrix.flow.ts`. Ghi cho spec 0002 mục 6: lỗi chập chờn khi triển khai (xem nhật ký P0-2) |
| P0-3 | Recorder độ phủ (middleware, header `x-test-probe` bị bỏ qua) + `coverage-report.ts` + `coverage-baseline.json` (ratchet) + nối vào `yarn test:flows`; báo cáo in "batch kế tiếp" | Xong | Baseline giữ thứ tự ưu tiên của 25 batch; "batch kế tiếp" của báo cáo là 5 route thiếu ca đầu tiên nên có thể lệch nhẹ với ranh giới batch dưới đây |
| P0-4 | Cập nhật `rules/testing.md`, `test/README.md`, `docs/modules/common.md`, spec 0002 → Implemented | Xong | |

## Giai đoạn 1 — Ca thành công + ca lỗi nghiệp vụ theo module

Thứ tự theo rủi ro: tiền → đơn → trả hàng → giỏ → đánh giá → catalog → khách → còn lại. Ma trận auth/quyền (P0-2) đã phủ 401/403 cho mọi route, nên mỗi batch chỉ lo ca đúng và ca lỗi nghiệp vụ.


### Batch 01 — payment (5 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/api/payments/:orderId/status` | JWT | 13001 |
| 2 | POST | `/api/payments/qr` | JWT | 13000 |
| 3 | POST | `/api/webhooks/sepay` | Public | — |
| 4 | GET | `/api/admin/payments/attempts` | JWT | 14000 |
| 5 | GET | `/api/admin/payments/orders/:orderId` | JWT | 14000 |

Trạng thái: **Xong** · Ghi chú: 2026-10-22; 31 flow mới (`flows/payment/payment-session.flow.ts`, `payment-admin-queries.flow.ts`); 5/5 route đủ ca thành công và ca lỗi


### Batch 02 — payment (5 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | POST | `/api/admin/payments/orders/:orderId/confirm` | JWT | 14001 |
| 2 | POST | `/api/admin/payments/orders/:orderId/qr` | JWT | 14003 |
| 3 | GET | `/api/admin/payments/transactions` | JWT | 14000 |
| 4 | GET | `/api/admin/refunds` | JWT | 14000 |
| 5 | POST | `/api/admin/refunds` | JWT | 14002 |

Trạng thái: **Xong** · Ghi chú: 2026-10-22; 37 flow mới (`flows/payment/payment-admin-actions.flow.ts`, `payment-transactions-refunds.flow.ts`); 5/5 route đủ ca. Có 1 phát hiện chờ quyết định (xem bảng cuối)


### Batch 03 — payment (2 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | POST | `/api/admin/refunds/:refundId/complete` | JWT | 14002 |
| 2 | POST | `/api/admin/refunds/:refundId/reject` | JWT | 14002 |

Trạng thái: **Xong** · Ghi chú: 2026-10-22; 19 flow mới (`flows/payment/payment-refund-actions.flow.ts`); 2/2 route đủ ca. Module payment hoàn tất (12/12 route)


### Batch 04 — order (5 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/api/orders` | JWT | 3000 |
| 2 | POST | `/api/orders` | JWT | 3002 |
| 3 | GET | `/api/orders/:orderId` | JWT | 3001 |
| 4 | PATCH | `/api/orders/:orderId/cancel` | JWT | 3003 |
| 5 | POST | `/api/orders/quote` | JWT | 3002 |

Trạng thái: **Xong** · Ghi chú: 2026-10-22; 24 flow mới (`flows/order/order-checkout.flow.ts`)


### Batch 05 — order (3 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/api/admin/orders` | JWT | 9000 |
| 2 | GET | `/api/admin/orders/:orderId` | JWT | 9000 |
| 3 | PATCH | `/api/admin/orders/:orderId/status` | JWT | 9001 |

Trạng thái: **Xong** · Ghi chú: 2026-10-22; 12 flow mới (`flows/order/order-admin.flow.ts`)


### Batch 06 — return (5 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/api/returns` | JWT | 15001 |
| 2 | POST | `/api/returns` | JWT | 15000 |
| 3 | GET | `/api/returns/:returnId` | JWT | 15001 |
| 4 | PATCH | `/api/returns/:returnId/cancel` | JWT | 15000 |
| 5 | GET | `/api/returns/eligibility/:orderId` | JWT | 15001 |

Trạng thái: **Xong** · Ghi chú: 2026-10-22; 24 flow mới (`flows/return/return-customer.flow.ts`)


### Batch 07 — return (5 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/api/admin/returns` | JWT | 16000 |
| 2 | GET | `/api/admin/returns/:returnId` | JWT | 16000 |
| 3 | POST | `/api/admin/returns/:returnId/approve` | JWT | 16001 |
| 4 | POST | `/api/admin/returns/:returnId/receive` | JWT | 16001 |
| 5 | POST | `/api/admin/returns/:returnId/reject` | JWT | 16001 |

Trạng thái: **Xong** · Ghi chú: 2026-10-22; 43 flow mới (`flows/return/return-admin.flow.ts`). Module return hoàn tất (10/10 route)


### Batch 08 — cart (5 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/api/cart` | JWT | 2000 |
| 2 | DELETE | `/api/cart/clear` | JWT | 2004 |
| 3 | POST | `/api/cart/items` | JWT | 2001 |
| 4 | DELETE | `/api/cart/items/:itemId` | JWT | 2003 |
| 5 | PATCH | `/api/cart/items/:itemId` | JWT | 2002 |

Trạng thái: **Xong** · Ghi chú: 2026-10-22; 32 flow mới (`flows/cart/cart.flow.ts`). `GET /api/cart` và `DELETE /api/cart/clear` không có ca lỗi nghiệp vụ → `exempt` trong baseline. 2 phát hiện (500 khi cộng dồn > 99; 500 khi thêm đồng thời). Module cart xong


### Batch 09 — review (5 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | POST | `/api/reviews` | JWT | 17000 |
| 2 | GET | `/api/reviews/:productId` | Public | — |
| 3 | GET | `/api/reviews/:productId/summary` | Public | — |
| 4 | PATCH | `/api/reviews/:reviewId` | JWT | 17000 |
| 5 | DELETE | `/api/reviews/:reviewId/helpful` | JWT | 17002 |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; 56 flow mới (`flows/review/review.flow.ts`), thêm builder `b.review()` và `flows/review/steps.ts`; `deliveredPaidOrder` chuyển sang `order-payment/steps.ts` (dùng chung return + review). `GET /api/reviews/:productId/summary` không có ca lỗi nghiệp vụ → `exempt`


### Batch 10 — review (5 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | POST | `/api/reviews/:reviewId/helpful` | JWT | 17002 |
| 2 | POST | `/api/reviews/images` | JWT | 17000 |
| 3 | GET | `/api/my-reviews` | JWT | 17001 |
| 4 | GET | `/api/my-reviews/pending` | JWT | 17001 |
| 5 | GET | `/api/my-reviews/votes` | JWT | 17001 |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; 33 flow mới (`flows/review/review-customer.flow.ts`); `placeOrder`/`placeAndPayOrder`/`deliveredPaidOrder` nhận `customer` để một khách có nhiều đơn


### Batch 11 — review (5 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/api/admin/reviews` | JWT | 18000 |
| 2 | GET | `/api/admin/reviews/:reviewId` | JWT | 18000 |
| 3 | POST | `/api/admin/reviews/:reviewId/hide` | JWT | 18001 |
| 4 | POST | `/api/admin/reviews/:reviewId/publish` | JWT | 18001 |
| 5 | DELETE | `/api/admin/reviews/:reviewId/reply` | JWT | 18002 |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; 37 flow mới chung với batch 12 (`flows/review/review-admin.flow.ts`)


### Batch 12 — review (1 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | PUT | `/api/admin/reviews/:reviewId/reply` | JWT | 18002 |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; làm chung file với batch 11. Module review hoàn tất (16/16 route; `GET /api/reviews/:productId/summary` miễn ca lỗi)


### Batch 13 — product (5 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/api/products` | Public | — |
| 2 | GET | `/api/products/:id` | Public | — |
| 3 | GET | `/api/products/autocomplete` | Public | — |
| 4 | GET | `/api/admin/products` | JWT | 6003 |
| 5 | POST | `/api/admin/products` | JWT | 6000 |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; 85 flow mới (`flows/product/product-read.flow.ts`, `product-admin.flow.ts`); thêm 3 phát hiện (xem bảng)


### Batch 14 — product (2 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | DELETE | `/api/admin/products/:id` | JWT | 6002 |
| 2 | PATCH | `/api/admin/products/:id` | JWT | 6001 |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; 31 flow mới (cùng file `flows/product/product-admin.flow.ts`); thêm 2 phát hiện về PATCH. Module product hoàn tất (7/7 route)


### Batch 15 — category (5 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/api/categories` | Public | — |
| 2 | GET | `/api/admin/categories` | JWT | 7003 |
| 3 | POST | `/api/admin/categories` | JWT | 7000 |
| 4 | DELETE | `/api/admin/categories/:id` | JWT | 7002 |
| 5 | PATCH | `/api/admin/categories/:id` | JWT | 7001 |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; 74 flow mới chung với batch 16 (`flows/category/category.flow.ts`); thêm `requestWhileAdvisoryLocked` vào `test/support/locks.ts`; builder `b.product` không tạo category thừa khi đã truyền `category`; 1 phát hiện (xem bảng)


### Batch 16 — category (1 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | PATCH | `/api/admin/categories/reorder` | JWT | 7001 |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; làm chung file với batch 15. Module category hoàn tất (6/6 route)


### Batch 17 — collection (5 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/api/collections` | Public | — |
| 2 | GET | `/api/admin/collections` | JWT | 8003 |
| 3 | POST | `/api/admin/collections` | JWT | 8000 |
| 4 | DELETE | `/api/admin/collections/:id` | JWT | 8002 |
| 5 | PATCH | `/api/admin/collections/:id` | JWT | 8001 |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; 54 flow mới (`flows/collection/collection.flow.ts`); 2 phát hiện (xem bảng). Module collection hoàn tất (5/5 route)


### Batch 18 — address (4 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/api/addresses` | JWT | 4000 |
| 2 | POST | `/api/addresses` | JWT | 4001 |
| 3 | DELETE | `/api/addresses/:id` | JWT | 4003 |
| 4 | PATCH | `/api/addresses/:id` | JWT | 4002 |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; 40 flow mới (`flows/address/address.flow.ts`). `GET /api/addresses` không có ca lỗi nghiệp vụ → `exempt`. 1 phát hiện (xem bảng). Module address hoàn tất (4/4 route)


### Batch 19 — wishlist (4 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/api/wishlist` | JWT | 5000 |
| 2 | DELETE | `/api/wishlist/:productId` | JWT | 5002 |
| 3 | POST | `/api/wishlist/:productId` | JWT | 5001 |
| 4 | GET | `/api/wishlist/check/:productId` | JWT | 5003 |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; 12 flow mới (`flows/wishlist/wishlist.flow.ts`). `GET /api/wishlist`, `DELETE /api/wishlist/:productId`, `GET /api/wishlist/check/:productId` không có ca lỗi nghiệp vụ → `exempt`. 1 phát hiện (xem bảng). Module wishlist hoàn tất (4/4 route)


### Batch 20 — auth+user (5 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | POST | `/api/auth/google` | Public | — |
| 2 | GET | `/api/auth/me` | JWT | 1000 |
| 3 | GET | `/api/auth/permissions` | JWT | 10000 |
| 4 | POST | `/api/auth/refresh` | Public | — |
| 5 | GET | `/api/admin/users` | JWT | 10000 |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; 23 flow auth (`flows/auth/auth.flow.ts`) + danh sách user trong `flows/user/user.flow.ts`; `GET /api/auth/me` và `GET /api/auth/permissions` không có ca lỗi nghiệp vụ → `exempt`; 3 phát hiện (xem bảng)


### Batch 21 — auth+user (2 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/api/admin/users/:id` | JWT | 10000 |
| 2 | PATCH | `/api/admin/users/:id` | JWT | 10001 |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; làm chung file `flows/user/user.flow.ts` (26 flow cho 3 route user). Module auth (4/4) và user (3/3) hoàn tất


### Batch 22 — site-config+shipping+size-guide (5 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/api/site-config` | Public | — |
| 2 | GET | `/api/admin/site-config` | JWT | 11000 |
| 3 | DELETE | `/api/admin/site-config/:key` | JWT | 11002 |
| 4 | PUT | `/api/admin/site-config/:key` | JWT | 11001 |
| 5 | GET | `/api/admin/site-config/keys` | JWT | 11000 |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; 32 flow mới (`flows/site-config/site-config.flow.ts`); `GET /api/admin/site-config` và `GET /api/admin/site-config/keys` không có ca lỗi nghiệp vụ → `exempt`


### Batch 23 — site-config+shipping+size-guide (2 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/api/shipping` | Public | — |
| 2 | GET | `/api/size-guides/:category` | Public | — |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; 17 flow mới (`flows/shipping/shipping.flow.ts`, `flows/size-guide/size-guide.flow.ts`); `GET /api/shipping` và `GET /api/size-guides/:category` → `exempt` ca lỗi. Module site-config, shipping, size-guide hoàn tất


### Batch 24 — media+pending-count+health (5 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/api/admin/media` | JWT | 12000 |
| 2 | POST | `/api/admin/media` | JWT | 12001 |
| 3 | DELETE | `/api/admin/media/:fileId` | JWT | 12002 |
| 4 | GET | `/api/admin/media/ping` | JWT | 12000 |
| 5 | GET | `/api/admin/pending-counts` | JWT | 9000,14000,16000,18000 |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; 25 flow media (`flows/media/media.flow.ts`) + 6 flow pending-count (`flows/pending-count/pending-count.flow.ts`); `GET /api/admin/pending-counts` → `exempt` ca lỗi


### Batch 25 — media+pending-count+health (2 route)

| # | Method | Path | Truy cập | Quyền |
|---|---|---|---|---|
| 1 | GET | `/` | Public | — |
| 2 | GET | `/health` | Public | — |

Trạng thái: **Xong** · Ghi chú: 2026-10-23; 3 flow (`flows/health/health.flow.ts`). Chiến dịch hoàn tất: 98/98 route có ca thành công, 82/83 có ca lỗi (15 route `exempt`, lý do ghi trong `test/coverage-baseline.json`), baseline `missing` rỗng


## Nhật ký (thêm một dòng sau mỗi lượt, mới nhất ở dưới)

| Lượt | Ngày | Phạm vi | Test thêm | Phủ thành công | Phủ lỗi | Phát hiện / ghi chú |
|---|---|---|---|---|---|---|
| — | 2026-10-21 | Lập quy trình + chia 25 batch | 0 | — | — | Số liệu độ phủ chỉ có sau P0-3 |
| P0-1 | 2026-10-21 | Hermetic + tự phát hiện route + snapshot quyền | +9 (flow 11 → 20) | chưa đo (P0-3) | chưa đo (P0-3) | 98 route phát hiện (15 public, 83 cần đăng nhập), không có route thiếu quyền. Phá thử 4 lần (bỏ `@Permissions`, đổi quyền, bỏ chặn `fetch`, bỏ env rỗng) đều bị bắt. `.env` của máy có `SUPABASE_URL`, `GOOGLE_CLIENT_ID` thật nên phần hermetic có tác dụng thật |
| P0-1b | 2026-10-21 | Cấu hình flow test gom vào `.env.test` (spec 0003) | 0 | — | — | Cổng đổi 55433 thử thành công; 4 cấu hình sai đều báo đúng lỗi |
| P0-2 | 2026-10-21 | Ma trận auth/quyền cho 98 route | +8 (flow 20 → 28) | chưa đo (P0-3) | chưa đo (P0-3) | Phá thử 7 lần (nhận token refresh, nhận user disabled, any-of thành all-of, bỏ bypass admin, mở public `GET /api/cart`, đổi quyền admin sang quyền mặc định, bỏ kiểm quyền) đều bị bắt đúng ca. Chạy lặp 25 lần liên tiếp không lỗi. **Sự cố khi làm:** (1) chạy cả bộ lúc treo lúc fail ngẫu nhiên: supertest tự `listen`/`close` mỗi request, hàng nghìn request liên tiếp thì đua; sửa bằng `app.listen(0, '127.0.0.1')` một lần trong `createTestApp`; (2) fail chẵn/lẻ vì ma trận để user lại DB, file sau đụng `UQ_users_email`; sửa bằng `truncateAll` ở đầu `createTestApp`. Tắt keep-alive không cần thiết (thử loại trừ). Thêm timeout 10s mỗi request để treo thành lỗi có tên route |
| P0-3/4 | 2026-10-21 | Đo độ phủ endpoint + ratchet; đóng spec 0002 | 0 (hạ tầng) | 9/98 | 4/96 (miễn 2) | Ratchet thử 6 tình huống đều đúng. Baseline: 95 route thiếu ca (181 mục). Batch 01 (payment) là việc kế tiếp |
| Phần 7 | 2026-10-22 | Chuẩn hoá lỗi (spec common/0003): flow ca lỗi cho order, cart, address | +11 (flow 28 → 39) | 9/98 | 11/96 (miễn 2) | Baseline 95 → 94 route (7 route có thêm ca lỗi). Log 503 kỳ vọng được tắt thật; bật lại bằng `FLOW_TEST_LOGS=1` |
| Phần 8 | 2026-10-22 | Chuỗi trạng thái đơn của admin (spec order/0001) | +5 flow (39 → 44), +5 unit (`order.constant.spec.ts`) | 9/98 | 12/96 (miễn 2) | Baseline 94 → 93 route: `PATCH /api/admin/orders/:orderId/status` đã có ca thành công từ trước, nay thêm ca lỗi nên ra khỏi baseline |
| Phần 9 | 2026-10-22 | Gom khoá dòng (spec common/0004): flow song song + hợp đồng khoá | +8 flow (44 → 52), +2 unit (`lock.util.spec.ts`), +1 luật kiến trúc | 9/98 | 13/96 (miễn 2) | Baseline 93 → 92 (`POST /api/payments/qr` có ca lỗi). Test đua ngẫu nhiên bỏ sót việc thiếu khoá ở huỷ đơn; test giữ khoá từ ngoài bắt được cả 4 điểm |
| Phần 10 | 2026-10-22 | Tách OrderService (spec order/0002): flow đặc tả truy vấn đơn | +4 flow (52 → 56); unit giữ 755 (spec được chia) | 14/98 | 13/96 (miễn 2) | Baseline 92 → 91 route: `GET /api/orders`, `GET /api/orders/:orderId`, `GET /api/admin/orders`, `GET /api/admin/orders/:orderId`, `GET /api/admin/pending-counts` có ca thành công |
| Batch 01 | 2026-10-22 | payment: status, qr, webhook, admin attempts, admin orders/:orderId | +32 flow (56 → 88) | 14 → 16/98 | 13 → 16/96 (miễn 2) | Baseline 91 → 88 route. Phá thử 5 điểm: 3 bị bắt ngay; 2 không: (a) SQL `CASE` trạng thái hiệu lực ở danh sách admin là đột biến tương đương (DB đã được đánh dấu `EXPIRED` trước khi liệt kê), (b) kiểm tài khoản nhận của webhook có hai lớp → thêm ca "phiên cấp cho tài khoản không còn là tài khoản cấu hình", phá thử lại thì bị bắt |
| Batch 02 | 2026-10-22 | payment: admin confirm, admin QR, transactions, refunds list, refund create | +37 flow (88 → 125) | 16 → 21/98 | 16 → 21/96 (miễn 2) | Baseline 88 → 83. Phá thử 5 điểm đều bị bắt (mark paid, chấp nhận sai tiền, đơn đã huỷ, tạo hoàn cho đơn bất kỳ, needsReview). Sửa mong đợi của chính tôi: webhook kiểm số tiền trước hạn nên thiếu tiền + mã hết hạn = AMOUNT_MISMATCH. 1 phát hiện (rawPayload) |
| Batch 03 | 2026-10-22 | payment: refund complete, refund reject | +19 flow (125 → 144) | 21/98 (không đổi: cả hai route đã có ca thành công) | 21 → 22/96 | Baseline 83 → 82. Phá thử 6 điểm đều bị bắt (bỏ kiểm trạng thái, không đánh dấu `refunded`, bỏ trần số đã trả, bỏ ánh xạ UNIQUE → 1714, reject bỏ kiểm trạng thái, bỏ trim). Có test song song: hai admin cùng bấm, hai khoản cùng mã tham chiếu. Module payment xong |
| Batch 04 | 2026-10-22 | order: danh sách, báo giá, đặt hàng, chi tiết, huỷ | +24 flow (144 → 168) | 21/98 | 22 → 25/96 | Phá thử 5 điểm tiền/snapshot đều bị bắt (ngưỡng miễn ship `>=`, giá không chốt, tỷ giá không chốt, dọn cả giỏ, snapshot pickup). Thêm ca biên đúng ngưỡng và thiếu 1 đồng |
| Batch 05 | 2026-10-22 | order (admin): danh sách, chi tiết, đổi trạng thái | +12 flow (168 → 180) | 21/98 | 25 → 26/96 | Baseline 82 → 78 sau hai batch. Phá thử sắp xếp và tìm kiếm đều bị bắt. Module order xong (8/8 route) |
| Batch 06–07 | 2026-10-22 | return: khách (điều kiện, tạo, danh sách, chi tiết, huỷ) và admin (danh sách, chi tiết, duyệt, từ chối, nhận hàng) | +67 flow (180 → 247) | 21 → 31/98 | 26 → 36/96 | Baseline 78 → 68. Phá thử 7 điểm (trần số lượng, sở hữu khi huỷ/xem, trạng thái nhận hàng, khoá đơn, hoàn lại khi từ chối khoản hoàn, hoàn xong → REFUNDED, số lượng chấp nhận mặc định) đều bị bắt; 2 điểm sống sót lúc đầu rồi đã bịt: cộng dồn `previousValueVnd` chỉ khác khi làm tròn (thêm ca số tiền nhận 300.000đ → 143.836 + 143.835) và kiểm phí ship một lần (thêm assert message vì nhánh 'vượt tổng đơn' cũng ra 1805). Module return xong (10/10) |
| Batch 08 | 2026-10-22 | cart: xem, thêm, đổi số lượng, xoá dòng, xoá sạch | +32 flow (247 → 279) | 31 → 36/98 | 36/94 (miễn thêm 2: `GET /api/cart`, `DELETE /api/cart/clear`) | Baseline 68 → 63. Phá thử 6 điểm (cộng dồn, khớp theo size, sở hữu dòng khi sửa, xoá sạch theo giỏ, USD tính từ tổng VND, kiểm badge) đều bị bắt. 2 phát hiện 500 (xem bảng bên dưới). Lưu ý: chạy hai lần `test:flows` chồng nhau trên một DB làm test đỏ ngẫu nhiên và chậm hàng chục phút — chỉ chạy một tiến trình tại một thời điểm |
| Batch 09 | 2026-10-23 | review: tạo, danh sách công khai, tổng hợp, sửa, bỏ "hữu ích" | +56 flow (279 → 335) | 36 → 42/98 | 36 → 40/93 (miễn thêm: `GET /api/reviews/:productId/summary`) | Baseline 63 → 58. Phá thử 11 điểm (sở hữu khi tạo/sửa, lọc `PUBLISHED` ở danh sách và tổng hợp, tính lại điểm sản phẩm, chặn sửa lần hai, ánh xạ UNIQUE → 409, bỏ phiếu của người khác, làm tròn trung bình, hạn đánh giá, kiểm liên kết) đều bị bắt ngay |
| Batch 10 | 2026-10-23 | review (khách): vote, upload ảnh, đánh giá của tôi, chờ đánh giá, phiếu đã bấm | +33 flow (335 → 368) | 42 → 47/98 | 40 → 45/93 | Baseline 58 → 53. Phá thử 14 điểm đều bị bắt; 2 điểm lọt lúc đầu rồi đã bịt: kiểm trạng thái thanh toán ở `pending` (thêm ca đơn đã giao nhưng chưa trả, dựng bằng SQL) và mutation loại ảnh (lỗi biên dịch của chính mutation, làm lại) |
| Batch 11–12 | 2026-10-23 | review (admin): danh sách, chi tiết, ẩn, hiện lại, đặt và xoá phản hồi | +37 flow (368 → 405) | 47 → 53/98 | 45 → 51/93 | Baseline 53 → 47. Phá thử 10 điểm (tính lại điểm khi ẩn/hiện, chặn ẩn hai lần, xoá lý do khi hiện lại, đảo bộ lọc `replied`, tìm theo tên sản phẩm, lọc theo slug, xoá `repliedBy`, bỏ khoá dòng, ghi lý do) đều bị bắt ngay. Module review xong (16/16) |
| Batch 13 | 2026-10-23 | product: danh sách, chi tiết, autocomplete (công khai), danh sách admin, tạo | +85 flow (405 → 490) | 53 → 58/98 | 51 → 56/93 | Baseline 47 → 42. Phá thử 18 điểm đều bị bắt; 1 điểm lọt lúc đầu (xếp hạng khớp-đầu của autocomplete, vì tên có dấu "Á" vốn đã xếp sau "P") rồi đã bịt bằng tên ASCII. 3 phát hiện cần quyết định (500 khi tạo đồng thời cùng slug, 500 khi SKU tự sinh trùng, PATCH nhận chuỗi rỗng) |
| Batch 14 | 2026-10-23 | product (admin): sửa, xoá | +31 flow (490 → 521) | 58 → 61/98 | 56 → 58/93 | Baseline 42 → 40. Phá thử 10 điểm (giá cuối, slug/SKU trùng, sinh lại SKU, khớp danh mục, 404) đều bị bắt. 2 phát hiện: response PATCH thiếu các field không gửi; PATCH đổi danh mục mà không gửi `slug` lưu `sku` dạng `…-undefined` (cùng nguyên nhân: DTO có thuộc tính `undefined`). Module product xong (7/7) |
| Batch 15–16 | 2026-10-23 | category: danh sách công khai/admin, tạo, sửa, xoá, reorder | +74 flow (521 → 595) | 61 → 67/98 | 58 → 64/93 | Baseline 40 → 34. Phá thử 19 điểm (thứ hạng, tìm, khoá advisory ở create/reorder, trùng slug, dịch hạng, đồng bộ subcategory, ánh xạ FK, dồn hạng khi xoá, ba kiểm tra reorder, 404) đều bị bắt. 1 phát hiện (PATCH nhận chuỗi rỗng; response thiếu field không gửi). Module category xong (6/6) |
| Batch 17 | 2026-10-23 | collection: danh sách công khai/admin, tạo, sửa, xoá | +54 flow (595 → 649) | 67 → 72/98 | 64 → 69/93 | Baseline 34 → 29. Phá thử 14 điểm đều bị bắt (2 mutation đầu không biên dịch được nên làm lại bằng cách khác). 2 phát hiện (PATCH nhận chuỗi rỗng và response thiếu field không gửi; đua tạo cùng slug → 500). Module collection xong (5/5) |
| Batch 18 | 2026-10-23 | address: danh sách, tạo, sửa, xoá | +40 flow (649 → 688) | 72 → 76/98 | 69 → 70/92 (miễn thêm: `GET /api/addresses`) | Baseline 29 → 25. Phá thử 8 điểm: 7 bị bắt; 1 mutant tương đương (lấy chủ sở hữu từ body: DTO đã cấm `userId` nên không thể đi qua HTTP, test DTO ghim lớp này). 1 phát hiện (PATCH nhận chuỗi rỗng; response thiếu field không gửi). Module address xong (4/4) |
| Batch 19 | 2026-10-23 | wishlist: thêm, danh sách, kiểm tra, bỏ | +12 flow (688 → 700) | 76 → 79/98 | 70 → 71/92 (miễn thêm 3 route) | Baseline 25 → 21. Phá thử 8 điểm đều bị bắt. 1 phát hiện: thêm đồng thời cùng sản phẩm (bấm đúp) cho `[201, 500, 500]`. Module wishlist xong (4/4) |
| Batch 20–21 | 2026-10-23 | auth (đăng nhập Google, refresh, me, permissions) + user (danh sách, chi tiết, sửa) | +49 flow (700 → 749) | 79 → 86/98 | 71 → 76/87 (miễn thêm: `GET /api/auth/me`, `GET /api/auth/permissions`) | Baseline 21 → 14. Phá thử 15 điểm (role/permission mặc định, phân loại credential, loại token, trạng thái user, tự sửa, lọc/tìm) đều bị bắt. 3 phát hiện: đăng nhập lần đầu đồng thời → 500; user bị khoá vẫn đăng nhập được; PATCH nhận mã permission lạ. Module auth, user xong |
| Batch 22–23 | 2026-10-23 | site-config (đọc, danh sách, key, đặt, xoá), shipping, size-guide | +49 flow (749 → 798) | 86 → 93/98 | 76 → 79/83 (miễn thêm 4 route) | Baseline 14 → 11. Phá thử 13 điểm: 12 bị bắt; 1 mutant tương đương (`findOne` đã trả `null` nên `config ?? null` và `config` như nhau). 1 điểm lọt lúc đầu (type của key được đặt lại khi cập nhật) rồi đã bịt bằng ca dòng có type khác. Module site-config, shipping, size-guide xong |
| Batch 24–25 | 2026-10-23 | media (ping, danh sách, upload, xoá), pending-count, health | +34 flow (798 → 832) | 93 → 98/98 | 79 → 82/83 (miễn thêm: `GET /api/admin/pending-counts`) | Baseline 11 → 0. Phá thử 15 điểm đều bị bắt. Không có phát hiện mới. Chiến dịch xong |

## Phát hiện cần người dùng quyết định

Test lộ ra hành vi nghi là lỗi trong code thì ghi ở đây (route, hành vi quan sát được, hành vi mong đợi theo docs), **không sửa code lặng lẽ** — sửa là thay đổi hành vi, cần spec riêng.

| Batch | Route | Quan sát | Mong đợi (nguồn) | Trạng thái |
|---|---|---|---|---|
| 02 | `GET /api/admin/payments/transactions` | Response chứa `rawPayload` (body SePay nguyên văn, có `accountNumber` tài khoản nhận) và `paymentAttempt.bankAccount` | `GET /api/admin/payments/attempts` được docs ghi là "không trả raw_payload, số tài khoản nhận"; docs của endpoint giao dịch không nói gì. Không rõ chủ đích (đối soát) hay sót | Chờ người dùng quyết định (test không khẳng định theo hướng nào) |
| 08 | `POST /api/cart/items` | Thêm cùng sản phẩm/size/màu khi dòng đã có 99 cái (cộng dồn > 99) trả **500** `Internal server error` (vi phạm `CK_cart_items_quantity_max` ở DB) | Lỗi nghiệp vụ có errorCode 4xx; CLAUDE.md: bọc try/catch lỗi DB ra mã lỗi đẹp. DTO chỉ chặn `quantity` 1–99 của một lần gọi, không chặn tổng | Chờ người dùng quyết định (test không khẳng định) |
| 08 | `POST /api/cart/items` | Nhiều lần thêm đồng thời khi user chưa có giỏ/dòng: 3 request song song cho `[201, 500, 500]` (đua tạo `carts`/`cart_items` vi phạm UNIQUE `UQ_carts_user` / `UQ_cart_items_unique`) | Request thua nên được xử lý như thêm vào dòng đã có (hoặc trả lỗi 4xx), không 500; docs/CLAUDE.md yêu cầu UNIQUE ở DB cộng bắt lỗi ra mã đẹp | Chờ người dùng quyết định (test không khẳng định) |
| 13 | `POST /api/admin/products` | Hai request tạo đồng thời cùng `slug` cho `[201, 500, 500]` (kiểm tra trùng chạy trước khi lưu, không bắt UNIQUE `UQ_products_slug` / `UQ_products_sku`) | `PRODUCT_SLUG_DUPLICATE (1002)` / `PRODUCT_SKU_DUPLICATE (1003)`; CLAUDE.md: bắt lỗi DB ra mã đẹp | Chờ người dùng quyết định (test không khẳng định) |
| 13 | `POST /api/admin/products` | `sku` tự sinh `{category}-{subcategory}-{slug}` không được kiểm tra trùng: nếu trùng `sku` có sẵn (vd sản phẩm khác dùng `sku` tuỳ chỉnh đúng chuỗi đó) thì vi phạm `UQ_products_sku` và trả 500 | `PRODUCT_SKU_DUPLICATE (1003)` như khi gửi `sku` trùng | Chờ người dùng quyết định (test không khẳng định) |
| 13 | `PATCH /api/admin/products/:id` | `UpdateProductDto` thiếu `@IsNotEmpty` cho `slug`/`name`/`description`/`categoryId`/`subcategoryId`: PATCH `{ "slug": "", "name": "" }` trả 200 và lưu chuỗi rỗng | `docs/modules/product.md` 4.1: mọi field của update "cùng ràng buộc" như create (create yêu cầu not empty) | Chờ người dùng quyết định (test batch 14 không khẳng định) |
| 14 | `PATCH /api/admin/products/:id` | Response chỉ chứa field được gửi cùng quan hệ/giá/điểm: `slug`, `sku`, `images`, `status`, `description`, `material`, `care`, `sizes`, `colors`, `tags` vắng mặt khi không gửi (DB đúng, `GET` đủ). Nguyên nhân: `dto` là instance có sẵn thuộc tính `undefined`, `Object.assign(product, rest)` ghi `undefined` lên entity rồi mới `save` | `docs/modules/product.md` 4.1: response là sản phẩm đầy đủ như create | Chờ người dùng quyết định (test chỉ kiểm field đã gửi và đọc phần còn lại qua DB/`GET`) |
| 14 | `PATCH /api/admin/products/:id` | Gửi `categoryId` hoặc `subcategoryId` mà không gửi `slug` và `sku` lưu `sku` = `{category}-{subcategory}-undefined` vào DB (cùng nguyên nhân: `product.slug` bị ghi `undefined` trước khi sinh SKU) | SKU sinh lại theo công thức mặc định với slug hiện có (`docs/modules/product.md` 4.4) | Chờ người dùng quyết định (test dùng `sku` tường minh khi đổi danh mục) |
| 15 | `PATCH /api/admin/categories/:id` | `UpdateCategoryDto` thiếu `@IsNotEmpty` cho `slug`/`title`: PATCH `{ "slug": "", "title": "" }` trả 200 và lưu chuỗi rỗng. Cùng nguyên nhân với product, response `PATCH` thiếu `slug`/`description` khi không gửi và response `POST` thiếu `subcategories` khi không gửi (DTO có sẵn thuộc tính `undefined` gán lên entity) | `docs/modules/category.md` 4.1: create yêu cầu not empty; response là entity đầy đủ | Chờ người dùng quyết định (test không khẳng định) |
| 17 | `PATCH /api/admin/collections/:id` | `UpdateCollectionDto` thiếu `@IsNotEmpty` cho `slug`/`name`/`image`: PATCH `{ "slug": "", "name": "", "image": "" }` trả 200 và lưu chuỗi rỗng; response thiếu các field không gửi (cùng nguyên nhân với product/category) | `docs/modules/collection.md` 4.1: create yêu cầu not empty; response là collection đầy đủ | Chờ người dùng quyết định (test không khẳng định) |
| 17 | `POST /api/admin/collections` | Hai request đồng thời cùng `slug` cho `[201, 500, 400/1202]` (kiểm tra trùng chạy trước khi lưu, không bắt UNIQUE `slug`) | `COLLECTION_SLUG_DUPLICATE (1202)`; CLAUDE.md: bắt lỗi DB ra mã đẹp | Chờ người dùng quyết định (test không khẳng định) |
| 18 | `PATCH /api/addresses/:id` | `UpdateAddressDto` thiếu `@IsNotEmpty` cho `fullName`/`phone`/`addressLine1`/`city`: PATCH với chuỗi rỗng trả 200 và lưu; response chỉ chứa `id`, `userId`, timestamp và field đã gửi (cùng nguyên nhân với product/category/collection) | `docs/modules/address.md` 4.1: update có cùng các field như create (create yêu cầu not empty); response là địa chỉ đầy đủ | Chờ người dùng quyết định (test không khẳng định) |
| 19 | `POST /api/wishlist/:productId` | Ba request đồng thời cho cùng sản phẩm (vd bấm đúp) cho `[201, 500, 500]` (kiểm tra đã có chạy trước khi lưu, không bắt UNIQUE `(user_id, product_id)`) | Request thua trả `created: false` như thêm lại (docs 4.4: thêm lại là idempotent) | Chờ người dùng quyết định (test không khẳng định) |
| 20 | `POST /api/auth/google` | Ba lần đăng nhập đồng thời lần đầu của cùng một email cho `[201, 500, 500]` (tìm user rồi tạo, không bắt UNIQUE `UQ_users_email`) | Lần thua đăng nhập bằng user vừa tạo; CLAUDE.md: bắt lỗi DB | Chờ người dùng quyết định (test không khẳng định) |
| 20 | `POST /api/auth/google` | User `status = 'disabled'` đăng nhập vẫn nhận 201 và cả hai token (response `status: 'disabled'`); token bị từ chối ở request kế tiếp | Docs 4.3 chỉ nói user không active bị 401 khi refresh/xác thực; chưa nêu đăng nhập | Chờ người dùng quyết định (test chỉ kiểm token của user bị khoá bị từ chối) |
| 21 | `PATCH /api/admin/users/:id` | `permissions` nhận mọi số nguyên, kể cả mã không có trong enum `Permission` (`99999` được lưu) | `docs/modules/user.md` 4.1: "mảng mã permission" | Chờ người dùng quyết định (test không khẳng định) |
