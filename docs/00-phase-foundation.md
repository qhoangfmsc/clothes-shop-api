# 🏗️ Phase 0: Foundation Hardening

> **Thời gian:** 1-2 tuần
> **Priority:** 🔴 CRITICAL — Làm NGAY trước mọi thứ khác
> **Mục tiêu:** Có test suite, CI/CD pipeline, Docker, và cấu hình môi trường chuẩn

---

## 1. Mục tiêu

Dự án hiện có **0 tests**, chưa có CI/CD, chưa có Docker. Một dự án E-Commerce vận hành thực tế không thể thiếu 3 thứ này. Phase 0 đặt nền móng để mọi phase sau có thể tự tin refactor và deploy.

**Đầu ra kiểm chứng:**
- `yarn test` chạy được, coverage > 80% critical path
- Push code → GitHub Actions tự động chạy test + lint
- `docker compose up` chạy được toàn bộ stack local

---

## 2. Task List

### 2.1 Testing Infrastructure

#### 🔵 Setup test database & helpers

```
Tạo cấu trúc test:
test/
├── helpers/
│   ├── test-db.ts          # In-memory SQLite hoặc test DB connection
│   ├── factories.ts        # Factory functions tạo test data
│   └── mocks.ts            # Mock Google OAuth, JWT
├── unit/                   # Unit tests
│   ├── services/
│   │   ├── cart.service.spec.ts
│   │   ├── order.service.spec.ts
│   │   ├── auth.service.spec.ts
│   │   ├── product.service.spec.ts
│   │   └── user.service.spec.ts
│   └── guards/
│       ├── jwt-auth.guard.spec.ts
│       └── permissions.guard.spec.ts
└── integration/
    └── flows/
        └── checkout.spec.ts        # Cart → Add → Checkout flow
```

#### 🟢 Unit Tests — CartService (priority #1)

```typescript
// test/unit/services/cart.service.spec.ts
describe('CartService', () => {
  describe('addItem', () => {
    it('thêm item mới → tạo cart item');
    it('same product + same size + same color → tăng quantity');
    it('same product + different size → tạo item riêng');
    it('product.status !== active → throw BadRequestException');
    it('product không tồn tại → throw NotFoundException');
    it('cart chưa tồn tại → tự động tạo cart mới');
  });

  describe('updateItem', () => {
    it('cập nhật quantity thành công');
    it('cart không tồn tại → throw NotFoundException');
    it('item không thuộc cart → throw NotFoundException');
  });

  describe('removeItem', () => {
    it('xóa item → cart còn lại các item khác');
    it('xóa item cuối cùng → cart rỗng');
  });

  describe('clearCart', () => {
    it('xóa toàn bộ items → subtotal = 0, itemCount = 0');
  });

  describe('getCart', () => {
    it('cart có items → trả về items + subtotal + lineTotal');
    it('cart rỗng → trả về mảng rỗng, subtotal = 0');
    it('user chưa có cart → trả về cart rỗng (không tự động tạo)');
  });
});
```

#### 🟢 Unit Tests — OrderService (priority #2)

```typescript
describe('OrderService', () => {
  describe('checkout', () => {
    it('happy path: cart có items + address hợp lệ → tạo order, clear cart');
    it('cart rỗng → throw BadRequestException');
    it('product trong cart bị disabled → throw BadRequestException + rollback');
    it('address không tồn tại → throw NotFoundException');
    it('subtotal >= 150 → free shipping');
    it('subtotal < 150 → tính shipping fee theo method');
    it('order items snapshot đúng product info (name, image, price)');
    it('transaction rollback nếu save order item fail');
  });

  describe('cancel', () => {
    it('status=pending → cancelled ✅');
    it('status=confirmed → throw BadRequestException');
    it('status=completed → throw BadRequestException');
    it('order không thuộc user → throw NotFoundException');
  });

  describe('findAll', () => {
    it('trả về danh sách order của user, sắp xếp createdAt DESC');
    it('user không có order → mảng rỗng');
  });

  describe('updateStatus (Admin)', () => {
    it('pending → confirmed ✅');
    it('confirmed → shipping ✅');
    it('shipping → delivered ✅');
    it('delivered → completed ✅');
    it('pending → shipping ❌ (skip step)');
    it('completed → cancelled ❌ (terminal)');
    it('cancelled → bất kỳ ❌ (terminal)');
    it('order không tồn tại → throw EOrderErrorCode.ORDER_NOT_FOUND');
  });
});
```

#### 🟢 Unit Tests — AuthService (priority #3)

```typescript
describe('AuthService', () => {
  describe('googleLogin', () => {
    it('user mới → tạo user + return tokens');
    it('user cũ → update info + return tokens');
    it('auth_code format → exchangeAuthCode được gọi');
    it('idToken format (JWT) → verifyIdToken được gọi');
    it('access_token format → fetchUserInfo được gọi');
    it('user bị disabled → vẫn login được (sync thông tin)');
  });

  describe('refreshToken', () => {
    it('token hợp lệ + user active → accessToken mới');
    it('token hết hạn → UnauthorizedException');
    it('user bị disabled → UnauthorizedException');
    it('token bị chỉnh sửa → UnauthorizedException');
  });

  describe('getMe', () => {
    it('user tồn tại → trả về thông tin (đã sanitize)');
    it('user không tồn tại → UnauthorizedException');
  });
});
```

#### 🟢 Unit Tests — ProductService (priority #4)

```typescript
describe('ProductService', () => {
  describe('create (Admin)', () => {
    it('tạo product đầy đủ fields → save thành công');
    it('slug đã tồn tại → PRODUCT_SLUG_DUPLICATE');
    it('SKU đã tồn tại → PRODUCT_SKU_DUPLICATE');
    it('category không tồn tại → PRODUCT_CATEGORY_NOT_FOUND');
    it('subcategory không thuộc category → PRODUCT_SUBCATEGORY_MISMATCH');
    it('originalPrice < price → PRODUCT_INVALID_PRICE');
    it('không truyền sku → tự generate từ category+subcategory+slug');
  });

  describe('findAllAdmin', () => {
    it('search theo name, slug, sku, description (ILIKE)');
    it('filter theo status (active/disabled/all)');
    it('filter theo badge (new/sale/bestseller)');
    it('filter theo category (resolve slug → ID)');
    it('pagination: page=2, limit=10 → skip 10, take 10');
    it('sort "-price" → ORDER BY price ASC');
    it('sort "createdAt" → ORDER BY createdAt DESC');
    it('search + filter kết hợp → cả hai cùng hoạt động');
  });
});
```

#### 🟢 Unit Tests — Guards

```typescript
describe('JwtAuthGuard', () => {
  it('route có @Public() → bỏ qua auth');
  it('token hợp lệ → pass');
  it('token hết hạn → 401');
  it('không có token → 401');
});

describe('PermissionsGuard', () => {
  it('user có permission → pass');
  it('user không có permission → 403');
  it('admin → tự động pass mọi permission');
  it('route không có @Permissions → pass');
});
```

#### 🟢 Integration Test — Checkout Flow

```typescript
describe('Checkout Flow (Integration)', () => {
  it('Cart → Add items → Checkout → Order created → Cart cleared');
  it('Cart → Add items → Checkout with invalid address → Error → Cart preserved');
  it('Cart → Add disabled product → Checkout fail → Rollback');
});
```

### 2.2 CI/CD Pipeline

#### 🔵 GitHub Actions Workflows

```
.github/workflows/
├── be-test.yml        # Chạy test + lint trên mỗi PR vào main
└── be-deploy.yml      # Build + deploy lên Render/Railway
```

```yaml
# .github/workflows/be-test.yml
name: BE — Test & Lint
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: clothes_shop_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'yarn'

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: Lint
        run: yarn lint

      - name: Type check
        run: npx tsc --noEmit

      - name: Test
        run: yarn test --coverage
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/clothes_shop_test
          JWT_SECRET: test-secret
          JWT_EXPIRES_IN: 1d
          JWT_REFRESH_EXPIRES_IN: 30d

      - name: Build check
        run: yarn build
```

```yaml
# .github/workflows/be-deploy.yml
name: BE — Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:      # Cho phép trigger thủ công

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to Render
        run: |
          curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK }}
```

### 2.3 Docker Setup

#### 🔵 Multi-stage Dockerfile + Docker Compose

```
Dockerfile                # Multi-stage build NestJS
docker-compose.yml        # BE + PostgreSQL + pgAdmin
.dockerignore
```

```dockerfile
# Dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

# Stage 2: Production
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json yarn.lock data-source.ts ./
EXPOSE 7001
CMD ["node", "dist/src/main.js"]
```

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: oribaebi
      POSTGRES_PASSWORD: oribaebi_dev
      POSTGRES_DB: clothes_shop
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U oribaebi']
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build: .
    ports:
      - '7001:7001'
    environment:
      DATABASE_URL: postgresql://oribaebi:oribaebi_dev@db:5432/clothes_shop
      JWT_SECRET: dev_jwt_secret
      JWT_EXPIRES_IN: 1d
      JWT_REFRESH_EXPIRES_IN: 30d
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      PORT: 7001
    depends_on:
      db:
        condition: service_healthy
    command: >
      sh -c "npx typeorm migration:run -d data-source.ts && node dist/src/main.js"

  pgadmin:
    image: dpage/pgadmin4
    ports:
      - '5050:80'
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@oribaebi.com
      PGADMIN_DEFAULT_PASSWORD: admin
    depends_on:
      - db

volumes:
  pgdata:
```

### 2.4 Environment Configuration

#### 🟡 Tách .env thành nhiều môi trường

```
.env.development        # Local dev
.env.staging            # Môi trường test/staging
.env.production         # Sản xuất
.env.example            # Template cho dev mới
```

```bash
# .env.example
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/clothes_shop

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=30d

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# App
PORT=7001
NODE_ENV=development

# CORS
CORS_ORIGIN=http://localhost:3000

# Cloudinary (Phase 3)
# CLOUDINARY_CLOUD_NAME=
# CLOUDINARY_API_KEY=
# CLOUDINARY_API_SECRET=

# SMTP (Phase 3)
# SMTP_HOST=
# SMTP_PORT=
# SMTP_USER=
# SMTP_PASS=

# Sentry (Phase 5)
# SENTRY_DSN=
```

Cập nhật `ConfigModule` trong `core.module.ts` để load đúng file env:

```typescript
// src/core/core.module.ts
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
  // Fallback: cũng load .env nếu .env.{NODE_ENV} không tồn tại
  ignoreEnvFile: false,
}),
```

---

## 3. Phụ thuộc

- ✅ **Không phụ thuộc phase nào** — đây là phase đầu tiên
- ✅ Có thể làm song song với mọi phase khác (test có thể viết dần)

---

## 4. Tech Stack Additions

```json
// Thêm vào devDependencies (đã có sẵn)
"@nestjs/testing": "^11.0.1",
"jest": "^29.7.0",
"ts-jest": "^29.2.5",
"supertest": "^7.0.0"
```

Không cần thêm package mới.

---

## 5. Files Created/Changed

| File | Action | Type |
|------|--------|------|
| `test/helpers/test-db.ts` | New | 🔵 |
| `test/helpers/factories.ts` | New | 🔵 |
| `test/helpers/mocks.ts` | New | 🔵 |
| `test/unit/services/cart.service.spec.ts` | New | 🔵 |
| `test/unit/services/order.service.spec.ts` | New | 🔵 |
| `test/unit/services/auth.service.spec.ts` | New | 🔵 |
| `test/unit/services/product.service.spec.ts` | New | 🔵 |
| `test/unit/guards/jwt-auth.guard.spec.ts` | New | 🔵 |
| `test/unit/guards/permissions.guard.spec.ts` | New | 🔵 |
| `test/integration/flows/checkout.spec.ts` | New | 🔵 |
| `.github/workflows/be-test.yml` | New | 🔵 |
| `.github/workflows/be-deploy.yml` | New | 🔵 |
| `Dockerfile` | New | 🔵 |
| `docker-compose.yml` | New | 🔵 |
| `.dockerignore` | New | 🔵 |
| `.env.development` | New | 🔵 |
| `.env.staging` | New | 🔵 |
| `.env.production` | New | 🔵 |
| `.env.example` | New | 🔵 |
| `src/core/core.module.ts` | Modify | 🟡 |

---

## 6. Test Coverage Target

| Module | Target |
|--------|--------|
| CartService | > 90% |
| OrderService | > 85% |
| AuthService | > 85% |
| ProductService | > 80% |
| Guards | > 90% |
| Checkout (integration) | Happy path + 2 edge cases |
