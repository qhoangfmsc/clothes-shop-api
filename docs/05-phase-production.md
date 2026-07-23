# 🚀 Phase 5: Advanced & Production Ready

> **Thời gian:** 2-3 tuần
> **Priority:** 🟡 MEDIUM/HIGH — Vận hành ổn định và mở rộng
> **Mục tiêu:** Monitoring, staging, return/refund, analytics hooks, type safety và performance baseline

---

## 1. Production Readiness Gate

Không đánh dấu production-ready chỉ vì build pass. Cần đạt các điều kiện:

- Migration chạy được trên database mới và database đã có dữ liệu
- Critical flows có automated tests
- Có rollback procedure cho deploy và migration
- Có backup gần nhất và đã thử restore
- Có health/readiness endpoint
- Có error tracking với request ID
- Không còn secret trong repository/logs
- API docs và generated client contract được cập nhật

---

## 2. Monitoring & Observability

### 2.1 Health checks

Tạo `HealthModule` dùng `@nestjs/terminus`:

```bash
yarn add @nestjs/terminus
```

```text
GET /health/live       # Process đang chạy
GET /health/ready      # DB và dependency sẵn sàng
```

Readiness check phải kiểm tra PostgreSQL; không dùng endpoint này làm public business API.

### 2.2 Sentry / Error Tracking

```bash
yarn add @sentry/node
```

Tích hợp global exception filter hoặc interceptor:

- Gửi unexpected errors lên Sentry
- Không gửi access token, refresh token, password, full shipping PII
- Gắn `requestId`, route, userId đã hash/masked, environment
- Expected business errors (`4xx`) chỉ log theo sampling policy

### 2.3 Metrics

Theo dõi tối thiểu:

```text
http_request_duration_ms
http_requests_total{method, route, status}
checkout_success_total
checkout_failure_total{reason}
order_status_transition_total{from,to}
email_delivery_failure_total
inventory_low_stock_total
```

Có thể bắt đầu bằng structured logs và chuyển sang Prometheus/OpenTelemetry khi deployment target đã chốt.

---

## 3. Return / Refund Flow

### 3.1 State model

Không cho client tự đổi order status. Tạo entity riêng:

```text
returns/
├── return.entity.ts
├── return-item.entity.ts
├── return.service.ts
├── return.controller.ts
├── admin-return.controller.ts
└── dtos/
```

```typescript
export type ReturnStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'received'
  | 'refunded'
  | 'cancelled';
```

`Return` lưu:

- orderId, userId
- reason, customer note
- status
- refund amount
- admin note
- requestedAt, approvedAt, refundedAt

### 3.2 Business rules

- Chỉ cho yêu cầu trong return window đã cấu hình
- Chỉ order `delivered` hoặc `completed` mới được yêu cầu
- Không cho vượt số lượng đã mua hoặc đã return
- Admin duyệt/reject theo state transition rõ ràng
- Refund phải idempotent theo `returnId`
- Restock chỉ sau khi warehouse xác nhận hàng hợp lệ
- Nếu có payment provider, refund qua adapter + lưu provider reference

### 3.3 API

```text
POST  /api/orders/:orderId/returns
GET   /api/orders/:orderId/returns
GET   /api/admin/returns
PATCH /api/admin/returns/:id/approve
PATCH /api/admin/returns/:id/reject
PATCH /api/admin/returns/:id/received
POST  /api/admin/returns/:id/refund
```

---

## 4. Staging Environment & Deploy Safety

### 4.1 Environment separation

```text
Development  → local Docker PostgreSQL
Staging      → isolated DB + real-like config, test mail provider
Production   → private DB, managed secrets, backups
```

Mỗi environment cần:

- Database riêng
- JWT secret riêng
- OAuth callback riêng
- CORS allowlist riêng
- SMTP sandbox cho staging
- `NODE_ENV` và release version trong logs

### 4.2 CI/CD gates

Pipeline đề xuất:

```text
PR → lint → typecheck → unit test → integration test → build
main → migration validation → deploy staging → smoke test
manual approval → production deploy → health check → rollback if failed
```

Migration policy:

- Không dùng `synchronize: true` ngoài local
- Migration backward-compatible trước, code switch sau
- Destructive migration ở release riêng
- Log migration version sau deploy

### 4.3 Smoke tests

Sau deploy staging/production chạy:

```text
GET /health/live                 → 200
GET /health/ready                → 200
GET /api/products?limit=1       → 200
POST /api/auth/...               → expected auth response
```

Không dùng dữ liệu production thật trong smoke test.

---

## 5. OpenAPI Type Generation

### 5.1 Expose stable OpenAPI document

Đảm bảo Swagger JSON có version và endpoint ổn định, ví dụ `/api/docs-json`. Review các DTO để decorator phản ánh đúng nullable, enum, pagination và error response.

### 5.2 Generate client contract

```bash
npx openapi-typescript http://localhost:7001/api/docs-json \
  -o ../clothes-shop/src/types/api.generated.ts
```

Trong CI:

1. Start API với test config
2. Fetch docs JSON
3. Generate types
4. Fail nếu generated diff không được commit

Không sửa tay file generated. Các domain-specific UI types có thể wrap generated types ở FE.

---

## 6. Performance & Database Operations

### 6.1 Query review

Audit các endpoint:

- Product list và detail
- Order admin list với JSONB search
- Cart load
- Review list
- Wishlist list

Kiểm tra:

- `EXPLAIN ANALYZE` cho query phổ biến
- Index trên FK, status, slug, createdAt
- Không load relation không cần thiết
- Không trả toàn bộ image/description ở list nếu không cần

### 6.2 Pagination contract

Sau Phase 1, mọi list endpoint phải có upper bound `limit`:

```typescript
@Max(100)
limit = 24;
```

Reject hoặc clamp limit vượt maximum; không để client tạo query lấy toàn DB.

### 6.3 Caching

Chỉ cache read-only public data sau khi đo lường:

- Categories / collections
- Size guide
- Product detail ngắn hạn

Không cache cart, checkout price, permission, inventory availability nếu chưa có invalidation chính xác.

---

## 7. Analytics & Domain Events

BE không cần tự host analytics, nhưng cần phát event đáng tin cậy cho FE/analytics pipeline:

```text
product_viewed
add_to_cart
checkout_started
order_created
order_paid
order_cancelled
return_requested
```

Với order events, ưu tiên transactional outbox nếu event được dùng cho email, analytics hoặc fulfillment. Không gọi external service trực tiếp giữa DB writes nếu có thể làm transaction thành trạng thái nửa thành công.

---

## 8. Configuration & Data Governance

### 8.1 Runtime validation

Dùng schema validation cho env khi boot:

```typescript
ConfigModule.forRoot({
  isGlobal: true,
  validate: (config) => envSchema.parse(config),
});
```

Fail fast nếu thiếu `DATABASE_URL`, `JWT_SECRET`, hoặc secret production.

### 8.2 Privacy

- Không log full address, phone, email nếu không cần
- Mask PII trong admin search logs
- Xác định retention cho guest order và return records
- Có quy trình export/delete dữ liệu theo yêu cầu hợp lệ
- Secrets chỉ qua secret manager / deployment environment

---

## 9. Files Created/Changed

| File | Action |
|------|--------|
| `src/modules/health/` | New health module |
| `src/modules/return/` | New return/refund module |
| `src/common/observability/` | New Sentry/metrics integration |
| `src/core/core.module.ts` | Register health/config/observability |
| `.github/workflows/be-test.yml` | Add integration/build gates |
| `.github/workflows/be-deploy.yml` | Add staging, smoke test, approval |
| `src/main.ts` | Version, readiness, secure runtime config |
| `src/common/filter/exception.filter.ts` | Redaction + Sentry capture |
| `src/migrations/*Returns*.ts` | New return schema |
| `src/migrations/*Outbox*.ts` | New event outbox if adopted |
| `scripts/smoke-test.sh` | New post-deploy smoke test |
| `.env.example` | Add Sentry/metrics/staging variables |

---

## 10. Test Coverage Target

- Health: live/ready success and DB failure
- Return state machine: every valid/invalid transition
- Return quantity and return-window validation
- Refund idempotency and stock restoration
- Smoke tests against staging deployment
- Config validation: missing required production env fails fast
- Privacy: exception/log payload does not contain tokens or unmasked PII

## 11. Completion Criteria

Phase hoàn thành khi:

- Staging deploy tự động và smoke test pass
- Có dashboard/error alert cho 5xx và checkout failure
- Đã thực hiện một lần backup + restore thử nghiệm
- Return/refund flow có audit trail
- API performance baseline được ghi nhận cho product/order list
- Có runbook xử lý incident, rollback và database restore
