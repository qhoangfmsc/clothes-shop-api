# Rule: coding convention — viết để người sau đọc như một người viết

Luật bắt buộc khi viết code, test, docs, commit. Mục lục: `engineering-principles.md`. Chuẩn nghiệp vụ gốc (validation 3 tầng, list API, tiền tệ, error code, migration) ở `CLAUDE.md`; rule này là phần quy ước còn lại và cách chúng được kiểm.

> `.agent/skills/nest-best-practices/` là bộ mẫu NestJS chung (nhắc `AuthGuard`, `Roles`, `ApiEndpoint`, BullMQ...) không phản ánh dự án này. Khi mâu thuẫn, **rule trong `.claude/rules/` và code hiện có là nguồn sự thật**.

## 1. Convention là gì, vì sao ép

Convention là thoả thuận để mọi file trông như một người viết: người đọc đoán đúng file nằm đâu, hàm làm gì, lỗi trả thế nào mà không phải mở thử. Khi lệch, review tốn thời gian vào chuyện hình thức thay vì thiết kế. Vì thế: **cái máy kiểm được thì để máy kiểm** (Biome, test), cái còn lại là checklist review (mục 12).

## 2. Định dạng — Biome là nguồn sự thật

Cấu hình `biome.json`: thụt 2 dấu cách, rộng tối đa 140 cột, nháy đơn, dấu phẩy cuối (`all`), có dấu chấm phẩy, tự sắp xếp import. `yarn lint` phải sạch (cảnh báo cũng chặn, xem `release-gate.md`); `yarn lint:fix` để sửa. Không tranh luận format ở review.

## 3. Đặt tên

| Đối tượng | Quy ước | Ví dụ |
|---|---|---|
| File | `kebab-case` + hậu tố vai trò `x.<vai trò>.ts` | `order-status.service.ts`, `payment.presenter.ts`, `sepay-payload.util.ts`, `admin-order-query.dto.ts` |
| Hậu tố vai trò hợp lệ | controller, service, module, entity, dto, presenter, util, constant, decorator, guard, filter, middleware, strategy, scheduler, config, validators, validation, transform, exception, setup, storage; test: `.spec.ts`, `.test-utils.ts` | — |
| Thư mục | `kebab-case`; `dtos/` cho DTO; `shared/` cho phần dùng chung của cell | `payment/attempt/dtos/` |
| Class | `PascalCase`, **trùng tên file** (service/controller/module/scheduler/guard) | `order-status.service.ts` → `OrderStatusService` |
| Hàm/biến | `camelCase`, hàm bắt đầu bằng **động từ** | `findLocked`, `assertOrderPayable`, `applyOrderPaid`, `presentOrder` |
| Tiền tố động từ có nghĩa cố định | `assert*` (ném lỗi nếu sai), `ensure*` (kiểm tra điều kiện, ném nếu vi phạm), `apply*` (hiệu ứng phụ có tên), `present*` (map entity → response) | — |
| Hằng | `UPPER_SNAKE_CASE`; mảng giá trị `*_STATUSES`; type union cùng tên số ít | `ORDER_STATUSES` → `OrderStatus` |
| Enum số (error code, permission) | `E<Module>ErrorCode`, `Permission` | `EOrderErrorCode.ORDER_NOT_FOUND` |
| Cột DB / bảng | `snake_case` số nhiều cho bảng | `payment_attempts.created_at` |
| Constraint DB | prefix `PK_`, `FK_`, `UQ_`, `CK_`, `IDX_` | `UQ_users_email` |
| Route | `kebab-case`, tiền tố `api/`, admin `api/admin/` | `api/admin/payments`, `api/my-reviews` |
| Migration | `{Date.now()}-PascalCaseName.ts` | `1792169276231-VndBaseCurrency.ts` |
| Test | tên mô tả **hành vi** bằng câu | `it('refuses an order that is unpaid (1802) and writes nothing')` |
| Viết tắt | Không dùng viết tắt khó hiểu; chỉ những từ quen thuộc (`dto`, `id`, `qr`, `vnd`) | — |

Máy ép: tên file `kebab-case` + hậu tố vai trò, class đặt theo tên file, DTO trong `dtos/` (`conventions.spec.ts`).

## 4. Bố cục file và import

- Một file một vai trò chính; một file `*.service.ts` export một service. Hằng và type dùng chung ở `*.constant.ts`.
- **Import:** alias `@common/*`, `@core/*`, `@/*` cho thứ ở **ngoài module**; đường dẫn tương đối trong cùng module/cell. Biome tự sắp xếp. Không import vòng.
- Thứ tự trong class: field → constructor → public method → private method. Method public theo thứ tự luồng nghiệp vụ.
- Cell chỉ import chính nó, `shared/`, cell đã khai báo (xem `architecture.md` mục 4.2).

## 5. TypeScript

- `strictNullChecks` bật: xử lý `null/undefined` rõ ràng; dùng `?.`, `??`. Tránh `!` trừ khi bất biến đã được kiểm ngay trước đó.
- **Không dùng `any`** trong code ứng dụng: Biome `noExplicitAny` ở mức `warn` (= lỗi vì `yarn lint` có `--error-on-warnings`); chỉ `*.spec.ts`, `*.test-utils.ts` và `test/**` được dùng (cho giả lập). Dùng kiểu hẹp, `unknown` + thu hẹp, hoặc generic. `catch (err)` để `err` là `unknown` rồi nhận diện bằng helper (`isDbError`, `isUniqueViolation`), không ép `any`.
- Trạng thái/enum: `as const` + type union dùng chung DTO ↔ entity; cột entity dùng đúng type union đó. **Không** khai báo `status: string` kèm comment liệt kê (máy ép).
- `async/await`, không trộn `.then`. Không `Promise` trôi (không `await` thì phải có lý do ghi chú).
- Không magic number/string: đưa vào hằng có tên (`PAYMENT_QR_TTL_MS`, `MAX_MONEY_VND`).
- Thời gian truyền vào hàm thuần dưới dạng tham số (`now: Date`), để test được; cột thời gian `timestamp with time zone`.

## 6. Lỗi, log, cấu hình

| Chủ đề | Quy ước | Ép bởi |
|---|---|---|
| Lỗi nghiệp vụ | Luôn `throwAppError(errorCode, message?, status?)` với mã `[MM][EE]` ở `common/exceptions/error-codes.ts`. Không ném `BadRequestException`/`NotFoundException` thô (ngoại lệ trong allowlist có lý do). Mặc định HTTP 400; truyền status khi cần 404/403/409 | `conventions.spec.ts`, `architecture.spec.ts` |
| Mã lỗi mới | Thêm vào enum module; thêm `ErrorMessages` nếu cần; ghi vào bảng lỗi docs module | review |
| Log | `new Logger(Class.name)` của Nest; mức hợp lý (`log`, `warn`, `error`); không log dữ liệu nhạy cảm (token, secret, body, query). Production ghi JSON một dòng mỗi sự kiện; mỗi request có một dòng `event: 'request'` (`requestId`, `path` không query, `status`, `durationMs`); lỗi 5xx ghi kèm `requestId` | `conventions.spec.ts` cấm `console.*`; `request-log.middleware.spec.ts` và `smoke:prod` kiểm dạng JSON, không lộ query |
| Cấu hình | Đọc qua `ConfigService`; **module nghiệp vụ không đọc `process.env` trực tiếp** | `conventions.spec.ts` |
| Biến môi trường mới | (1) thêm vào `core/env.validation.ts` nếu bắt buộc ở production, (2) thêm vào `test/support/test-env.ts` (giá trị giả/rỗng), (3) ghi **tên** biến ở docs module (không ghi giá trị) | `env.validation.spec.ts`, review |
| Secret | Không commit secret thật; `.env.test` chỉ chứa kết nối Postgres test | review, audit |

## 7. API: controller, DTO, response

- **Controller mỏng**: nhận input, gắn decorator, gọi một method service. Mọi route: `@ApiTags`, `@ApiOperation({ summary })`, `@ApiBearerAuth` (nếu cần đăng nhập), và hoặc `@Public()` hoặc `@Permissions(...)` (route quên quyền bị snapshot route–quyền ở `test/flows/access` bắt).
- **DTO** (class-validator) ở 3 tầng validation của `CLAUDE.md`. Query list: kế thừa `PaginationQueryDto`, `@SortField`, `@SearchField` (xem `CLAUDE.md` mục List API; `list-query.dto.spec.ts` ép). `Update*Dto = PartialType(Create*Dto, { skipNullProperties: false })` (`update-dto.spec.ts` ép). Body/query nhận tiền chỉ `…Vnd` nguyên.
- **Response**: list trả `paginated(...)`; entity trả ra API luôn qua presenter; tiền theo cặp `<tên>Vnd` + `<tên>Usd` (`money()`); VND là tiền gốc, USD chỉ suy ra khi trả.
- **Tiền**: lưu `bigint` + `bigintTransformer`, không float, không tính/sort/lọc bằng USD.

## 8. Service và dữ liệu

- Tên method theo use case (`checkout`, `cancel`, `confirmPayment`), không `handle`/`process`.
- Transaction và khoá theo `architecture.md` mục 6; khoá chỉ qua `findLocked`.
- Kiểm tra duy nhất (`ensureXxxUnique`) **cộng** bắt lỗi ràng buộc DB khi hai request đồng thời (`saveOrThrowOnConstraint`).
- Hàm ưu tiên ≤ ~50 dòng, early return, ít lồng nhau.
- **Entity**: kế thừa `BaseEntity` (id nanoid16, createdAt, updatedAt), cột đặt tên `name:` snake_case, không chứa nghiệp vụ.
- **Migration**: một thay đổi một file; CHECK/FK/UNIQUE/INDEX theo `CLAUDE.md`; không sửa migration đã chạy trên production (thêm migration mới); có dòng trong bảng migration của `docs/modules/common.md`.

## 9. Comment

Theo `.claude/rules/comments.md`. Tóm tắt: mặc định không comment; chỉ comment lý do/bất biến/thứ tự khoá/workaround; một dòng (~120 ký tự); tiếng Việt, ngắn, cùng giọng code hiện có; không comment chia mục (`// ====`), không code bị comment out, không nhắc lại tên hàm. Code cũ có comment dài thì tỉa khi chạm tới. Một dòng tên pattern + vấn đề tại chỗ định nghĩa pattern (`design-patterns.md` mục 7).

## 10. Test

- Unit cạnh code `x.service.spec.ts`; flow ở `test/flows/<module>/<luồng>.flow.ts`; test-utils của cell nằm trong cell. Theo `testing.md`.
- Tên test mô tả hành vi; nhánh lỗi assert `errorCode`, không chỉ HTTP status.
- Dữ liệu qua builder (`test/support/builders.ts`), không `INSERT` tay rải rác; không hardcode id; mỗi test độc lập.
- Test không đổi hành vi nhưng đổi code → vẫn chạy toàn bộ.

## 11. Git, commit, PR

- **Nhánh:** `<loại>/<slug-ngắn>` (`refactor/engineering-workflow`, `fix/payment-late-webhook`). `main` là production; không commit trực tiếp (xem `release-gate.md`).
- **Commit:** `<loại>(<module>): <mệnh đề ngắn> (spec <module>/<NNNN>)`. Loại: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `docs+test`. Một commit một ý; thân commit giải thích **vì sao** khi không hiển nhiên.
- **Miễn có dấu vết:** thay đổi không đổi hành vi mà không cập nhật test/docs thì ghi trailer `No-Test: <lý do>` / `No-Docs: <lý do>` trong thân commit (máy kiểm trên PR).
- **PR:** dùng template `.github/pull_request_template.md` (checklist spec, docs, test, phạm vi ảnh hưởng).

## 12. Ai ép luật nào

| Luật | Ép bởi |
|---|---|
| Format, import sắp xếp, import/biến không dùng, `useTemplate`, `useNodejsImportProtocol` | Biome (`yarn lint`, pre-commit, CI) |
| Tên file `kebab-case` + hậu tố vai trò; class trùng tên file; DTO trong `dtos/` | `conventions.spec.ts` |
| Controller không chạm DB; không exception HTTP thô; không `console.*`; module không đọc `process.env` | `conventions.spec.ts` |
| `status` là type union, khoá qua `findLocked`, lỗi qua `throwAppError`, cell, kích thước service | `architecture.spec.ts` |
| Không `any` trong code ứng dụng | Biome `noExplicitAny` (`yarn lint`, pre-commit, CI) |
| Query DTO list, `Update*Dto` | `list-query.dto.spec.ts`, `update-dto.spec.ts` |
| Route có quyền đúng | `test/flows/access` |
| Docs/spec/test khớp code | `yarn check:docs`, `yarn check:change` (xem `release-gate.md`) |
| Đặt tên động từ, hàm ≤ ~50 dòng, comment đúng luật, tiền theo cặp Vnd/Usd | **Chỉ review** (chưa có máy ép) |

## 13. Checklist review convention

- [ ] `yarn lint` sạch, không cảnh báo; tên file/class theo mục 3?
- [ ] Lỗi qua `throwAppError` + mã trong `error-codes.ts`; không `console.*`; không `process.env` trong module?
- [ ] Controller mỏng, có đủ Swagger + `@Public()`/`@Permissions`?
- [ ] DTO validate 3 tầng; list theo chuẩn; tiền theo cặp Vnd/Usd; entity qua presenter?
- [ ] Status là `as const` + type union; không magic value; không code chết?
- [ ] Comment ít, ngắn, đúng chỗ; tên test mô tả hành vi?
- [ ] Commit theo mẫu; PR dùng template?
