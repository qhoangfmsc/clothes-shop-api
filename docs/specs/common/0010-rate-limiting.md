# 0010 — Giới hạn tần suất request (rate limit)

> Module: `common` (+ auth, media, review, payment, main chỉ gắn decorator) · Trạng thái: Approved · Ngày: 2026-10-24 · Cỡ: đầy đủ

## 1. Bối cảnh & vấn đề

API công khai không giới hạn tần suất: `POST /api/auth/google` và `/api/auth/refresh` có thể bị thử dồn dập (dò token, tốn lượt gọi Google), upload ảnh (`POST /api/admin/media`, `POST /api/reviews/images`) tốn băng thông và dung lượng storage, và mọi route công khai (tìm kiếm, autocomplete) có thể bị quét. Hệ thống chỉ giới hạn riêng 30 ảnh đánh giá/24 giờ mỗi user. Không có lớp nào dừng một client duy nhất làm nghẽn cả dịch vụ.

Tra cứu: thư viện chuẩn của NestJS là `@nestjs/throttler` (v6.7 cài được, hỗ trợ Nest 11): guard toàn cục, giới hạn theo route bằng `@Throttle`, `@SkipThrottle`, giá trị `limit`/`ttl` có thể là hàm (tính lúc request), tự đặt header `Retry-After`.

## 2. Mục tiêu & ngoài phạm vi

**Mục tiêu**
- Mọi route có giới hạn mặc định rộng (chặn lạm dụng, không ảnh hưởng người dùng thường); route nhạy cảm (đăng nhập/làm mới token, upload) chặt hơn.
- Vượt giới hạn → HTTP 429 với `errorCode 9201`, header `Retry-After`; không đụng DB.
- Webhook SePay và `GET /`, `GET /health` không bao giờ bị giới hạn (SePay thử lại theo lịch của họ; nền tảng deploy gọi health liên tục).
- Cấu hình được bằng biến môi trường, đọc mỗi request (đổi không cần build lại); đúng IP của client khi chạy sau reverse proxy (Render).

**Ngoài phạm vi**
- Kho đếm dùng chung nhiều instance (Redis): kho in-memory hiện đủ cho một instance; ghi rõ giới hạn.
- Giới hạn theo user đã đăng nhập, chặn theo IP vĩnh viễn, CAPTCHA.
- Thay giới hạn nghiệp vụ có sẵn (30 ảnh đánh giá/24 giờ).

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. `@nestjs/throttler`, một throttler `default`, `limit` là hàm đọc env, `@Throttle` ghi đè ở route nhạy cảm** | Chuẩn của hệ sinh thái; cấu hình sống; ít mã | Kho in-memory (một instance); mặc định tính theo (route, IP) |
| B. Nhiều throttler đặt tên (auth, upload) áp cho mọi route rồi `@SkipThrottle` các nơi còn lại | Khai báo tập trung | Mỗi route phải loại trừ các throttler không áp dụng — dễ sót, ngược ý nghĩa mặc định |
| C. Tự viết middleware đếm | Toàn quyền | Phát minh lại thư viện đã kiểm chứng, dễ sai ở cửa sổ thời gian/dọn bộ nhớ |
| D. Để hạ tầng (Cloudflare/Render) lo | Không đổi code | Không kiểm soát được theo route, không test được, phụ thuộc cấu hình ngoài repo |

**Chọn A.**

### 3.2 Kiến trúc & ranh giới
- `common/guards/rate-limit.guard.ts`: `RateLimitGuard extends ThrottlerGuard`, chỉ override `throwThrottlingException` để ném `AppException` 429 / `9201` (cùng dạng lỗi với phần còn lại, không để thông điệp mặc định của thư viện).
- `common/decorator/rate-limit.decorator.ts`: `RateLimit('auth' | 'upload')` (= `@Throttle({ default: { limit: () => …, ttl } })`) và `SkipRateLimit()` (= `@SkipThrottle()`); `common/utils/rate-limit.config.ts` giữ tên biến và giá trị mặc định, `rateLimitPerMinute(kind)` đọc `process.env` mỗi lần gọi.
- `main.module.ts`: `ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: () => rateLimitPerMinute('default') }])` và `RateLimitGuard` là `APP_GUARD` **đầu tiên** (trước `JwtAuthGuard`) để chặn cả request chưa xác thực, đúng nơi dò đăng nhập.
- `core/app.setup.ts`: `trust proxy` theo `TRUST_PROXY` (số tầng proxy; mặc định 1 ở production, 0 nơi khác) để `req.ip` là IP client chứ không phải IP proxy; thiếu bước này mọi client sau Render chung một bộ đếm (tự làm nghẽn mình).
- `common/` không import `modules/`; các module chỉ import decorator.

### 3.3 Design pattern
| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Guard (Nest) | `RateLimitGuard` | Hành vi ngang cho mọi route, trước xác thực | Thêm một guard toàn cục |
| Decorator composition | `RateLimit`, `SkipRateLimit` | Route khai báo mức giới hạn bằng một dòng, tên biến ở một chỗ | — |

### 3.4 SOLID
S ✔ (guard chỉ chặn tần suất), O ✔ (thêm loại giới hạn = thêm một dòng cấu hình), L n.a., I ✔, D ✔ (route phụ thuộc decorator, không phụ thuộc thư viện).

### 3.5 Dữ liệu / 3.6 API
Không đổi DB. Mã lỗi mới `9201 RATE_LIMITED` (HTTP 429). Header `Retry-After` (giây). Biến mới:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `RATE_LIMIT_DEFAULT_PER_MINUTE` | 120 | mỗi (route, IP) mỗi phút |
| `RATE_LIMIT_AUTH_PER_MINUTE` | 10 | `POST /api/auth/google`, `POST /api/auth/refresh` |
| `RATE_LIMIT_UPLOAD_PER_MINUTE` | 20 | `POST /api/admin/media`, `POST /api/reviews/images` |
| `TRUST_PROXY` | 1 (production) / 0 | số tầng reverse proxy tin cậy |

Không giới hạn: `POST /api/webhooks/sepay`, `GET /`, `GET /health`.

### 3.7 Luồng
Request → `RateLimitGuard` (đếm theo `(controller, handler, IP)` trong cửa sổ 60 giây, kho in-memory) → còn trong mức: tiếp tục JWT/quyền → vượt: 429 ngay, không chạm DB.

### 3.8 Lỗi & biên
| Tình huống | Hành vi |
|---|---|
| Request thứ N+1 trong 60 giây trên cùng route/IP | 429, `errorCode 9201`, `Retry-After` > 0 |
| Route khác hoặc IP khác | bộ đếm riêng |
| Webhook SePay, `/health` | không bao giờ bị giới hạn |
| `TRUST_PROXY=1` + `X-Forwarded-For` khác nhau | mỗi IP một bộ đếm; `TRUST_PROXY=0` bỏ qua header (không giả mạo được) |
| Biến giới hạn sai (không phải số dương) | dùng mặc định |

## 4. Kế hoạch test
| Tầng | Case | Vị trí |
|---|---|---|
| Unit | `rateLimitPerMinute` (mặc định, đọc env sống, giá trị sai), guard ném `AppException` 429/9201 | `src/common/utils/rate-limit.config.spec.ts`, `src/common/guards/rate-limit.guard.spec.ts` |
| Flow | giới hạn mặc định, giới hạn auth (refresh, google), upload, bộ đếm theo route và theo IP (`TRUST_PROXY`), `Retry-After`, webhook/health không bị chặn, 429 không ghi DB | `test/flows/rate-limit/rate-limit.flow.ts` (app riêng với giới hạn thấp) |
| Hiện có | 876 flow không bị ảnh hưởng: môi trường test đặt giới hạn rất cao | `test/support/test-env.ts` |
| Phá thử | bỏ `@RateLimit` ở auth; bỏ `@SkipRateLimit` ở webhook; đặt guard sau JWT | thủ công |

## 5. Rủi ro & rollback
- **Tự chặn nhầm khách hàng thật**: mặc định 120/phút/route/IP rộng; người dùng chung IP (văn phòng, mạng di động) vẫn đủ. Chỉnh bằng env, không cần build.
- **Sai IP sau proxy**: xử lý bằng `TRUST_PROXY` mặc định 1 ở production; nếu deploy không có proxy thì đặt `TRUST_PROXY=0` (nếu không client có thể giả `X-Forwarded-For` để né giới hạn).
- Nhiều instance: mỗi instance đếm riêng (giới hạn thực tế nhân lên); ghi ở docs.
- Rollback: `git revert`, hoặc đặt các biến `RATE_LIMIT_*` rất cao.

## 6. Kết quả triển khai
_Điền sau khi làm xong._
