# 0001 — Khung flow test chạy trên Postgres thật

> Module: `testing` (hạ tầng test, dùng chung) · Trạng thái: Implemented · Ngày: 2026-10-21

## 1. Bối cảnh & vấn đề

Dự án có 29 file `*.spec.ts` đặt cạnh code, chạy bằng mock (`createFakeManager` trong `payment.test-utils.ts` giả lập `EntityManager` trong bộ nhớ). Mock kiểm được logic nhánh nhưng không kiểm được thứ rủi ro nhất của dự án: khoá dòng `pessimistic_write`, transaction, CHECK/FK/UNIQUE trong migration, guard + validation pipe thật, và cách các module (order ↔ payment ↔ refund) khớp nhau. Khi sửa một module không có gì báo luồng chính (đặt hàng → thanh toán → huỷ → hoàn tiền) còn chạy.

## 2. Mục tiêu & ngoài phạm vi

**Mục tiêu**
- Một bộ **flow test** đi qua HTTP thật (guard, pipe, filter, controller, service, DB) trên Postgres thật, chạy bằng một lệnh.
- Schema dựng từ **migration** (không `synchronize`), nên migration hỏng hay thiếu constraint cũng bị bắt.
- Có nơi quản lý riêng: `test/flows/<module>/` và bảng test matrix `test/README.md` (luồng nào có test nào).
- Khung dùng lại được: module mới/sửa chỉ việc thêm file flow + builder.

**Ngoài phạm vi**
- Không dời 29 file spec hiện có (unit giữ cạnh code theo chuẩn Nest).
- Không chạy Google OAuth, Supabase, SePay thật; chỉ giả lập đầu vào (webhook ký HMAC đúng chuẩn).
- Chưa tích hợp CI (chưa có pipeline CI trong repo).
- Chưa viết flow cho mọi module; lượt này chỉ luồng đặt hàng–thanh toán–huỷ–hoàn tiền.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Postgres docker riêng (cổng 55432) + dựng schema bằng migration + boot `MainModule` thật + supertest | Gần production nhất; bắt lỗi lock/constraint/migration; không cần sửa code nghiệp vụ | Cần Docker; chậm hơn mock (vài chục giây) |
| B. Mock repository như spec hiện tại | Nhanh, không hạ tầng | Không kiểm được DB, lock, guard; mock phải tự cài lại hành vi TypeORM |
| C. pg-mem / SQLite in-memory | Không cần Docker | Không hỗ trợ `FOR UPDATE`, JSONB, CHECK đầy đủ như Postgres; kết quả sai lệch với production |

**Chọn A**; B vẫn dùng cho unit.

### 3.2 Kiến trúc & ranh giới

```
test/
├── README.md                 test matrix: luồng ↔ file ↔ trạng thái
├── jest.flows.config.js      config riêng (rootDir = repo, chỉ nhận *.flow.ts)
├── support/
│   ├── env.ts                setupFiles: env test + chốt chặn "tên DB phải kết thúc _test"
│   ├── global-setup.ts       khoá chạy (advisory lock) → reset schema public → chạy toàn bộ migration → dọn dữ liệu seed
│   ├── global-teardown.ts    nhả khoá
│   ├── test-app.ts           boot MainModule + configureApp (dùng chung với main.ts)
│   ├── db.ts                 truncateAll giữa các test
│   ├── auth.ts               ký JWT access cho user trong DB
│   ├── builders.ts           dựng dữ liệu (user, category, product, cart, address, cấu hình)
│   └── sepay.ts              dựng webhook SePay ký HMAC
└── flows/<module>/<tên>.flow.ts
docker-compose.test.yml       postgres:16-alpine, tmpfs, cổng 55432
src/core/app.setup.ts         configureApp(app): pipe, filter, body parser rawBody — dùng ở main.ts và test
```

Phụ thuộc một chiều: `test/` → `src/`; `src/` không biết `test/`. `configureApp` nằm ở `src/core` (hạ tầng bootstrap), không import module nghiệp vụ.

Việc tách `configureApp` khỏi `main.ts` là thay đổi code chạy duy nhất: hành vi bootstrap giữ nguyên, nhưng test dùng đúng cấu hình production (ValidationPipe `forbidNonWhitelisted`, `AllExceptionFilter`, `rawBody` cho webhook) thay vì một bản chép tay có thể lệch.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Giải quyết vấn đề gì | Cái giá |
|---|---|---|---|
| Test Data Builder | `support/builders.ts` | Dựng dữ liệu hợp lệ với mặc định hợp lý, test chỉ nêu phần khác biệt (`aProduct({ price: 350_000 })`) | Thêm một lớp hàm phải theo kịp khi entity đổi cột NOT NULL |
| Facade | `support/test-app.ts` (`createTestApp`) | Che bước boot Nest, lấy DataSource/JwtService, đóng app | Một chỗ phải sửa khi bootstrap đổi |
| Template Method (dùng sẵn của Jest) | `beforeAll` / `afterEach` / `afterAll` mỗi file flow | Cùng khung vòng đời: boot một lần, dọn DB sau mỗi test | — |
| Extract bootstrap function | `configureApp` | Một nguồn cấu hình app cho prod và test (DRY, tránh test lệch prod) | Thêm một file nhỏ |

Không thêm abstraction cho "repository test" hay DI container riêng: dùng thẳng `DataSource` của Nest.

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Mỗi file support một việc: env / schema / app / dọn DB / token / dữ liệu / webhook |
| O | ✔ | Thêm flow = thêm file `*.flow.ts` + (nếu cần) builder mới; không sửa khung |
| L | n.a. | Không có kế thừa |
| I | ✔ | Helper là hàm nhỏ, test chỉ import cái cần |
| D | ✔ | `main.ts` và test cùng phụ thuộc `configureApp(app)`; builder nhận `DataSource` được tiêm, không tự tạo kết nối |

### 3.5 Dữ liệu

Không đổi schema. DB test tách hẳn: database `clothes_shop_test` trên cổng 55432. `global-setup` chỉ thao tác khi tên DB kết thúc `_test` (chốt chặn để không bao giờ xoá nhầm DB dev). Mỗi lần chạy: `DROP SCHEMA public CASCADE` → `CREATE SCHEMA public` → chạy mọi migration trong `src/migrations` → `TRUNCATE` dữ liệu seed của migration. Sau mỗi test: `TRUNCATE` mọi bảng trừ `typeorm_migrations`.

### 3.6 API / contract

Không đổi API. Lệnh mới: `yarn test:db:up`, `yarn test:db:down`, `yarn test:flows`.

### 3.7 Luồng xử lý, transaction, lock

Flow test chạy tuần tự (`maxWorkers: 1`) vì dùng chung một DB. Mỗi file: `beforeAll` boot app; `afterEach` truncate; `afterAll` đóng app. Dữ liệu đầu vào dựng bằng builder (ghi thẳng DB); toàn bộ hành vi cần kiểm đi qua HTTP bằng token thật. Webhook SePay ký bằng đúng thuật toán HMAC của `sepay-signature.util` (secret test cố định).

### 3.8 Lỗi & trường hợp biên

| Tình huống | Hành vi mong đợi |
|---|---|
| Docker/DB chưa chạy | `global-setup` báo lỗi rõ ràng kèm lệnh `yarn test:db:up` |
| `POSTGRES_DATABASE` không kết thúc `_test` | Dừng ngay, không xoá gì |
| Migration hỏng trên DB trống | Cả bộ flow đỏ ở global-setup |
| Cron `PaymentExpiryScheduler` chạy trong test | Không ảnh hưởng (QR còn hạn 30 phút); app đóng ở `afterAll` |
| Hai lần `yarn test:flows` cùng lúc trên một DB | Lần thứ hai dừng ngay ở global-setup với thông báo rõ (khoá advisory `pg_try_advisory_lock`), không phá schema của lần đầu |

## 4. Kế hoạch test

Khung hạ tầng được kiểm gián tiếp qua các flow đầu tiên:

| Tầng | Case | Vị trí file |
|---|---|---|
| Flow | Đặt hàng → báo giá → QR → webhook SePay → đơn paid/confirmed; webhook trùng idempotent; sai chữ ký bị từ chối | `test/flows/order-payment/checkout-and-pay.flow.ts` |
| Flow | Admin huỷ đơn đã trả → sinh hoàn tiền → hoàn xong → `refunded`; khách tự huỷ đơn chưa trả | `test/flows/order-payment/cancel-and-refund.flow.ts` |
| Flow | Guard: không token → 401; thiếu quyền → 403/lỗi quyền | cùng file checkout-and-pay |

## 5. Rủi ro & rollback

- Rủi ro lớn nhất: xoá nhầm DB thật → đã có chốt chặn tên `_test` và cổng riêng 55432.
- Flow test chậm hơn unit → tách lệnh riêng, không chặn `yarn test`.
- Rollback: xoá `test/`, `docker-compose.test.yml`, 3 script trong `package.json`; hoàn tác `app.setup.ts` về `main.ts` (không đổi hành vi).

## 6. Kết quả triển khai

- **File đã tạo:** `src/core/app.setup.ts`, `docker-compose.test.yml`, `test/jest.flows.config.js`, `test/support/{test-env,env,global-setup,global-teardown,test-app,db,auth,builders,sepay,index}.ts`, `test/flows/order-payment/{steps,checkout-and-pay.flow,cancel-and-refund.flow}.ts`, `test/README.md`. **Đã sửa:** `src/main.ts` (dùng `configureApp`, hành vi bootstrap không đổi), `package.json` (script `test:db:up`, `test:db:down`, `test:flows`; `lint`/`format` thêm `./test`), `biome.json` (phạm vi thêm `test/**`).
- **Khác thiết kế ban đầu:**
  - Thêm khoá advisory + `global-teardown`: khi thử chạy lặp, hai lần chạy đồng thời dùng chung DB phá schema của nhau và cho lỗi ngẫu nhiên khó hiểu.
  - `global-setup` truncate dữ liệu seed sau khi chạy migration: migration seed danh mục/sản phẩm làm builder đụng `UQ_categories_priority` ở test đầu tiên (phụ thuộc thứ tự file).
  - Builder phải thoả CHECK thật của DB (`products.images/sizes/colors` không rỗng): lỗi này mock không bao giờ bắt được.
- **Kiểm chứng:** 11 flow test xanh, chạy lặp 15 lần liên tiếp không lỗi; phá `applyOrderPaid` (không chuyển `confirmed`) thì 2 flow đỏ, khôi phục thì xanh lại. `yarn test` (729 test) và `nest build` vẫn qua.
- **Docs đã cập nhật:** `docs/modules/common.md` (4.1, 4.11, 4.12, 4.13), `docs/modules/order.md` và `docs/modules/payment.md` (4.7), `docs/README.md`, `docs/specs/README.md`.
- **Test matrix:** `test/README.md` (5 dòng Có, các luồng chính còn lại ghi Unit / Chưa có).
