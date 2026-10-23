# Test — nơi quản lý toàn bộ test

Cập nhật lần cuối: 2026-10-21 · Luật: `.claude/rules/testing.md` · Thao tác: skill `module-test` · Hạ tầng (spec): `docs/specs/testing/0001-flow-test-infrastructure.md`, `0002-access-matrix-and-endpoint-coverage.md`

**Chiến dịch test toàn diện (98 route, từng lượt 1 batch ≤ 5 route):** quy trình ở skill `test-campaign`, kế hoạch + nhật ký + trạng thái ở [`PROGRESS.md`](PROGRESS.md).

## Hai tầng

| Tầng | Vị trí | Chạy trên | Lệnh |
|---|---|---|---|
| Unit | `src/**/<tên>.spec.ts`, cạnh code | Mock, không DB | `yarn test` |
| Flow | `test/flows/<module>/<luồng>.flow.ts` | Postgres thật (docker, cổng 55432, DB `clothes_shop_test`) + HTTP thật | `yarn test:flows` |

## Chạy flow test

**Cấu hình ở [`.env.test`](../.env.test) (root)**: chỉ có kết nối Postgres test (`POSTGRES_*`), docker và jest cùng đọc. Chỉnh khi cổng 55432 bị chiếm hoặc muốn dùng Postgres có sẵn (rồi chạy `yarn test:flows:run`). Đổi xong: `yarn test:db:down && yarn test:db:up`. `POSTGRES_DATABASE` phải kết thúc `_test`. Phần còn lại là hằng số giả trong `test/support/test-env.ts` (JWT, SePay) hoặc luôn rỗng (`SUPABASE_*`, `GOOGLE_*`), không cấu hình.

```bash
yarn test:flows        # bật Postgres test (docker compose), dựng schema từ migration, chạy mọi flow
yarn test:flows:run    # chỉ chạy jest, không bật docker (khi dùng Postgres có sẵn)
yarn test:coverage     # in lại báo cáo độ phủ + ratchet từ lần chạy gần nhất
yarn test:coverage:update  # gỡ khỏi baseline các mục đã đủ ca
yarn test:db:down      # tắt DB test khi xong
yarn -s jest --config test/jest.flows.config.js --runInBand -t "<tên test>"   # chạy một test (DB đã up)
```

- Mỗi lần chạy: `DROP SCHEMA public` → chạy **toàn bộ migration** → xoá dữ liệu seed → chạy flow; sau mỗi test dữ liệu được dọn. Migration hỏng hoặc thiếu constraint làm cả bộ đỏ.
- Chỉ chạy trên DB có tên kết thúc `_test`. Hai lần chạy đồng thời bị chặn bằng khoá advisory.
- Cần Docker đang chạy.
- Mỗi file flow bắt đầu từ DB trống (`createTestApp` tự dọn) và app listen một lần trên `127.0.0.1` cổng ngẫu nhiên; không đổi hai điều này (xem ghi chú ở `PROGRESS.md`, lượt P0-2).
- Hermetic: biến `SUPABASE_*`, `GOOGLE_*` bị đặt rỗng (kể cả khi `.env` của máy có khoá thật) và `fetch` toàn cục bị chặn; test cần giả dịch vụ ngoài thì `jest.spyOn(globalThis, 'fetch')`.

## Độ phủ endpoint (ratchet)

`yarn test:flows` chạy xong thì in: `Độ phủ endpoint (98 route): ca thành công X/N, ca lỗi Y/N`, danh sách "Batch kế tiếp" (5 route đầu còn thiếu theo thứ tự ưu tiên trong baseline) và kết quả ratchet.

- **Ca thành công** = route có request trả 2xx/3xx. **Ca lỗi** = có request trả ≥ 400; với route cần đăng nhập thì không tính 401/403 (đó là kết quả của guard, ma trận auth đã phủ). Request thăm dò của ma trận (header `x-test-probe`) không được đếm.
- `coverage-baseline.json` liệt kê route đang thiếu ca. Ratchet **thất bại** khi: route mới thiếu ca mà không có trong baseline (route mới phải kèm test); route đã đủ ca mà còn trong baseline (chạy `yarn test:coverage:update` để gỡ); baseline chứa route không còn tồn tại. `update` chỉ gỡ mục đã đủ, không bao giờ thêm; thêm mục vào baseline phải sửa tay và có lý do.
- Miễn trừ (`exempt`) cho route không thể có ca đó, kèm lý do (hiện `GET /` và `GET /health` không có ca lỗi).
- Chỉ chạy đủ bộ mới có số liệu đúng; chạy lọc `-t` bằng jest trực tiếp thì không báo cáo.

## Cấu trúc

```
test/
├── README.md                    file này (test matrix)
├── jest.flows.config.js         config jest riêng cho flow
├── coverage-baseline.json       route hiện còn thiếu ca (chỉ được co lại) + mục miễn kèm lý do
├── support/
│   ├── test-env.ts              nạp `.env.test` (chỉ `POSTGRES_*`), hằng số giả JWT/SePay, dịch vụ ngoài rỗng, chốt chặn tên DB `_test`
│   ├── env.ts                   setupFiles: áp env test và chặn `fetch` ra mạng
│   ├── global-setup.ts          khoá chạy, dựng schema từ migration, dọn seed
│   ├── global-teardown.ts       nhả khoá
│   ├── test-app.ts              createTestApp(): boot MainModule thật, dùng configureApp như production
│   ├── db.ts                    truncateAll
│   ├── auth.ts                  bearer(t, user): header JWT
│   ├── builders.ts              createBuilders(ds): user, admin, product, cart, address...
│   ├── sepay.ts                 sepayWebhook(): webhook ký HMAC đúng chuẩn
│   ├── routes.ts                discoverRoutes(app): tự phát hiện route + quyền từ metadata của Nest; formatRouteTable; concretePath
│   ├── route-path.ts            normalizePath (dùng chung, không import alias)
│   ├── coverage.ts              ghi request lúc chạy flow, tính route thiếu ca thành công / ca lỗi
│   └── coverage-report.ts       in độ phủ + ratchet (chạy sau jest trong `yarn test:flows`)
└── flows/<module>/
    ├── <luồng>.flow.ts          một file một luồng nghiệp vụ
    └── steps.ts                 bước dùng lại của luồng (không phải test)
```

## Test matrix

Trạng thái: **Có** = đã có test cover luồng · **Unit** = chỉ có unit (mock) · **Chưa có** = chưa có test cho luồng chính này.

### Flow test (Postgres thật)

| Module | Luồng | Tầng | File | Trạng thái |
|---|---|---|---|---|
| auth / guard (mọi route) | Ma trận cho cả 98 route: không/rỗng/sai scheme credential → 401; token sai secret, hết hạn, loại refresh, user không tồn tại, user disabled → 401; không quyền / đủ mọi quyền trừ quyền cần → 403 (9001); đúng một trong các quyền cần → qua guard; admin không cần quyền → qua guard; user mặc định trên `/api/admin/**` → 403; route public vào được không token và với token rác | Flow | `flows/access/access-matrix.flow.ts` | Có |
| auth / guard | Không token → 401; thiếu quyền → 403 trên `GET /api/orders` | Flow | `flows/order-payment/checkout-and-pay.flow.ts` | Có |
| order (lỗi) | Đơn lạ → 404/1301; địa chỉ người khác → 2101; giỏ rỗng 1309; mục giỏ lạ 1308; sản phẩm disabled 1310; huỷ không còn pending 1311; đã bị huỷ 1312 | Flow | `flows/order-payment/order-errors.flow.ts` | Có |
| cart (lỗi) | Chưa có giỏ 2001; dòng lạ/của giỏ khác 2002; thêm sản phẩm disabled 2003 | Flow | `flows/cart/cart-errors.flow.ts` | Có |
| address (lỗi) | Sửa/xoá địa chỉ lạ hoặc của người khác → 404/2101 | Flow | `flows/address/address-errors.flow.ts` | Có (chỉ ca lỗi) |
| mọi module (bảng quyền) | Tự phát hiện 98 route; snapshot route–quyền; mọi route cần đăng nhập có quyền; route public không có quyền; route `/api/admin` không public và không dùng quyền mặc định; mã quyền hợp lệ; không trùng method+path | Flow | `flows/access/route-table.flow.ts` | Có |
| hạ tầng test | Hermetic: env dịch vụ ngoài rỗng, `fetch` bị chặn, media chưa cấu hình → 503/1601 | Flow | `flows/access/route-table.flow.ts` | Có |
| order + cart + address + payment | Giỏ → báo giá → checkout → mã QR → webhook SePay → đơn `paid`/`confirmed` | Flow | `flows/order-payment/checkout-and-pay.flow.ts` | Có |
| payment (webhook) | Webhook trùng idempotent; sai chữ ký (1704); sai số tiền (`AMOUNT_MISMATCH`); tiền đến lần 2 (`DUPLICATE_PAYMENT`) | Flow | `flows/order-payment/checkout-and-pay.flow.ts` | Có |
| payment (phiên khách) | Trạng thái PENDING/EXPIRED/CANCELLED/PAID; QR (thông tin, dùng lại, cấp mã mới, từ chối đơn đã trả/huỷ/của người khác); webhook IGNORED, ACCOUNT_MISMATCH, UNMATCHED, LATE, lowercase, payload sai (1705), timestamp cũ/thiếu chữ ký (1704) | Flow | `flows/payment/payment-session.flow.ts` | Có (batch 01) |
| payment (admin tra cứu) | Danh sách phiên (lọc trạng thái hiệu lực, orderId, tìm kiếm, sắp xếp, phân trang, tham số sai) và toàn cảnh thanh toán của đơn | Flow | `flows/payment/payment-admin-queries.flow.ts` | Có (batch 01) |
| order | Khách huỷ đơn chưa trả (huỷ QR); khách không huỷ được đơn đã trả (1307) | Flow | `flows/order-payment/cancel-and-refund.flow.ts` | Có |
| order + payment (refund) | Admin huỷ đơn đã trả → tự sinh hoàn tiền đủ → hoàn xong → `refunded`; hoàn lần hai (1713); trùng mã tham chiếu (1714) | Flow | `flows/order-payment/cancel-and-refund.flow.ts` | Có |
| order + payment (song song) | 6 QR cùng lúc → 1 phiên PENDING; webhook trùng id song song; hai chuyển khoản khác id; huỷ vs thanh toán đua nhau | Flow | `flows/order-payment/concurrency.flow.ts` | Có |
| order + payment (khoá dòng) | Hợp đồng khoá `orders`: huỷ, đổi trạng thái, tạo QR, webhook đều chờ khoá rồi quyết định trên dữ liệu mới | Flow | `flows/order-payment/lock-contract.flow.ts` | Có |
| payment (admin) | Xác nhận thủ công (giao dịch mới, theo mã, gắn giao dịch có sẵn, các lỗi 1702/1707/1708/1709/1710/1703); QR do admin tạo (thay mã cũ, LATE) | Flow | `flows/payment/payment-admin-actions.flow.ts` | Có (batch 02) |
| payment (hoàn xong / từ chối) | Hoàn đủ và hoàn từng phần, 1711/1712/1713/1714, validation, hai admin bấm cùng lúc, hai khoản cùng mã tham chiếu | Flow | `flows/payment/payment-refund-actions.flow.ts` | Có (batch 03) |
| payment (giao dịch, hoàn tiền) | Danh sách giao dịch (lọc, needsReview, sắp xếp), danh sách hoàn tiền (lọc, tìm, nguồn tiền), tạo yêu cầu hoàn thủ công và các từ chối 1712 | Flow | `flows/payment/payment-transactions-refunds.flow.ts` | Có (batch 02) |
| return (khách) | Điều kiện trả hàng (4 lý do không đủ điều kiện, hạn), tạo yêu cầu (snapshot, trả phần còn lại, 1802/1803, validation), danh sách (lọc, sắp xếp), chi tiết, huỷ (REQUESTED/APPROVED, 1804, sở hữu 1801) | Flow | `flows/return/return-customer.flow.ts` | Có (batch 06) |
| return (admin) | Danh sách (lọc, tìm theo SĐT/tên/mã), chi tiết, duyệt, từ chối, nhận hàng (tiền theo tỷ lệ, cộng dồn nhiều lần trả, phí ship một lần, 1804/1805/1712), khoá đơn, khoản hoàn xong → REFUNDED, bị từ chối → APPROVED | Flow | `flows/return/return-admin.flow.ts` | Có (batch 07) |
| review (đọc công khai, viết, sửa) | Tạo (snapshot, điểm sản phẩm, ảnh của chính mình, 1902/1903/1905/1908, song song), danh sách và tổng hợp công khai (lọc, sort, làm tròn), sửa một lần (1904/1901/1909, song song), bỏ "hữu ích" | Flow | `flows/review/review.flow.ts` | Có (batch 09) |
| review (khách) | Bấm "hữu ích" (đếm lại, song song, 1907/1901), upload ảnh (loại theo magic bytes, giới hạn 30/24h, lỗi storage 1605/1601, 413), đánh giá của tôi, dòng chờ đánh giá, phiếu đã bấm | Flow | `flows/review/review-customer.flow.ts` | Có (batch 10) |
| review (admin) | Danh sách (lọc, tìm, sort), chi tiết, ẩn (điểm sản phẩm, 1906, song song, khoá dòng), hiện lại (giữ phiếu, điểm trở lại), đặt/thay/xoá phản hồi | Flow | `flows/review/review-admin.flow.ts` | Có (batch 11–12) |
| order (đọc) | Danh sách khách (chỉ đơn của mình, lọc, sắp xếp, phân trang), chi tiết kèm phiên thanh toán, danh sách admin (lọc, tìm theo SĐT và mã chuyển khoản, needsAction), chi tiết admin, số đơn cần thao tác | Flow | `flows/order-payment/order-queries.flow.ts` | Có |
| order (báo giá, đặt hàng) | Báo giá (phí, ngưỡng miễn ship, tỷ giá, không tác dụng phụ), checkout (express, một phần giỏ, store-pickup, chốt giá/tên/tỷ giá, tổ hợp địa chỉ 1304-1306, 1303), validation | Flow | `flows/order/order-checkout.flow.ts` | Có (batch 04) |
| order (admin) | Danh sách (sắp xếp, tìm, trang vượt cuối, validation), chi tiết, status body sai | Flow | `flows/order/order-admin.flow.ts` | Có (batch 05) |
| order (admin) | Đổi trạng thái đơn theo bảng chuyển (pending → … → completed), chuyển sai → 1302, trạng thái cuối, trạng thái không tồn tại | Flow | `flows/order-payment/order-status.flow.ts` | Có |
| auth | Đăng nhập Google, refresh token, `GET /auth/me` | Flow | — | Unit |
| cart | Xem giỏ (Vnd/Usd, giá hiện tại), thêm (cộng dồn, size/màu, 1001/2003/1303), đổi số lượng, xoá dòng, xoá sạch, validation từng field | Flow | `flows/cart/cart.flow.ts` | Có (batch 08) |
| product / collection | List public (filter, sort, phân trang) và CRUD admin | Flow | — | Unit |
| category | List public và CRUD admin, thứ hạng `priority` | Flow | — | Chưa có |
| wishlist | Thêm / xoá / kiểm tra sản phẩm yêu thích | Flow | — | Unit |
| address | CRUD sổ địa chỉ của khách (ca thành công) | Flow | — | Chưa có |
| media | Upload / xoá ảnh admin | Flow | — | Unit |
| site-config / shipping / currency | Admin sửa cấu hình, ảnh hưởng báo giá | Flow | — | Unit |

### Unit test (cạnh code)

| Module | File spec |
|---|---|
| common | `common/dto/list-query.dto.spec.ts` (ép chuẩn list cho mọi `*-query.dto.ts`), `common/utils/money.util.spec.ts`, `common/base/lock.util.spec.ts`, `common/architecture/architecture.spec.ts` (luật kiến trúc: hướng phụ thuộc, vòng module, export thừa, exception thô, kích thước service) |
| auth | `modules/auth/auth.service.spec.ts`, `modules/auth/google-auth.service.spec.ts` |
| cart | `modules/cart/cart.service.spec.ts` |
| collection | `modules/collection/collection.service.spec.ts` |
| currency | `modules/currency/currency.service.spec.ts` |
| media | `modules/media/media.service.spec.ts` |
| order | `modules/order/order-checkout.service.spec.ts`, `order-query.service.spec.ts`, `order-status.service.spec.ts`, `order.presenter.spec.ts`, `order.constant.spec.ts` (bảng chuyển trạng thái), `dtos/order.dto.spec.ts` |
| payment | `modules/payment/payment.service.spec.ts`, `payment-confirm.spec.ts`, `payment-expiry.spec.ts`, `payment-attempts-admin.spec.ts`, `refund.service.spec.ts`, `sepay-webhook.service.spec.ts`, `sepay-payload.util.spec.ts`, `sepay-signature.util.spec.ts` |
| pending-count | `modules/pending-count/pending-count.spec.ts` |
| product | `modules/product/product.service.spec.ts`, `product.presenter.spec.ts` |
| return | `modules/return/return.service.spec.ts`, `return-eligibility.util.spec.ts` |
| review | `modules/review/review.service.spec.ts`, `review-eligibility.util.spec.ts` |
| shipping | `modules/shipping/shipping-config.service.spec.ts`, `shipping-config.spec.ts` |
| site-config | `modules/site-config/site-config.service.spec.ts` |
| wishlist | `modules/wishlist/wishlist.service.spec.ts` |

Cập nhật bảng này **cùng lượt** khi thêm/đổi test (xem `.claude/rules/testing.md`).
