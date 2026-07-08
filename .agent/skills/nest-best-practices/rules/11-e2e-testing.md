# Rule 11 — E2E Testing (PGlite In-Memory)

## Tổng quan

Dự án sử dụng **PGlite** (PostgreSQL WASM in-memory) để chạy e2e test mà **không cần database thật**. Mỗi lần test xong, data tự biến mất.

- **Test framework**: Jest + Fastify `app.inject()`
- **Database**: PGlite — PostgreSQL chạy hoàn toàn trong memory
- **Auth**: Guards (AuthGuard, PermissionsGuard) được mock tự động

## Cấu trúc files

```
src/common/test/
├── jest-e2e-setup.ts    # Global setup — mock ESM modules (better-auth, drizzle-orm)
├── pglite-driver.ts     # PGlite-to-pg compatibility driver cho TypeORM
└── test-db.helper.ts    # createTestApp(), clearAllTables() — API chính

src/modules/<module>/
└── <sub_module>/
    └── <name>.e2e-spec.ts   # E2E test file
```

## Đặt tên file

| Loại test | Pattern | Ví dụ |
|-----------|---------|-------|
| E2E test (HTTP → Controller → Service → DB) | `<name>.e2e-spec.ts` | `user.e2e-spec.ts` |
| Unit test service (nếu cần) | `<name>.service.spec.ts` | `user.service.spec.ts` |
| Unit test controller (nếu cần) | `<name>.controller.spec.ts` | `user.controller.spec.ts` |

> **Ưu tiên viết e2e test** — test toàn bộ flow từ HTTP request đến DB, đảm bảo tất cả layers hoạt động đúng.

## Chạy test

```bash
# Chạy tất cả e2e tests
yarn test:e2e

# Chạy test cho 1 file cụ thể
yarn test:e2e -- --testPathPattern="user.e2e-spec"

# Chạy test cho 1 module
yarn test:e2e -- --testPathPattern="user_management"
```

## Template e2e-spec.ts

```typescript
import { clearAllTables, createTestApp, TestContext } from '@common/test/test-db.helper';
import { XxxModule } from '../xxx.module'; // Import module cần test
import { Xxx } from 'src/...../xxx.entity'; // Import entity cần seed data
import { Repository } from 'typeorm';

describe('XxxController (e2e)', () => {
  let ctx: TestContext;
  let xxxRepo: Repository<Xxx>;

  // ==========================================
  // Setup
  // ==========================================
  beforeAll(async () => {
    ctx = await createTestApp({
      imports: [XxxModule], // Chỉ cần import module — giống main.module.ts
    });
    xxxRepo = ctx.dataSource.getRepository(Xxx);
  }, 30000); // PGlite cần thời gian khởi tạo WASM

  beforeEach(async () => {
    await clearAllTables(ctx.dataSource); // Xóa data trước mỗi test
  });

  afterAll(async () => {
    await ctx.cleanup(); // Destroy app + PGlite
  });

  // ==========================================
  // Helpers: seed data
  // ==========================================
  async function seedXxx(overrides: Partial<Xxx> = {}): Promise<Xxx> {
    return xxxRepo.save(xxxRepo.create({ /* default values */ ...overrides }));
  }

  // ==========================================
  // Tests
  // ==========================================
  describe('GET /route', () => {
    it('should return list', async () => {
      await seedXxx({ /* ... */ });

      const res = await ctx.app.inject({
        method: 'GET',
        url: '/route?page=1&limit=10',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toHaveLength(1);
    });
  });

  describe('POST /route', () => {
    it('should create item', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/route',
        payload: { name: 'Test' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe('Test');
    });
  });

  describe('GET /route/:id', () => {
    it('should return 404 for non-existent', async () => {
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/route/999',
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
```

## Quy tắc quan trọng

### 1. Import module, KHÔNG import từng entity/service/controller

```typescript
// ✅ Đúng — import module giống main.module.ts
ctx = await createTestApp({
  imports: [UserManagementModule],
});

// ❌ Sai — không liệt kê entities, providers, controllers
ctx = await createTestApp({
  entities: [User, Role, Permission, ...],
  controllers: [UserController],
  providers: [UserService],
});
```

### 2. Dùng `ctx.app.inject()` để gửi HTTP request

```typescript
// GET
const res = await ctx.app.inject({ method: 'GET', url: '/users' });

// POST với body
const res = await ctx.app.inject({
  method: 'POST',
  url: '/users',
  payload: { name: 'Test', email: 'test@example.com' },
});

// PUT
const res = await ctx.app.inject({
  method: 'PUT',
  url: '/users/123',
  payload: { name: 'Updated' },
});

// DELETE
const res = await ctx.app.inject({ method: 'DELETE', url: '/users/123' });
```

### 3. Seed data bằng repository trực tiếp

```typescript
// Lấy repo từ dataSource
const userRepo = ctx.dataSource.getRepository(User);

// Seed data
await userRepo.save(userRepo.create({ id: 'u1', email: 'test@example.com', name: 'Test' }));
```

### 4. `beforeEach` luôn clear data

```typescript
beforeEach(async () => {
  await clearAllTables(ctx.dataSource);
});
```

### 5. Auth được mock tự động

- `AuthGuard` luôn pass, gắn mock user (role: `admin`) vào request
- `PermissionsGuard` luôn pass
- Nếu cần test với user khác:

```typescript
ctx = await createTestApp({
  imports: [UserManagementModule],
  mockUser: { id: 'custom-id', email: 'custom@test.com', role: 'user', roleId: 1 },
});
```

- Nếu cần test auth thật (không mock):

```typescript
ctx = await createTestApp({
  imports: [UserManagementModule],
  mockAuth: false, // Guards chạy thật
});
```

## Checklist khi viết e2e test

- [ ] File đặt tên `<name>.e2e-spec.ts`
- [ ] Import module parent (không import từng entity)
- [ ] `beforeAll`: `createTestApp({ imports: [Module] })`
- [ ] `beforeEach`: `clearAllTables(ctx.dataSource)`
- [ ] `afterAll`: `ctx.cleanup()`
- [ ] Test tất cả endpoints: GET list, GET detail, POST, PUT, DELETE
- [ ] Test happy path + error cases (404, 400, ...)
- [ ] Test data isolation (optional nhưng recommended)
