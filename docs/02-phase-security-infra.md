# 🔒 Phase 2: Security & Infrastructure

> **Thời gian:** 1-2 tuần
> **Priority:** 🔴 HIGH — Bảo mật token + bảo vệ API + backup dữ liệu
> **Mục tiêu:** Token trong httpOnly cookie, Rate Limiting, DB Backup tự động, Structured Logging

---

## 1. Vấn đề hiện tại

| Vấn đề | Rủi ro |
|--------|--------|
| Token lưu trong `localStorage` | XSS attack đọc được token → mất tài khoản |
| Không rate limiting | 1 IP có thể spam 1000 req/s → DDoS đơn giản |
| Không backup database | Mất server = mất toàn bộ dữ liệu khách hàng |
| Logging thô (`console.log`) | Không thể search, filter, trace request |
| Helmet đã có nhưng chưa cấu hình CSP/CTO | Header bảo mật chưa tối ưu |

---

## 2. Task List

### 2.1 Token Security — httpOnly Cookie

#### 🔴 Chuyển từ localStorage → httpOnly Cookie

Hiện tại FE lưu token:
```typescript
localStorage.setItem("clothes_shop_access_token", token)
```

Cần chuyển sang BE set cookie httpOnly:

**Step 1: Cài đặt `cookie-parser`**
```bash
yarn add cookie-parser @types/cookie-parser
```

**Step 2: Cập nhật `AuthService` — set cookie trong response**
```typescript
// src/modules/auth/auth.service.ts
// googleLogin & refreshToken: trả về cookie thay vì body chứa token

async googleLogin(credential: string, response: Response) {
  // ... (logic hiện tại)

  const tokens = this.generateTokens(user);
  this.setAuthCookies(response, tokens);

  return { user: this.sanitizeUser(user) };
}

async refreshToken(request: Request, response: Response) {
  const refreshToken = request.cookies?.refresh_token;
  if (!refreshToken) throw new UnauthorizedException('No refresh token');

  // ... verify refresh token

  const accessToken = this.generateAccessToken(user);
  this.setAccessTokenCookie(response, accessToken);

  return { user: this.sanitizeUser(user) };
}

private setAuthCookies(response: Response, tokens: { accessToken: string; refreshToken: string }) {
  response.cookie('access_token', tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    path: '/',
  });

  response.cookie('refresh_token', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/api/auth', // Chỉ gửi đến /api/auth (refresh endpoint)
  });
}

private setAccessTokenCookie(response: Response, accessToken: string) {
  response.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });
}
```

**Step 3: Cập nhật `JwtStrategy` — extract token từ cookie**
```typescript
// src/modules/auth/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Ưu tiên cookie, fallback về Authorization header (cho mobile app sau này)
        (request: Request) => {
          let token = null;
          if (request?.cookies) {
            token = request.cookies['access_token'];
          }
          if (!token && request?.headers?.authorization) {
            token = request.headers.authorization.replace('Bearer ', '');
          }
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }
}
```

**Step 4: Cập nhật `main.ts` — thêm `cookie-parser`**
```typescript
// src/main.ts
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(MainModule);
  app.use(cookieParser());
  // ...
}
```

**Step 5: Cập nhật CORS — cho phép credentials**
```typescript
// src/main.ts
app.enableCors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true, // Cho phép gửi cookie cross-origin
});
```

**Migration path cho FE:**
- BE vẫn hỗ trợ Authorization header (dual support) trong 2 tuần
- Sau khi FE migrate xong → xóa dual support

### 2.2 API Rate Limiting

#### 🔵 `@nestjs/throttler`

```bash
yarn add @nestjs/throttler
```

```typescript
// src/core/core.module.ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60_000,       // 1 phút
      limit: 60,         // Max 60 requests/phút/IP cho public
    }]),
    // ...
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,  // Global rate limiter
    },
  ],
})
export class CoreModule {}
```

**Override cho từng route nhạy cảm:**

```typescript
// Auth endpoints: tối đa 5 req/phút
@Post('api/auth/google')
@Throttle({ default: { ttl: 60_000, limit: 5 } })
async googleLogin() { ... }

// Checkout: tối đa 10 req/phút
@Post('api/orders')
@Throttle({ default: { ttl: 60_000, limit: 10 } })
async checkout() { ... }
```

**Override riêng cho Admin:**

```typescript
// Admin: 120 req/phút (internal dashboard usage)
// Có thể tạo 1 custom guard:
@Injectable()
export class AdminThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Track theo userId thay vì IP
    return req.user?.id || req.ip;
  }
}
```

### 2.3 Database Backup

#### 🔵 Automated Daily Backup Script

```bash
# scripts/backup-db.sh
#!/bin/bash
# Automated PostgreSQL backup
# Chạy qua cron hoặc GitHub Actions schedule

set -e

DATE=$(date +%Y-%m-%d_%H-%M)
BACKUP_DIR="./backups"
DB_URL="${DATABASE_URL:-postgresql://oribaebi:oribaebi_dev@localhost:5432/clothes_shop}"

mkdir -p "$BACKUP_DIR"

# Full backup
pg_dump "$DB_URL" --format=custom > "$BACKUP_DIR/$DATE.backup"

# Giữ 30 ngày gần nhất, xóa cũ hơn
find "$BACKUP_DIR" -name "*.backup" -mtime +30 -delete

echo "Backup completed: $DATE.backup"
```

**GitHub Actions Schedule backup (production):**

```yaml
# .github/workflows/be-backup.yml
name: BE — Daily DB Backup
on:
  schedule:
    - cron: '0 2 * * *'  # 2:00 AM UTC = 9:00 AM VN
  workflow_dispatch:

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Install postgres client
        run: sudo apt-get install -y postgresql-client

      - name: Backup database
        run: |
          pg_dump "${{ secrets.DATABASE_URL }}" --format=custom > backup-$(date +%Y-%m-%d).backup

      - name: Upload to S3/Cloud Storage
        uses: aws-actions/configure-aws-credentials@v4
        # Hoặc dùng rclone upload lên Google Drive
        # ...
```

**Restore script:**
```bash
# scripts/restore-db.sh
#!/bin/bash
# Usage: bash scripts/restore-db.sh backups/2026-07-23_02-00.backup
pg_restore --clean --if-exists -d "$DATABASE_URL" "$1"
```

### 2.4 Structured Logging

#### 🔵 Từ `console.log` → NestJS Logger + Request ID

```typescript
// src/common/middleware/request-id.middleware.ts (đã có, cập nhật thêm)
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = nanoid(12);
    const start = Date.now();

    req['requestId'] = requestId;
    res.setHeader('X-Request-Id', requestId);

    // Log incoming request
    this.logger.log(`${req.method} ${req.originalUrl}`, {
      requestId,
      ip: req.ip,
      userAgent: req.get('user-agent')?.slice(0, 100),
    });

    // Log response on finish
    res.on('finish', () => {
      const duration = Date.now() - start;
      this.logger.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`, {
        requestId,
        statusCode: res.statusCode,
        duration,
      });
    });

    next();
  }
}
```

**Custom Logger Service cho production:**

```typescript
// src/common/logger/logger.service.ts
import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';

@Injectable()
export class AppLogger extends ConsoleLogger {
  private readonly isProduction = process.env.NODE_ENV === 'production';

  error(message: any, stack?: string, context?: string) {
    // Production: structured JSON để gửi vào log aggregator
    if (this.isProduction) {
      super.error(
        JSON.stringify({ message, stack, context, timestamp: new Date().toISOString() }),
        stack,
        context,
      );
    } else {
      super.error(message, stack, context);
    }
  }
}
```

**Đăng ký global logger trong `main.ts`:**
```typescript
const app = await NestFactory.create(MainModule, {
  logger: new AppLogger(),
});
```

### 2.5 Helmet Enhancement

#### 🟢 Cấu hình Helmet với Content Security Policy

```typescript
// src/main.ts
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Swagger UI cần inline styles
      imgSrc: ["'self'", 'https://res.cloudinary.com', 'https://lh3.googleusercontent.com'],
    },
  },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
}));
```

---

## 3. Phụ thuộc

- ✅ **Phase 1** — Token cookie cần FE phối hợp migrate
- ✅ Có thể làm song song với Phase 1
- ⚠️ **Breaking change** — FE phải bỏ `localStorage.setItem('token')`, dùng `credentials: 'include'` trong fetch

---

## 4. Tech Stack Additions

```bash
yarn add cookie-parser @nestjs/throttler
yarn add -D @types/cookie-parser
```

---

## 5. Files Created/Changed

| File | Action | Type |
|------|--------|------|
| `src/modules/auth/auth.service.ts` | Modify (set cookie, extract từ cookie) | 🔴 |
| `src/modules/auth/auth.controller.ts` | Modify (@Res() decorator) | 🔴 |
| `src/modules/auth/jwt.strategy.ts` | Modify (extract từ cookie + header) | 🟡 |
| `src/main.ts` | Modify (cookieParser, helmet CSP, CORS credentials) | 🟡 |
| `src/core/core.module.ts` | Modify (ThrottlerModule) | 🟢 |
| `src/common/middleware/request-id.middleware.ts` | Modify (structured logging) | 🟡 |
| `src/common/logger/logger.service.ts` | New | 🔵 |
| `scripts/backup-db.sh` | New | 🔵 |
| `scripts/restore-db.sh` | New | 🔵 |
| `.github/workflows/be-backup.yml` | New | 🔵 |

---

## 6. Test Coverage Target

| Module | Target |
|--------|--------|
| JwtStrategy (cookie + header extraction) | > 90% |
| AuthService (set cookie, refresh from cookie) | > 85% |
| ThrottlerGuard (override per route) | > 80% |
| RequestIdMiddleware | 100% |
