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
