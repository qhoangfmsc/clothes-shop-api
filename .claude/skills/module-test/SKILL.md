---
name: module-test
description: Viết và quản lý test cho clothes-shop-api — unit (cạnh code, mock) và flow test (test/flows/, Postgres thật + HTTP thật), builder dữ liệu, webhook ký sẵn, test matrix. Dùng ở bước ③ của feature-workflow khi thêm module, sửa luồng chính, sửa bug, hoặc thêm migration có ràng buộc.
---

# module-test — test cho module mới và module cũ

Luật gốc: `.claude/rules/testing.md`. Phủ test cho nhiều route cùng lúc → dùng skill `test-campaign` (từng batch ≤ 5 route, có tiến độ); skill này là công cụ viết từng test. Hạ tầng: `docs/specs/testing/0001-flow-test-infrastructure.md`. Bảng quản lý: `test/README.md`.

## 1. Chọn tầng

| Câu hỏi | Nếu có → |
|---|---|
| Là logic thuần / nhánh nghiệp vụ / DTO / presenter / util? | **Unit** `src/modules/<m>/<x>.spec.ts` (mock) |
| Chạm tiền, trạng thái đơn, thanh toán, hoàn tiền, trả hàng, auth/quyền? | **Flow** (bắt buộc) |
| Phụ thuộc transaction, khoá dòng, CHECK/FK/UNIQUE, nhiều module cùng chạy? | **Flow** |
| Module mới? | Unit + ≥ 1 flow cho luồng chính |
| Sửa bug? | Viết test tái hiện **trước**, thấy đỏ, rồi sửa |

## 2. Viết flow test

1. Tìm `test/flows/<module>/`. Có file cho luồng này → **mở rộng** file đó; chưa có → tạo `<luồng>.flow.ts` (một file một luồng nghiệp vụ).
2. Khung (copy từ `test/flows/order-payment/cancel-and-refund.flow.ts`):

```ts
import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';

describe('Flow: <tên luồng>', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  it('<hành vi mong đợi, nêu cả mã lỗi nếu là nhánh lỗi>', async () => {
    const user = await b.user();                       // dữ liệu đầu vào: builder
    const res = await t.api.get('/api/...').set(bearer(t, user)).expect(200); // hành vi: HTTP thật
    expect(res.body.data).toMatchObject({ ... });
    expect(await t.dataSource.query('SELECT ...')).toEqual([...]);            // kết quả cuối: DB
  });
});
```

3. **Dữ liệu:** dùng/ mở rộng `test/support/builders.ts` (`b.user`, `b.admin`, `b.product`, `b.cart`, `b.address`). Builder phải thoả mọi CHECK/NOT NULL của DB; thêm builder mới thay vì INSERT tay trong test. Nhớ DB bắt đầu **trống** (global-setup đã xoá dữ liệu seed của migration).
4. **Bước lặp lại** của luồng → `steps.ts` cạnh file flow.
5. **Đầu vào ngoài** (webhook, API ngoài) giả ở biên, như `sepayWebhook(...)`; không mock service nội bộ. `fetch` ra mạng bị chặn sẵn: cần giả dịch vụ ngoài thì `jest.spyOn(globalThis, 'fetch').mockResolvedValue(...)` trong chính test.
6. **Nhánh lỗi:** assert `res.body.errorCode`, không chỉ status HTTP.
7. **Luồng tiền mới:** thử phá một dòng logic để chắc test bắt được, rồi khôi phục (không commit phần phá).

## 3. Chạy

```bash
yarn test:flows                              # tự bật Postgres test (docker), dựng schema từ migration, chạy tất cả flow
yarn test:flows:run                          # chỉ chạy jest (không bật docker), khi dùng Postgres có sẵn
yarn -s jest --config test/jest.flows.config.js --runInBand -t "<tên test>"   # chạy một test (cần DB đã up)
yarn test:db:down                            # tắt DB test
```

Cấu hình (cổng, tài khoản DB, secret giả) ở `.env.test` ở root. Không chạy hai lệnh flow cùng lúc (khoá advisory sẽ chặn). Docker không chạy → nói rõ trong báo cáo, không tuyên bố xong.

## 4. Cập nhật test matrix

Thêm/sửa dòng trong `test/README.md`: module · luồng · tầng · file. Thêm cả hàng "chưa có" cho luồng chính phát hiện còn thiếu để thấy khoảng trống.

## 5. Viết unit test

Theo mẫu spec hiện có trong module. Với service dùng transaction, mẫu mock có sẵn là `createFakeManager` (`src/modules/payment/payment.test-utils.ts`). Unit mock không thay được flow ở các điểm trong bảng mục 1.
