# Test — nơi quản lý toàn bộ test

Cập nhật lần cuối: 2026-10-21 · Luật: `.claude/rules/testing.md` · Thao tác: skill `module-test` · Hạ tầng (spec): `docs/specs/testing/0001-flow-test-infrastructure.md`, `0002-access-matrix-and-endpoint-coverage.md`

**Chiến dịch test toàn diện (98 route, từng lượt 1 batch ≤ 5 route):** quy trình ở skill `test-campaign`, kế hoạch + nhật ký + trạng thái ở [`PROGRESS.md`](PROGRESS.md).

## Hai tầng

| Tầng | Vị trí | Chạy trên | Lệnh |
|---|---|---|---|
| Unit | `src/**/<tên>.spec.ts`, cạnh code | Mock, không DB | `yarn test` |
| Flow | `test/flows/<module>/<luồng>.flow.ts` | Postgres thật (docker, cổng 55432, DB `clothes_shop_test`) + HTTP thật | `yarn test:flows` |

## Chạy flow test

```bash
yarn test:flows        # bật Postgres test (docker compose), dựng schema từ migration, chạy mọi flow
yarn test:db:down      # tắt DB test khi xong
yarn -s jest --config test/jest.flows.config.js --runInBand -t "<tên test>"   # chạy một test (DB đã up)
```

- Mỗi lần chạy: `DROP SCHEMA public` → chạy **toàn bộ migration** → xoá dữ liệu seed → chạy flow; sau mỗi test dữ liệu được dọn. Migration hỏng hoặc thiếu constraint làm cả bộ đỏ.
- Chỉ chạy trên DB có tên kết thúc `_test`. Hai lần chạy đồng thời bị chặn bằng khoá advisory.
- Cần Docker đang chạy.
- Hermetic: biến `SUPABASE_*`, `GOOGLE_*`, `STORAGE_URL` bị đặt rỗng (kể cả khi `.env` của máy có khoá thật) và `fetch` toàn cục bị chặn; test cần giả dịch vụ ngoài thì `jest.spyOn(globalThis, 'fetch')`.

## Cấu trúc

```
test/
├── README.md                    file này (test matrix)
├── jest.flows.config.js         config jest riêng cho flow
├── support/
│   ├── test-env.ts              env test (DB, JWT, SePay giả; dịch vụ ngoài để rỗng) + chốt chặn tên DB `_test`
│   ├── env.ts                   setupFiles: áp env test và chặn `fetch` ra mạng
│   ├── global-setup.ts          khoá chạy, dựng schema từ migration, dọn seed
│   ├── global-teardown.ts       nhả khoá
│   ├── test-app.ts              createTestApp(): boot MainModule thật, dùng configureApp như production
│   ├── db.ts                    truncateAll
│   ├── auth.ts                  bearer(t, user): header JWT
│   ├── builders.ts              createBuilders(ds): user, admin, product, cart, address...
│   ├── sepay.ts                 sepayWebhook(): webhook ký HMAC đúng chuẩn
│   └── routes.ts                discoverRoutes(app): tự phát hiện route + quyền từ metadata của Nest; formatRouteTable
└── flows/<module>/
    ├── <luồng>.flow.ts          một file một luồng nghiệp vụ
    └── steps.ts                 bước dùng lại của luồng (không phải test)
```

## Test matrix

Trạng thái: **Có** = đã có test cover luồng · **Unit** = chỉ có unit (mock) · **Chưa có** = chưa có test cho luồng chính này.

### Flow test (Postgres thật)

| Module | Luồng | Tầng | File | Trạng thái |
|---|---|---|---|---|
| auth / guard | Không token → 401; thiếu quyền → 403 (mới trên `GET /api/orders`) | Flow | `flows/order-payment/checkout-and-pay.flow.ts` | Có |
| mọi module (bảng quyền) | Tự phát hiện 98 route; snapshot route–quyền; mọi route cần đăng nhập có quyền; route public không có quyền; route `/api/admin` không public và không dùng quyền mặc định; mã quyền hợp lệ; không trùng method+path | Flow | `flows/access/route-table.flow.ts` | Có |
| hạ tầng test | Hermetic: env dịch vụ ngoài rỗng, `fetch` bị chặn, media chưa cấu hình → 503/1601 | Flow | `flows/access/route-table.flow.ts` | Có |
| order + cart + address + payment | Giỏ → báo giá → checkout → mã QR → webhook SePay → đơn `paid`/`confirmed` | Flow | `flows/order-payment/checkout-and-pay.flow.ts` | Có |
| payment (webhook) | Webhook trùng idempotent; sai chữ ký (1704); sai số tiền (`AMOUNT_MISMATCH`); tiền đến lần 2 (`DUPLICATE_PAYMENT`) | Flow | `flows/order-payment/checkout-and-pay.flow.ts` | Có |
| order | Khách huỷ đơn chưa trả (huỷ QR); khách không huỷ được đơn đã trả (1307) | Flow | `flows/order-payment/cancel-and-refund.flow.ts` | Có |
| order + payment (refund) | Admin huỷ đơn đã trả → tự sinh hoàn tiền đủ → hoàn xong → `refunded`; hoàn lần hai (1713); trùng mã tham chiếu (1714) | Flow | `flows/order-payment/cancel-and-refund.flow.ts` | Có |
| payment | Admin xác nhận thanh toán thủ công; mã QR admin; QR hết hạn | Flow | — | Unit |
| return | Yêu cầu trả hàng → duyệt → nhận hàng → hoàn tiền | Flow | — | Unit |
| review | Viết đánh giá sau khi nhận hàng, cập nhật điểm sản phẩm | Flow | — | Unit |
| order (admin) | Đổi trạng thái đơn theo state machine (pending → … → completed) | Flow | — | Unit |
| auth | Đăng nhập Google, refresh token, `GET /auth/me` | Flow | — | Unit |
| cart | Thêm / sửa / xoá dòng giỏ | Flow | — | Unit |
| product / collection | List public (filter, sort, phân trang) và CRUD admin | Flow | — | Unit |
| category | List public và CRUD admin, thứ hạng `priority` | Flow | — | Chưa có |
| wishlist | Thêm / xoá / kiểm tra sản phẩm yêu thích | Flow | — | Unit |
| address | CRUD sổ địa chỉ của khách | Flow | — | Chưa có |
| media | Upload / xoá ảnh admin | Flow | — | Unit |
| site-config / shipping / currency | Admin sửa cấu hình, ảnh hưởng báo giá | Flow | — | Unit |

### Unit test (cạnh code)

| Module | File spec |
|---|---|
| common | `common/dto/list-query.dto.spec.ts` (ép chuẩn list cho mọi `*-query.dto.ts`), `common/utils/money.util.spec.ts` |
| auth | `modules/auth/auth.service.spec.ts` |
| cart | `modules/cart/cart.service.spec.ts` |
| collection | `modules/collection/collection.service.spec.ts` |
| currency | `modules/currency/currency.service.spec.ts` |
| media | `modules/media/media.service.spec.ts` |
| order | `modules/order/order.service.spec.ts`, `order.presenter.spec.ts`, `dtos/order.dto.spec.ts` |
| payment | `modules/payment/payment.service.spec.ts`, `payment-confirm.spec.ts`, `payment-expiry.spec.ts`, `payment-attempts-admin.spec.ts`, `refund.service.spec.ts`, `sepay-webhook.service.spec.ts`, `sepay-payload.util.spec.ts`, `sepay-signature.util.spec.ts` |
| pending-count | `modules/pending-count/pending-count.spec.ts` |
| product | `modules/product/product.service.spec.ts`, `product.presenter.spec.ts` |
| return | `modules/return/return.service.spec.ts`, `return-eligibility.util.spec.ts` |
| review | `modules/review/review.service.spec.ts`, `review-eligibility.util.spec.ts` |
| shipping | `modules/shipping/shipping-config.service.spec.ts`, `shipping-config.spec.ts` |
| site-config | `modules/site-config/site-config.service.spec.ts` |
| wishlist | `modules/wishlist/wishlist.service.spec.ts` |

Cập nhật bảng này **cùng lượt** khi thêm/đổi test (xem `.claude/rules/testing.md`).
