# Quyết định: Google OAuth + JWT Authentication

**Thời điểm**: 2026-07-08T10:40:00+07:00
**Module**: auth, user

---

## Quyết định

### Authentication Strategy
- Google OAuth (verify idToken) + JWT (access/refresh tokens)
- KHÔNG dùng passport-google-oauth20 (redirect flow)
- FE handle Google Sign-In UI, BE chỉ verify token

### Token Lifetime
- Access token: 1 ngày
- Refresh token: 30 ngày

### Roles
- 2 roles: `user` (default), `admin`
- Chưa có RolesGuard — sẽ tạo khi cần

### Global Auth Guard
- JwtAuthGuard registered globally via APP_GUARD
- Tất cả routes require auth by default
- `@Public()` decorator cho public routes

## Files tạo mới
- `src/modules/auth/` — auth module (controller, service, google-auth service, jwt strategy, DTOs)
- `src/common/guards/jwt-auth.guard.ts` — global JWT guard
- `src/common/decorator/public.decorator.ts` — @Public()
- `src/common/decorator/current-user.decorator.ts` — @CurrentUser()
- `src/migrations/1783482031913-AddUserRole.ts` — add role to users
