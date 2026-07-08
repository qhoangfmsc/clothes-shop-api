# DTO Validation — class-validator + class-transformer

Project dùng **class-validator** (không dùng Zod) cho DTO validation. `ValidationPipe` được cấu hình global với `transform: true, whitelist: true`.

## File Convention

- DTOs trong thư mục `dtos/` bên trong mỗi module
- **2 file DTO** per module:
  - `<feature>.dto.ts` — Create/Update/List DTOs (input validation)
  - `<feature>_response.dto.ts` — Response types (output shape, không cần validate)

```
modules/<feature>/
├── <feature>.controller.ts
├── <feature>.service.ts
├── <feature>.module.ts
├── dtos/
│   ├── <feature>.dto.ts          ← input DTOs
│   └── <feature>_response.dto.ts ← response interfaces/classes
└── entities/
    └── <feature>.entity.ts
```

## Create/Update DTO

```typescript
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateFeatureDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateFeatureDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
```

## Query/List DTO — extend `FindBaseDto`

`FindBaseDto` cung cấp sẵn `page`, `limit`, `search`, `sorts`. Extend nó để thêm filter riêng:

```typescript
import { FindBaseDto } from '@common/dto/find-base.dto';
import { IsOptional, IsString } from 'class-validator';

export class ListFeatureDto extends FindBaseDto {
  @IsOptional()
  @IsString()
  status?: string;
}
```

## Response Type

Dùng `interface` hoặc plain `class` cho response (không cần validate):

```typescript
// Đơn giản — interface
export interface FeatureResponse {
  id: string;
  name: string;
  createdAt: Date;
}

// Nếu cần Swagger docs — plain class
export class FeatureResponse {
  id: string;
  name: string;
  createdAt: Date;
}
```

## Validators hay dùng

| Decorator | Mô tả |
|---|---|
| `@IsString()` | Must be string |
| `@IsEmail()` | Valid email |
| `@IsOptional()` | Skip if undefined |
| `@IsInt()` | Integer |
| `@Min(n)` / `@Max(n)` | Number range |
| `@MinLength(n)` | String min length |
| `@IsEnum(Enum)` | Must be enum value |
| `@IsBoolean()` | Boolean |
| `@IsUrl()` | Valid URL |
| `@Type(() => Number)` | Coerce query string to number |

> `@Type(() => Number)` từ `class-transformer` cần dùng cho query params numeric (QueryString luôn là string).

## Lưu ý quan trọng

- `whitelist: true` → NestJS tự động strip các field không có decorator
- `transform: true` → Tự động coerce type (kết hợp với `@Type()`)
- Không import gì từ `nestjs-zod` hay `zod` nữa
