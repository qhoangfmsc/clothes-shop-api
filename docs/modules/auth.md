# auth (`src/modules/auth`)

> Cập nhật lần cuối: 2026-10-12

## 1. Tổng quan

Module xác thực: đăng nhập bằng Google, phát hành JWT access/refresh token, cung cấp thông tin phiên hiện tại và danh sách mã permission. Không có bảng riêng — dùng bảng `users` của module user.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/modules/auth` |
| Route prefix | `/api/auth` |
| Bảng DB | `users` (qua `TypeOrmModule.forFeature([User])`) |
| Module phụ thuộc | `user` (entity `User`), `@nestjs/jwt`, `@nestjs/passport`, `google-auth-library` |
| Export | `AuthService` |

## 2. Mục đích & nghiệp vụ phục vụ

- Khách đăng nhập bằng tài khoản Google; lần đầu tự tạo user (role `user`, permission mặc định).
- Cấp token để gọi các API cần JWT; làm mới access token bằng refresh token.
- `JwtStrategy` là nơi xác thực mọi request có JWT (do `JwtAuthGuard` toàn cục gọi) và gắn entity `User` vào `request.user`.

## 3. Submodule & chức năng

| Submodule | File | Truy cập | Chức năng |
|---|---|---|---|
| Auth API | `auth.controller.ts` | Public / JWT | Đăng nhập Google, refresh, `me`, liệt kê permission |
| Auth service | `auth.service.ts` | — | Upsert user, ký token, chuẩn hoá dữ liệu user trả về |
| Google verifier | `google-auth.service.ts` | — | Xác thực idToken / đổi auth code / gọi userinfo bằng access token |
| JWT strategy | `jwt.strategy.ts` | — | Verify JWT, nạp user từ DB, chặn user không `active` |

## 4. Chi tiết

### 4.1 API

| Method | Path | Truy cập | Mô tả |
|---|---|---|---|
| POST | `/api/auth/google` | Public | Đăng nhập Google, body `{ idToken }` |
| POST | `/api/auth/refresh` | Public | Làm mới access token, body `{ refreshToken }` |
| GET | `/api/auth/me` | JWT + `AUTH_ME` | Thông tin user hiện tại |
| GET | `/api/auth/permissions` | JWT + `USER_ADMIN_VIEW` | Danh sách mọi permission `{ data: [{ code, name }] }` (suy từ enum `Permission`) |

**POST `/api/auth/google`** — body `GoogleLoginDto`: `idToken` (string, not empty). Dù tên là `idToken`, giá trị có thể là ID token, authorization code hoặc access token (xem 4.4). Response:

```json
{ "accessToken": "...", "refreshToken": "...", "user": { "id", "email", "name", "image", "role", "permissions", "status", "createdAt" } }
```

**POST `/api/auth/refresh`** — body `RefreshTokenDto`: `refreshToken` (string, not empty). Response `{ accessToken, user }` (không phát hành refresh token mới). Mọi lỗi trong quá trình verify đều trả `401 Invalid refresh token`.

**GET `/api/auth/me`** — response `{ user }` (cùng dạng user đã chuẩn hoá). User không tồn tại → `401 User not found`.

### 4.2 Dữ liệu

Dùng bảng `users` — xem [user](user.md). Module chỉ đọc/ghi các cột `email`, `name`, `image`, `provider`, `provider_id`, `role`, `permissions`, `status`.

### 4.3 Validation (3 tầng)

- **DTO**: `idToken`, `refreshToken` là `IsString` + `IsNotEmpty`.
- **Service**: verify token Google/JWT; user không tìm thấy hoặc `status !== 'active'` → `401`.
- **DB**: `users.email` UNIQUE; CHECK `role`, `status` (xem module user).

### 4.4 Luồng xử lý & quy tắc nghiệp vụ

**Đăng nhập Google (`AuthService.googleLogin`)**

1. Phân loại credential:
   - `isJwt` = chuỗi tách bằng `.` thành đúng 3 phần.
   - `isAuthCode` = bắt đầu bằng `4/` **hoặc** (độ dài < 200 và không phải JWT).
   - `isAuthCode` → `exchangeAuthCode`; ngược lại `isJwt` → `verifyIdToken`; còn lại → `fetchUserInfo` (access token).
2. `GoogleAuthService`:
   - `verifyIdToken`: `OAuth2Client.verifyIdToken` với `audience = GOOGLE_CLIENT_ID`; yêu cầu payload có `email`.
   - `exchangeAuthCode`: `getToken({ code, redirect_uri: 'postmessage' })` (luồng popup của `@react-oauth/google`); có `id_token` thì verify, không thì dùng `access_token` gọi userinfo; không có token nào → 401.
   - `fetchUserInfo`: `GET https://www.googleapis.com/oauth2/v3/userinfo` với Bearer access token; yêu cầu có `email`.
   - Mọi lỗi được đổi thành `UnauthorizedException`.
3. Upsert user theo `email`:
   - Chưa có → tạo với `provider='google'`, `providerId=sub`, `role='user'`, `permissions=DEFAULT_USER_PERMISSIONS`, `status='active'`.
   - Đã có → cập nhật `name`, `image` (giữ giá trị cũ nếu Google trả rỗng), `provider='google'`, `providerId`. Không đổi `role`, `permissions`, `status`.
4. Ký `accessToken` và `refreshToken`.

**Token**

| Token | Secret | Hết hạn | Payload |
|---|---|---|---|
| access | `JWT_SECRET` | `JWT_EXPIRES_IN` (mặc định `1d`) | `{ sub: userId, email, role, type: 'access' }` |
| refresh | `JWT_SECRET` | `JWT_REFRESH_EXPIRES_IN` (mặc định `30d`) | `{ sub: userId, email, role, type: 'refresh' }` |

Claim `type` (định nghĩa ở `auth.constant.ts`: `JwtTokenType`, `JwtPayload`) phân biệt hai loại token. Token cũ không có claim `type` bị từ chối ở cả hai nơi dùng token.

**Xác thực mỗi request (`JwtStrategy.validate`)**: lấy Bearer token, verify (không bỏ qua hết hạn), yêu cầu `payload.type === 'access'` (refresh token hoặc token không có `type` → `401 Invalid access token`), tìm user theo `payload.sub`; không có hoặc `status !== 'active'` → `401 User not found or disabled`; trả entity `User` (có `role`, `permissions`) làm `request.user`.

**Refresh (`refreshToken`)**: verify bằng `JWT_SECRET`, yêu cầu `payload.type === 'refresh'` (access token hoặc token không có `type` bị từ chối), tìm user theo `sub`, yêu cầu `status === 'active'`, ký access token mới.

### 4.5 Error code

Module không dùng `throwAppError`. Lỗi trả về là `UnauthorizedException` (HTTP 401) với message:

| Message | Khi nào |
|---|---|
| `Invalid Google token` / `Invalid Google token: missing email` | ID token sai hoặc thiếu email |
| `Failed to exchange authorization code` / `No token received from Google` | Đổi auth code thất bại |
| `Failed to fetch Google user info` / `Google user info missing email` / `Failed to verify Google access token` | Access token Google không hợp lệ |
| `User not found` | `GET /me` với user không còn tồn tại |
| `Invalid access token` | Gọi API bằng refresh token hoặc token không có `type: 'access'` |
| `User not found or disabled` / `Invalid refresh token` | Refresh hoặc xác thực JWT với user không tồn tại/bị khoá; refresh bằng token không phải refresh token |

Lỗi permission (9001/9002) do `PermissionsGuard` phát sinh — xem [common](common.md).

### 4.6 Phụ thuộc & cấu hình

- Biến môi trường: `JWT_SECRET` (mặc định dev `DEFAULT_JWT_SECRET` = `dev-secret-change-me` ở `auth.constant.ts`, dùng chung cho `JwtModule`, `JwtStrategy`, `AuthService`), `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- `PassportModule` mặc định strategy `jwt`; `JwtModule.registerAsync` đọc secret/expiresIn từ `ConfigService`.
- Gọi ra ngoài: Google OAuth2 (verify/đổi code) và `googleapis.com/oauth2/v3/userinfo`.

### 4.7 Test

`auth.service.spec.ts`:
- `AuthService tokens`: access/refresh có claim `type` khác nhau; refresh token đổi được access token mới; access token và token cũ không có `type` bị từ chối khi refresh; user bị `disabled` bị từ chối.
- `JwtStrategy.validate`: nhận access token; từ chối refresh token và payload không có `type`.

### 4.8 Lưu ý hiện trạng

- Access và refresh token dùng chung `JWT_SECRET`, phân biệt bằng claim `type`; refresh không xoay vòng (response chỉ có `accessToken` mới, không phát refresh token mới).
- Token phát hành trước khi có claim `type` bị từ chối, người dùng phải đăng nhập lại.
- Cách phân loại credential coi chuỗi không phải JWT và ngắn hơn 200 ký tự là auth code, kể cả khi đó là access token.
- Quyền của user được đọc từ cột `users.permissions` ở mỗi request, không nằm trong token.
- `permission` danh sách trả bởi `/api/auth/permissions` gồm toàn bộ enum `Permission`, không lọc theo user.
