# Guards & Authentication

## User Authentication — Vietnix Workplace SSO

Auth được xử lý bởi `@vnxdev/auth-nestjs` — đăng ký global trong `AuthModule`.

```typescript
// src/core/auth/auth.module.ts
import { AuthModule as VnxAuthModule } from '@vnxdev/auth-nestjs';

@Module({
  imports: [VnxAuthModule.register({ global: true })],
})
export class AuthModule {}
```

Toàn bộ route được bảo vệ mặc định. Dùng `@Public()` để mở route không cần auth.

```typescript
import { Public } from '@vnxdev/auth-nestjs';

@Public()
@Get('health')
health() { return 'ok'; }
```

## User Info — `@CurrentUser()`

```typescript
import { CurrentUser, type VnxTokenPayload } from '@vnxdev/auth-nestjs';

@Get('profile')
getProfile(@CurrentUser() user: VnxTokenPayload) {
  return { id: user.sub, email: user.email };
}
```

`VnxTokenPayload` chứa: `sub`, `email`, `roles`, `permissions`.

## Permission-Based Access — `@WorkplacePermissions()`

```typescript
import { WorkplacePermissions } from '@vnxdev/auth-nestjs';
import { Permission } from 'src/core/auth/permissions.constant';

@WorkplacePermissions(Permission.VIEW_SEO_CONTENT)
@Get('articles')
listArticles() { ... }
```

User cần có **ít nhất một** permission trong danh sách để truy cập.

## Permission IDs (từ Vietnix Workplace)

```typescript
export enum Permission {
  // Viết bài tự động (SEO Content)
  VIEW_SEO_CONTENT = 516,
  MANAGE_SEO_CONTENT = 517,

  // Seeding Facebook
  VIEW_SEEDING = 518,
  MANAGE_SEEDING = 519,

  // Giám sát đối thủ
  VIEW_COMPETITORS = 520,
  MANAGE_COMPETITORS = 521,

  // Analytics Insights (FB Ads, Pages, Google Ads, GA4)
  VIEW_ANALYTICS = 522,
  MANAGE_ANALYTICS = 523,
}
```

## Quy ước sử dụng

- **Modules CÓ permission**: SEO Content, Seeding, Competitors, Analytics — dùng `@WorkplacePermissions()`
- **Modules KHÔNG có permission** (Discord, Affiliate, Image Gen, Upload): chỉ cần login (global guard tự xử lý)
- **KHÔNG** dùng `@UseGuards()` cho AuthGuard — đã global
- **KHÔNG** dùng `@Roles()`, `RolesGuard`, local `AuthGuard`, `PermissionsGuard` — đã xóa
- Import `WorkplacePermissions`, `CurrentUser`, `Public` từ `@vnxdev/auth-nestjs`
- Import `Permission` enum từ `src/core/auth/permissions.constant`

## Controller Pattern (có permission)

```typescript
import { Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WorkplacePermissions } from '@vnxdev/auth-nestjs';
import { Permission } from 'src/core/auth/permissions.constant';

@ApiTags('SEO Content')
@Controller('seo-content')
@ApiBearerAuth()
export class SeoContentController {
  @Get()
  @WorkplacePermissions(Permission.VIEW_SEO_CONTENT)
  findAll() { ... }

  @Post()
  @WorkplacePermissions(Permission.MANAGE_SEO_CONTENT)
  create() { ... }
}
```

## Controller Pattern (không cần permission)

```typescript
@ApiTags('Upload')
@Controller('upload')
@ApiBearerAuth()
export class UploadController {
  @Post()
  upload() { ... }  // Chỉ cần login, global guard tự xử lý
}
```
