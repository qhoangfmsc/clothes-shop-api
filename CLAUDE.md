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
│   ├── cart/
│   ├── address/
│   ├── wishlist/
│   ├── review/
│   ├── media/      # Admin media upload (Supabase Storage REST + media_files metadata table)
│   ├── user/        # entity + service + admin controller
│   ├── auth/        # Google login, JWT strategy
│   ├── shipping/    # Static data, no DB
│   └── size-guide/  # Static data, no DB
└── migrations/      # TypeORM migrations
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

## Docs (`docs/`) — quy trình khép kín Docs → Feature → Docs (BẮT BUỘC)

`docs/` là tài liệu BE thực tế theo **từng module**: `docs/modules/<module>.md` (mục lục `docs/README.md`, hạ tầng dùng chung ở `docs/modules/common.md`). Chỉ ghi những gì đã có trong code; KHÔNG viết tài liệu FE, roadmap, kế hoạch.

Mọi việc chạm `src/modules`, `src/common`, `src/core`, `src/migrations` phải đi đủ 3 bước, đúng thứ tự:

1. **Đọc & hiểu trước**: đọc `docs/modules/<module>.md` + code thực tế của mọi module bị ảnh hưởng (tạo module mới thì đọc `docs/README.md` + `common.md`). Chưa hiểu thì hỏi, không đoán, không code.
2. **Làm feature**: theo các chuẩn trong file này.
3. **Viết / cập nhật docs ngay trong cùng lượt**: tạo `docs/modules/<module>.md` (module mới) hoặc sửa các mục bị ảnh hưởng (module cũ) + `common.md` nếu chạm phần dùng chung.

**Chưa cập nhật docs = chưa xong.** Báo cáo cuối phải nêu file docs đã tạo/sửa. Chỉ được bỏ qua docs khi thay đổi không đổi hành vi (đổi tên biến nội bộ, format, comment, test thuần) và phải nói rõ.

Luật: `.claude/rules/module-docs.md` · Quy trình + template + checklist: skill `module-docs` (`.claude/skills/module-docs/`).

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
npx biome check src/  # Lint
npx typeorm migration:run -d data-source.ts  # Run migrations
```
