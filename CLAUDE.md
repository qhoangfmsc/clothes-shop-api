# CLAUDE.md — Clothes Shop API

## Stack

NestJS 11 + TypeORM 0.3 + PostgreSQL + JWT (Passport) + Google OAuth + Swagger

## Architecture

```
src/
├── common/          # Base entity, decorators, guards, exceptions, permissions
├── core/            # CoreModule: TypeORM config, swagger, global setup
├── modules/         # Feature modules (one folder per domain)
│   ├── product/     # controller + admin controller + service + entity + dtos
│   ├── category/    # controller + admin controller + service + entity + dtos
│   ├── collection/  # controller + admin controller + service + entity + dtos
│   ├── order/       # controller + admin controller + service + entity + dtos
│   ├── payment/     # cell: attempt/ transaction/ order-payments/ sepay/ shared/ (VietQR + SePay)
│   ├── refund/      # hoàn tiền (module riêng, chỉ đọc entity của payment)
│   ├── cart/
│   ├── address/
│   ├── wishlist/
│   ├── review/
│   ├── media/      # Admin media upload (Supabase Storage REST + media_files metadata table)
│   ├── currency/    # Tỷ giá VND/USD (site_configs EXCHANGE_RATE), CurrencyService
│   ├── user/        # entity + service + admin controller
│   ├── auth/        # Google login, JWT strategy
│   ├── shipping/    # Static data, no DB
│   └── size-guide/  # Static data, no DB
└── migrations/      # TypeORM migrations
test/                # Flow test (Postgres thật): flows/<module>/*.flow.ts, support/, README.md = test matrix
docs/
├── modules/         # Docs hiện trạng, mỗi module một file (viết SAU khi code)
└── specs/           # Tech spec theo module: <module>/NNNN-slug.md (viết TRƯỚC khi code)
```

## Auth & Permission

- Global `JwtAuthGuard` — mọi route cần JWT trừ khi có `@Public()`
- Global `PermissionsGuard` — kiểm tra `@Permissions(...)` trên route
- Admin (`role='admin'`) tự động pass mọi permission
- Permission codes: `src/common/permissions/permissions.constant.ts`
- Decorators: `@Public()`, `@Permissions(...)`, `@CurrentUser()`

## Validation Standards (Production)

Khi tạo CRUD hoặc endpoint mới, PHẢI validate ở **3 tầng**:

### 1. DTO Level (class-validator)
```typescript
@IsString() @IsNotEmpty() @MaxLength(255)
@Min(0) @ArrayMinSize(1)
@IsIn(['active', 'disabled'])
@ValidateNested({ each: true }) + @Type(() => NestedDto)
```

### 2. Service Level (Business Logic)
- **Unique check**: slug, SKU, email — dùng `ensureXxxUnique()` private method + throwAppError
- **FK existence**: categoryId, subcategoryId, productIds — verify tồn tại trước khi save
- **Cross-field validation**: subcategory phải thuộc category, originalPrice >= price
- **State transition**: order status flow, không tự sửa role của chính mình
- **Catch DB errors**: bọc `try/catch` để bắt FK RESTRICT lỗi và trả về error code đẹp
- Dùng `throwAppError(errorCode, message?)` thay vì throw HttpException thô

### 3. Database Level (Migration)
- **CHECK constraints**: price > 0, rating 1-5, status IN (...), role IN (...)
- **FK constraints**: ON DELETE RESTRICT / CASCADE / SET NULL phù hợp
- **UNIQUE constraints**: slug, SKU, email, (category_id + slug) cho subcategory
- **NOT NULL**: các trường bắt buộc
- **INDEX**: tất cả FK columns + columns được query thường xuyên

### Error Code Format
```
[MM][EE] — 4 digits
MM = Module prefix
EE = Error code trong module
```
File: `src/common/exceptions/error-codes.ts`

## List API Standards (BẮT BUỘC, mọi API list public + admin)

Một bộ chuẩn duy nhất cho phân trang, sort, search, filter, response — KHÔNG tự chế param/default/shape riêng cho từng module.
Khi tạo hoặc sửa API list, dùng skill `list-api` (`.claude/skills/list-api/SKILL.md`) để làm theo checklist.

**Phân trang** (`@common/base/pagination.util` + `@common/dto/pagination-query.dto`):
- Query DTO extends `PaginationQueryDto` — dùng cho cả public lẫn admin, không có biến thể riêng.
- `page` mặc định 1 (`DEFAULT_PAGE`), `limit` mặc định **25** (`DEFAULT_PAGE_SIZE`), tối đa **200** (`MAX_PAGE_SIZE`). Cấm hardcode 24/20/100 hay tự khai báo lại `page`/`limit`/`@Max`.
- Service lấy giá trị bằng `const { page, limit } = getPaging(query)`; không `query.limit ?? 24`, không `limit = 25` trong destructure.

**Sort**:
- Tham số tên **`sort`** (không phải `sorts`), một field duy nhất, khai báo bằng `@SortField([...fields], defaultSort)` (`@common/decorator/sort-field.decorator`).
- `sort=field` = tăng dần (ASC), `sort=-field` = giảm dần (DESC). KHÔNG dùng `newest`, `oldest`, `price_asc`, `name_desc`, `rating_desc`...
- Service: `const { field, direction } = parseSort(sort, '<defaultSort>')` (`@common/base/sort.util`), `defaultSort` phải trùng với `@SortField`. Không tự `startsWith('-')`, không `switch` theo tên sort.
- Danh sách có thứ tự do admin quản lý (vd category) dùng cột thứ hạng duy nhất như `Category.priority` (1 = cao nhất, UNIQUE DEFERRABLE, tạo mới = max+1, update/xoá/reorder dịch chỗ trong transaction + advisory lock).

**Search**: tham số `search`, khai báo bằng `@SearchField('<các cột được tìm>')` (`@common/decorator/search-field.decorator`), tối đa 255 ký tự. Không có `q`/`keyword` riêng (trừ autocomplete).

**Filter**:
- Tên param = tên field của resource (`status`, `role`, `season`, `badge`...). Filter theo quan hệ: admin lẫn public đều lọc theo **slug** (`category`, `subcategory`), riêng id của user là `userId`.
- Mỗi filter là `@IsOptional()` + `@IsString()`, enum dùng `@IsIn(...)`, chuỗi có `@MaxLength`. Khoảng giá trị dùng cặp `minX`/`maxX` (`minPrice`, `maxPrice`, `@IsInt @Min(0)`). Đa giá trị dùng chuỗi ngăn bằng dấu phẩy (`sizes=S,M,L`).
- Giá trị enum lặp ở nhiều DTO (status, role, order status...) khai báo 1 chỗ: `@common/constants/enum-values.constant` (`ACTIVE_STATUSES`, `USER_ROLES`) hoặc `ORDER_STATUSES`; DTO create/update và query filter cùng import, không gõ lại literal.
- Filter ở public và admin của cùng resource phải cùng tên và cùng kiểu giá trị (admin có thể có thêm filter).

**Response**: mọi list trả `paginated(data, total, page, limit)` (`@common/base/pagination.util`) → `{ data, total, page, limit, totalPages }`. List dùng `typeormListQuery` (media) thì map `items` rồi trả bằng `paginated()`. List không phân trang (address, wishlist, site-config) chỉ trả `{ data, total }`.

**Guard**: `src/common/dto/list-query.dto.spec.ts` tự quét mọi `*-query.dto.ts` và kiểm tra kế thừa `PaginationQueryDto`, default 1/25, `limit <= 200`, `sorts` bị từ chối, whitelist sort. Query DTO không phải list (vd autocomplete) thêm vào `NOT_LIST_DTO_FILES` trong spec đó. Thêm hoặc sửa list API → chạy `yarn test`.

**Thay đổi chuẩn/hành vi API** (đổi default, đổi sort, đổi shape...) phải cập nhật file module tương ứng trong `docs/modules/` (và `docs/modules/common.md` nếu chạm helper dùng chung). Không viết tài liệu riêng cho FE.

## Tiền tệ (BẮT BUỘC, mọi API có tiền)

- **VND là tiền gốc**, lưu số nguyên (`bigint` + `bigintTransformer` từ `@common/base/column-transformers`). USD chỉ là giá trị suy ra khi trả API (`vndToUsd`, làm tròn 2 chữ số), KHÔNG lưu USD, KHÔNG tính toán/so sánh/sort/lọc bằng USD.
- Mọi field tiền trong response có đủ cặp `<tên>Vnd` + `<tên>Usd` (`money()`/`moneyOrNull()` ở `@common/utils/money.util`); body/query nhận tiền chỉ nhận VND nguyên (hậu tố `Vnd`, trần `MAX_MONEY_VND`). Không trả field tiền trần (`price`, `total`, `amount`).
- Tỷ giá lấy từ `CurrencyService.getVndPerUsd()` (dòng `EXCHANGE_RATE` của site_configs). Dữ liệu danh mục/giỏ dùng tỷ giá hiện tại; dữ liệu gắn với đơn (đơn, thanh toán, hoàn tiền, trả hàng) dùng `orders.exchange_rate` đã chốt lúc checkout.
- Entity trả thẳng ra API phải đi qua presenter (`presentProduct`, `presentOrder`, `payment.presenter`) — không trả entity có cột tiền thô.

## Quy trình làm việc: Đọc → Spec → Code + Test → Docs (BẮT BUỘC)

Mọi việc chạm `src/modules`, `src/common`, `src/core`, `src/migrations` phải đi đủ 5 bước, đúng thứ tự. Dùng skill `feature-workflow` (`.claude/skills/feature-workflow/`) để làm theo checklist; luật ở `.claude/rules/feature-workflow.md`.

1. **Đọc & hiểu trước**: đọc `docs/modules/<module>.md`, code thực tế, spec cũ `docs/specs/<module>/` của mọi module bị ảnh hưởng (tạo module mới thì đọc `docs/README.md` + `common.md`). Chưa hiểu thì hỏi, không đoán, không code.
2. **Tech spec trước khi code** (skill `tech-spec`): `docs/specs/<module>/NNNN-slug.md` — vấn đề, phương án, kiến trúc, design pattern, kiểm tra SOLID, dữ liệu, luồng, lỗi, kế hoạch test. Cỡ đầy đủ / rút gọn / miễn theo bảng trong rule. Quyết định thiết kế đáng kể thì trình người dùng trước khi code.
3. **Code + test cùng lượt**: theo spec, `.claude/rules/engineering-principles.md` và các chuẩn trong file này; test theo `.claude/rules/testing.md` (skill `module-test`).
4. **Docs hiện trạng**: `docs/modules/<module>.md` (+ `common.md` nếu chạm phần chung, `docs/README.md` nếu thêm module); spec điền mục 6 và chuyển Implemented; cập nhật `test/README.md`.
5. **Đối chiếu & báo xong**: type check, lint, `yarn test`, `yarn test:flows` đều qua; docs/spec/test khớp code.

**Chưa đủ 5 bước = chưa xong.** Báo cáo cuối nêu: file spec, docs, test đã tạo/sửa + 1–3 dòng về pattern/nguyên lý đã áp dụng và vì sao. Chỉ được bỏ qua khi thay đổi không đổi hành vi (đổi tên biến nội bộ, format, comment, test thuần) và phải nói rõ.

| Loại tài liệu | Nơi | Trả lời | Viết khi |
|---|---|---|---|
| Docs module | `docs/modules/<module>.md` | Hiện giờ hệ thống làm gì | Sau code, luôn khớp code |
| Tech spec | `docs/specs/<module>/NNNN-slug.md` | Vì sao, thiết kế thế nào | Trước code |
| Test | `src/**.spec.ts`, `test/flows/` | Còn đúng không | Cùng code |

`docs/modules/` chỉ ghi cái đã có trong code; KHÔNG viết tài liệu FE, roadmap, kế hoạch. Luật docs: `.claude/rules/module-docs.md` · Template + checklist: skill `module-docs`.

## Nguyên tắc kỹ thuật: Design pattern · Kiến trúc · Convention · SOLID (BẮT BUỘC)

Mục lục + nguyên tắc nền: `.claude/rules/engineering-principles.md`. Mỗi chủ đề một rule chi tiết (là gì, áp dụng thế nào ở đây, ví dụ trong repo, cái gì máy ép, checklist):

| Chủ đề | Rule |
|---|---|
| Kiến trúc (modular monolith, cell, phụ thuộc, transaction, tích hợp ngoài) | `.claude/rules/architecture.md` |
| Design pattern (đang dùng / khi nào mới dùng / không dùng) | `.claude/rules/design-patterns.md` |
| SOLID (5 câu hỏi tự kiểm) | `.claude/rules/solid.md` |
| Coding convention (đặt tên, lỗi, log, config, API, test, git) | `.claude/rules/coding-conventions.md` |

Kiến thức, mẫu code, checklist: skill `design-principles`. Tóm tắt những điều không được quên:

- **Pattern là công cụ, không phải mục tiêu**: chỉ dùng khi gọi tên được vấn đề cụ thể; "không dùng pattern" là hợp lệ; rule of three (lần 3 mới gom). Ghi pattern và cái giá ở spec mục 3.3 và một dòng comment ở chỗ định nghĩa.
- **Kiến trúc**: Controller (mỏng) → Service (use case) → Repository/EntityManager, Presenter map response; phụ thuộc một chiều, không vòng, `common/` không import `modules/`; module khác dùng nhau qua service được export; logic thuần tách thành `*.util.ts`; ghi tiền/trạng thái trong một transaction với thứ tự khoá cố định; service > ~300 dòng hoặc > ~5 dependency thì dừng và tách.
- **Cell**: module có nhiều nhóm chức năng thì mỗi nhóm là một thư mục (`<module>/<cell>/`) cộng `shared/`; cell chỉ import chính nó, `shared/` và cell đã khai báo (ép bởi `architecture.spec.ts`); thực thể độc lập (vòng đời, bảng, route riêng) thì tách thành module cấp cao. Quy ước: `docs/specs/common/0011-module-cells.md`.
- **Convention**: lỗi luôn `throwAppError` + error code; trạng thái/enum là `as const` + type union dùng chung DTO ↔ entity; tên file `kebab-case` + hậu tố vai trò; không magic value, không code chết, không `console.*`; comment ít và ngắn (`.claude/rules/comments.md`); Biome là nguồn sự thật format. Quy ước quan trọng được test ép (`architecture.spec.ts`, `conventions.spec.ts`, allowlist chỉ co lại).
- **SOLID**: S (một lý do để đổi), O (thêm dữ liệu thay vì thêm nhánh `if`), L (kế thừa chỉ để dùng chung cột/DTO), I (nhận kiểu hẹp đúng nhu cầu), D (phụ thuộc interface ở biên ngoài như cổng thanh toán/storage). Mỗi spec điền bảng SOLID.
- Code cũ lệch chuẩn: sửa phần mình chạm tới, không refactor hàng loạt ngoài phạm vi; điểm còn lệch ghi ở `docs/modules/common.md` mục 4.13.

## Test (BẮT BUỘC đi kèm mọi thay đổi hành vi)

- **Unit** (`yarn test`): `src/**/*.spec.ts` cạnh code, mock, không DB.
- **Flow** (`yarn test:flows`): `test/flows/<module>/*.flow.ts`, HTTP thật + Postgres thật (docker, cổng 55432, DB `*_test`, schema dựng từ migration). Bắt buộc cho luồng chính; chạm luồng tiền/trạng thái đơn/thanh toán/hoàn tiền/trả hàng/auth thì phải mở rộng flow tương ứng. Sửa bug: viết test tái hiện trước.
- Độ phủ endpoint do máy đo cuối `yarn test:flows` (ca thành công + ca lỗi mỗi route, ratchet `test/coverage-baseline.json`): route mới bắt buộc kèm test, phủ thêm thì `yarn test:coverage:update`.
- Bảng luồng nào có test nào: `test/README.md` — cập nhật cùng lượt khi thêm/đổi test. Hạ tầng: `docs/specs/testing/0001-flow-test-infrastructure.md`.
- Chiến dịch test toàn diện (ca đúng, ca lỗi, auth, quyền cho mọi route) đã xong 25/25 batch (nhật ký `test/PROGRESS.md`); đợt phủ lớn mới dùng lại skill `test-campaign` theo lượt 1 batch ≤ 5 route.

## Migration Convention

```bash
# Tạo timestamp từ Date.now()
node -e "console.log(Date.now())"
# File: src/migrations/{timestamp}-{PascalCaseName}.ts
```

## Commands

```bash
yarn start:dev        # Dev server (port 7001)
npx nest build        # Build
npx tsc --noEmit      # Type check
yarn lint             # Lint (biome: src + test)
yarn test             # Unit test (mock)
yarn test:flows       # Flow test (tự bật Postgres test bằng docker; cần Docker chạy)
yarn test:db:down     # Tắt Postgres test
npx typeorm migration:run -d data-source.ts  # Run migrations
```
