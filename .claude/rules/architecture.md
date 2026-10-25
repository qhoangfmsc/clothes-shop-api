# Rule: kiến trúc — modular monolith, cell, phụ thuộc một chiều

Luật bắt buộc khi thiết kế (spec) và viết code trong `src/`. Mục lục các rule kỹ thuật: `engineering-principles.md`. Giáo trình và ví dụ mở rộng: skill `design-principles`. Quyết định lịch sử: `docs/specs/common/0002, 0006, 0011, 0012`.

## 1. Kiến trúc là gì và dự án chọn gì

**Kiến trúc** là cách chia hệ thống thành các phần, mỗi phần chịu trách nhiệm gì và được phép biết gì về phần khác. Kiến trúc tốt làm cho **đổi một chỗ không vỡ chỗ khác** và cho người đọc **biết ngay mã nằm ở đâu**.

Dự án là **modular monolith**: một ứng dụng NestJS, một database, chia thành module theo nghiệp vụ (`product`, `order`, `payment`...). Mỗi module sở hữu bảng và logic của nó.

| Chọn | Vì sao | Cái giá |
|---|---|---|
| Một ứng dụng, một DB | Giao dịch tiền cần transaction nguyên tử giữa đơn, thanh toán, hoàn tiền; một đội nhỏ; triển khai đơn giản | Mọi module cùng deploy; phải giữ kỷ luật ranh giới bằng quy ước + test (mục 9) |
| Module theo nghiệp vụ | Người đọc tìm theo tên nghiệp vụ, không theo loại file | Có chỗ đọc chéo module (mục 4) |
| Không microservice, không CQRS đầy đủ, không event sourcing | Chưa có vấn đề nào chúng giải mà cấu trúc hiện tại không giải được | Muốn tách sau này phải làm lại ranh giới giao dịch |

Chỉ đổi lựa chọn khi một spec chỉ ra vấn đề **đo được** mà cấu trúc này không giải được.

## 2. Bản đồ thư mục

```
src/
├── common/      Hạ tầng dùng chung, KHÔNG biết nghiệp vụ: base entity, decorator, guard, filter, pipe, error code, permission, util
├── core/        Khởi tạo ứng dụng: TypeORM, Swagger, validate env, cấu hình app (dùng chung cho main.ts và flow test)
├── modules/     Nghiệp vụ, một thư mục một module
└── migrations/  Lịch sử schema (chỉ thêm, không sửa file đã chạy trên production)
test/            Flow test (HTTP + Postgres thật) và hạ tầng test
docs/            modules/ (hiện trạng) · specs/ (thiết kế)
tools/           Công cụ kiểm tra của repo (check-docs, check-change, impact)
```

## 3. Phân lớp trong một module

```
Controller ──► Service (use case) ──► EntityManager / Repository ──► DB
    │              │
    │              └──► util thuần (*.util.ts)          Presenter (*.presenter.ts) map entity → response
    └──► DTO (validate input)
```

| Lớp | Việc duy nhất | Được biết | Không được |
|---|---|---|---|
| Controller | Nhận HTTP, gắn guard/quyền/Swagger, gọi **một** method service | DTO, service, decorator | Chứa logic nghiệp vụ, inject Repository/DataSource, tự `try/catch` |
| Service (use case) | Điều phối một nghiệp vụ: kiểm tra, mở transaction, ghi, trả kết quả | Entity, util, service module khác (được export), presenter | Biết định dạng HTTP; biết chi tiết dịch vụ ngoài (SePay, Supabase) ngoài adapter |
| Util / hàm thuần | Tính toán, parse, kiểm tra điều kiện, bảng chuyển trạng thái | Kiểu và hằng | I/O (DB, mạng, thời gian hệ thống không truyền vào) |
| Presenter | Entity → response (tiền `Vnd`/`Usd`, ẩn cột thô) | Entity, `money()` | Gọi DB |
| Entity | Ánh xạ bảng, kiểu cột | `common/base` | Chứa nghiệp vụ |
| DTO | Hình dạng và ràng buộc input (class-validator) | `common/dto`, hằng enum | Logic nghiệp vụ |

Ví dụ mẫu: `order/query/order-query.controller.ts` chỉ lấy `user.id` và chuyển cho `OrderQueryService`.

## 4. Module, cell và cách chia

### 4.1 Khi nào chia

| Tình huống | Cấu trúc | Ví dụ |
|---|---|---|
| Một nhóm chức năng, dưới ~8 file | **Phẳng**: `<module>/` chứa controller, service, entity, dtos trực tiếp | `category`, `cart`, `address`, `wishlist` |
| Nhiều nhóm chức năng cùng module | **Cell**: mỗi nhóm một thư mục `<module>/<cell>/`, cộng `shared/` | `order/` (checkout, status, query), `payment/`, `return/`, `review/`, `product/` |
| Một thực thể có vòng đời, bảng, route riêng, và nhiều nơi cần dùng | **Module cấp cao riêng** | `refund` (tách từ `payment`) |

### 4.2 Cell

Một cell là một nhóm chức năng khép kín: controller + service + dtos + util + spec của chính nó. Nhìn tên thư mục là biết "phần nào lo việc gì".

```
payment/
├── attempt/          phiên QR của khách và vòng đời phiên
├── transaction/      giao dịch ngân hàng, xác nhận thủ công của admin
├── order-payments/   tổng quan thanh toán theo đơn (admin)
├── sepay/            webhook SePay (adapter + controller)
├── shared/           entity, hằng, presenter, util dùng chung
└── payment.module.ts
```

Luật cell (máy ép bằng `architecture.spec.ts`):
- Cell chỉ import **chính nó**, `shared/`, và các cell được **khai báo** ở `CELL_DEPENDENCIES` (đồ thị không vòng, mỗi cạnh phải được dùng thật).
- `shared/` không import cell nào.
- Test-utils dựng service của một cell nằm trong cell đó, không đặt ở `shared/`.
- Cell mới trong module có sẵn: cần spec (đầy đủ nếu đổi ranh giới), cập nhật docs module mục 3 và 4.9.

### 4.3 Query/Command split

Mỗi cell tách **ghi** và **đọc**: `XService` (ghi, có transaction) và `XQueryService` (đọc, lọc/phân trang/admin). Đọc-sau-ghi (ghi xong trả view) gọi service đọc của chính cell. Lý do và giới hạn: pattern **CQS** ở `design-patterns.md`. Cái giá: hai class thay một.

## 5. Hướng phụ thuộc và ranh giới giữa module

Quy tắc:
1. **Một chiều, không vòng, không `forwardRef`** ở đồ thị module Nest (máy ép).
2. `common/` và `core/` không import `modules/` (máy ép; ngoại lệ duy nhất trong allowlist).
3. Module A dùng module B qua **service được export** của B. Chưa có thì thêm method vào service chủ rồi export, không với tay vào bảng.
4. **Ghi** bảng của module khác chỉ qua hàm do module chủ cung cấp (nhận `EntityManager`), ví dụ `applyOrderPaid`, `refreshProductRating`. Máy ép (`CROSS_MODULE_WRITES`).
5. **Đọc** chéo module (import entity để join/kiểm tra) được phép khi có chủ đích và ghi ở docs mục 4.8 (vd `review` đọc `Order` để kiểm tra đã nhận hàng).
6. Module nhỏ dùng nhau qua module Nest `imports`/`exports`, không `provide` lại service của module khác.

Đồ thị phụ thuộc hiện tại (suy ra từ import; công cụ `yarn impact` tính lại được):

| Module | Phụ thuộc (import) |
|---|---|
| order | shipping, user, address, cart, currency, payment, refund, product |
| payment | user, order, currency |
| refund | user, payment, order, return |
| return | user, order, refund, shipping |
| review | user, order, media, product |
| pending-count | user, order, payment, refund, return, review |
| product | category, currency |
| cart / collection / wishlist | product (+ user, currency) |
| shipping / currency / site-config | currency ↔ site-config ↔ shipping (cấu hình) |
| category, media, size-guide, user | không phụ thuộc module khác |

Hệ quả cho việc kiểm tra: đổi `payment` kéo theo `order`, `refund`, `return`, `review`, `pending-count` (xem `change-impact.md`).

## 6. Transaction, khoá và nhất quán

- **Ranh giới transaction ở service use case** (`dataSource.transaction`). Mọi ghi liên quan tiền hoặc trạng thái nằm trong **một** transaction.
- Gọi service/hàm của module khác trong cùng nghiệp vụ thì **truyền `EntityManager`**.
- **Khoá dòng chỉ qua `findLocked`** (`common/base/lock.util.ts`); không viết `lock: { mode: ... }` rải rác (máy ép).
- **Thứ tự khoá cố định**: `orders` trước, rồi bản ghi con (`payment_attempts`, `returns`...). Ghi thứ tự ở comment đầu method khi lấy ≥ 2 khoá. Hợp đồng khoá được flow `lock-contract.flow.ts` kiểm.
- **Idempotency** cho đầu vào lặp (webhook): UNIQUE ở DB + bắt lỗi `23505` thành kết quả "đã xử lý".
- **Eventual consistency** chỉ cho phản ứng phụ chấp nhận được (thông báo, cache). Không dùng event cho bước cần nguyên tử với tiền.

## 7. Tích hợp bên ngoài

- Bọc ở **biên**: hàm thuần parse/verify (`sepay-payload.util.ts`, `sepay-signature.util.ts`) + service điều phối. Service nghiệp vụ nhận kiểu của mình, không nhận JSON thô của nhà cung cấp.
- Mỗi nhà cung cấp nằm trong **cell riêng** (`payment/sepay/`); thêm nhà cung cấp thứ hai (PayPal) = cell mới `payment/paypal/` cộng chỗ chung (xem `design-patterns.md`, Strategy, điều kiện kích hoạt).
- Biến môi trường dịch vụ ngoài: validate lúc khởi động ở `core/env.validation.ts` (production sai thì không chạy), thêm vào `test/support/test-env.ts` (giá trị rỗng), ghi tên biến ở docs module.
- Flow test không ra mạng: giả đầu vào ngoài ở biên, không mock service nội bộ.

## 8. Dữ liệu

- Schema chỉ đổi bằng **migration** (`synchronize: false`); migration hỏng làm cả bộ flow test đỏ.
- Ràng buộc ở 3 tầng (xem `CLAUDE.md`): DTO, service, DB (CHECK, FK, UNIQUE, NOT NULL, INDEX).
- Tiền là VND nguyên (`bigint` + `bigintTransformer`), USD chỉ là giá trị suy ra khi trả API.
- Entity trả ra API luôn qua presenter.

## 9. Kích thước và độ phức tạp

- Service > ~300 dòng hoặc > 5 dependency → dừng, tách theo use case hoặc đọc/ghi (máy ép, hai allowlist đang rỗng).
- Module phẳng dần > ~8 file có ≥ 2 nhóm chức năng → chia cell (cần spec).
- Hàm ưu tiên ≤ ~50 dòng.

## 10. Ai ép luật nào

| Luật | Ép bởi |
|---|---|
| `common`/`core` không import `modules` | `architecture.spec.ts` |
| Đồ thị module không vòng, không `forwardRef`, không import `undefined` | `architecture.spec.ts` |
| Không export thừa trong `common`/`core` | `architecture.spec.ts` |
| Lỗi qua `throwAppError` | `architecture.spec.ts` |
| Khoá dòng qua `findLocked` | `architecture.spec.ts` |
| Ghi chéo module qua hàm module chủ | `architecture.spec.ts` |
| Cột `status` dùng type union | `architecture.spec.ts` |
| Cell độc lập, cạnh khai báo, không vòng | `architecture.spec.ts` |
| Service ≤ 300 dòng / ≤ 5 dependency | `architecture.spec.ts` |
| Controller không chạm DB (không inject Repository/DataSource) | `conventions.spec.ts` |
| Route–quyền không đổi ngầm | `test/flows/access` (snapshot) |
| Controller mỏng về nội dung, phân lớp đúng, thứ tự khoá | Review (chưa có máy ép) |

Đỏ vì vi phạm mới: sửa code, **không** thêm vào allowlist. Allowlist chỉ co lại.

## 11. Phản mẫu (cấm)

- Service "làm tất cả" (God service); controller gọi repository.
- Module A `TypeOrmModule.forFeature([EntityCủaB])` để ghi vào bảng của B.
- Đưa use case vào `shared/` để né phụ thuộc cell (thay vì khai báo cạnh).
- `forwardRef`, vòng phụ thuộc, `common/` import `modules/`.
- Tách module/cell chỉ vì file nhiều nhưng cùng một lý do để đổi.
- Chia thư mục cho module nhỏ (nhiều thư mục hơn file).

## 12. Checklist review kiến trúc

- [ ] Mã mới nằm đúng lớp (controller mỏng; logic ở service/util)?
- [ ] Phụ thuộc đi một chiều; không với tay vào bảng module khác để ghi?
- [ ] Thêm cạnh cell → đã khai báo `CELL_DEPENDENCIES` và nêu lý do ở spec?
- [ ] Transaction bao đủ các ghi liên quan; khoá theo thứ tự; dùng `findLocked`?
- [ ] Tích hợp ngoài bọc ở biên; env mới đã validate và có trong `test-env.ts`?
- [ ] Service còn trong trần kích thước?
- [ ] `yarn test` (gồm `architecture.spec.ts`) xanh mà không đụng allowlist?
