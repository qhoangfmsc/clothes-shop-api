# Guards & Authentication — Clothes Shop API

## Auth Strategy — Google OAuth + JWT

Auth xử lý bằng `@nestjs/passport` + `@nestjs/jwt` + `google-auth-library`.

### Flow

1. FE: Google Sign-In → get `idToken`
2. FE: `POST /api/auth/google` → send `{ idToken }`
3. BE: Verify idToken → upsert user → return `{ accessToken, refreshToken, user }`
4. FE: Subsequent requests → `Authorization: Bearer <accessToken>`

## Global Guard — JwtAuthGuard

Tất cả routes mặc định **require auth**. Đăng ký global qua `APP_GUARD` trong `MainModule`.

```typescript
// src/main.module.ts
{
  provide: APP_GUARD,
  useClass: JwtAuthGuard,
}
```

## @Public() — Bỏ qua auth

Dùng `@Public()` decorator cho route không cần auth (product listing, categories, etc.).

```typescript
import { Public } from '@common/decorator/public.decorator';

@Public()
@Controller('api/products')
export class ProductController { ... }
```

## @CurrentUser() — Lấy user hiện tại

```typescript
import { CurrentUser } from '@common/decorator/current-user.decorator';

@Get('me')
getMe(@CurrentUser() user: User) {
  return { user };
}
```

## Roles

2 roles đơn giản:

| Role | Description |
|------|-------------|
| `user` | Default cho tất cả user đăng ký |
| `admin` | Quản trị viên |

Hiện tại chưa có `RolesGuard` — khi cần admin-only endpoints thì tạo thêm.

## Auth Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/google` | Public | Google login |
| GET | `/api/auth/me` | Bearer | Get current user |
| POST | `/api/auth/refresh` | Public | Refresh access token |

## Quy ước sử dụng

- **KHÔNG** dùng `@UseGuards(AuthGuard('jwt'))` trực tiếp — đã global
- **KHÔNG** import `@vnxdev/auth-nestjs` — project này dùng custom JWT
- Dùng `@Public()` từ `@common/decorator/public.decorator`
- Dùng `@CurrentUser()` từ `@common/decorator/current-user.decorator`
- Import `User` entity khi cần type cho `@CurrentUser()`

## Controller Pattern (public route)

```typescript
@ApiTags('Products')
@Controller('api/products')
@Public()
export class ProductController { ... }
```

## Controller Pattern (authenticated route)

```typescript
@ApiTags('Orders')
@Controller('api/orders')
@ApiBearerAuth()
export class OrderController {
  @Get()
  findMyOrders(@CurrentUser() user: User) { ... }
}
```

## Environment Variables

```env
JWT_SECRET=<random-secret>
JWT_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=30d
GOOGLE_CLIENT_ID=<from-google-console>
```
