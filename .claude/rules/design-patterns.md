# Rule: design pattern — dùng đúng cái đang cần, không dùng cho đủ bộ

Luật bắt buộc khi thiết kế (spec mục 3.3) và viết code. Mục lục: `engineering-principles.md`. Mẫu code và giáo trình mở rộng: skill `design-principles`.

## 1. Design pattern là gì, vì sao phải kỷ luật

**Design pattern** là lời giải đã được đặt tên cho một dạng vấn đề lặp lại. Giá trị của nó là (1) cả đội nói chung một ngôn ngữ ("đây là State machine"), (2) tránh nghĩ lại từ đầu. Nhưng mỗi pattern **thêm code và thêm khái niệm**, nên dùng sai chỗ còn tệ hơn không dùng.

Ba luật nền:
1. **Gọi tên được vấn đề trước.** "Trạng thái đơn bị kiểm bằng `if` ở 4 nơi" là vấn đề; "cho đẹp / để sau này" thì không. Không gọi tên được thì không dùng pattern.
2. **Thử cách đơn giản nhất** (hàm thuần, hằng số, bảng tra) trước. Giải được thì dừng.
3. **Rule of three:** lần 1 viết thẳng, lần 2 chấp nhận lặp, lần 3 mới gom. "Không dùng pattern nào" là kết luận hợp lệ.

Mỗi pattern được chọn phải ghi **vấn đề + cái giá** ở spec mục 3.3 và một dòng comment ở chỗ định nghĩa (xem mục 7).

## 2. Quy trình chọn

```
Có vấn đề cụ thể gọi tên được? ── không ─► viết thẳng, dừng
        │ có
Hàm thuần / hằng / bảng tra giải được? ── có ─► dùng, dừng
        │ không
Đã lặp ≥ 3 lần (hoặc framework đã có sẵn lời giải)? ── không ─► chấp nhận lặp lần này
        │ có
Chọn pattern NHỎ nhất đủ dùng ở mục 3–5 → ghi spec 3.3 (vấn đề, cái giá) → kiểm SOLID (solid.md)
```

## 3. Đang dùng trong dự án (có file làm mẫu, được ép/kiểm thế nào)

| Pattern | Vấn đề nó giải ở đây | Mẫu trong repo | Cái giá | Kiểm |
|---|---|---|---|---|
| **Presenter** | Entity có cột tiền thô; phải trả cặp `Vnd`/`Usd` và ẩn field nội bộ | `order/shared/order.presenter.ts` (`presentOrder`), `product.presenter.ts`, `payment.presenter.ts` | Một file map thêm cho mỗi entity trả ra API | Unit `*.presenter.spec.ts`; rule tiền ở `CLAUDE.md` |
| **State machine** | Vòng đời đơn/trả hàng/hoàn tiền: không để `if (status === …)` rải rác | `ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]>` (`order/shared/order.constant.ts`); `assertReturnStatus` (`return/shared/return-status.util.ts`) | Thêm bảng; chỉ đáng khi ≥ 3 trạng thái | `Record<Status,…>` làm compiler bắt thiếu trạng thái; test kiến trúc cấm `status: string` |
| **Unit of Work** | Nhiều ghi phải cùng thành công (huỷ đơn + hoàn tiền + huỷ QR) | `dataSource.transaction(...)` ở `OrderStatusService`, `OrderCheckoutService`, `PaymentConfirmService`… | Phải truyền `EntityManager` xuống hàm con | Flow test + `lock-contract.flow.ts` |
| **Pessimistic lock qua một điểm đổi** | Hai request cùng sửa một đơn (webhook vs huỷ đơn) | `findLocked` (`common/base/lock.util.ts`) | Giữ khoá lâu hơn nếu transaction dài | `architecture.spec.ts` cấm `lock: {mode}` tản mát |
| **Idempotency** | Webhook/retry đến hai lần | UNIQUE `(provider, provider_transaction_id)` + bắt `23505` (`SepayWebhookService`); helper chung `isUniqueViolation`, `saveOrThrowOnConstraint` (`common/base/db-error.util.ts`); SepayWebhookService còn tự khai báo mã `23505` — lệch nhỏ, dùng helper khi chạm tới | Phải nghĩ tới race, không tin "kiểm tra rồi ghi" | Flow `concurrency.flow.ts` |
| **Query/Command split (CQS)** | Service vừa ghi nghiệp vụ vừa dựng query admin | `OrderStatusService` + `OrderQueryService`; `RefundService` + `RefundQueryService`; … | Hai class thay một | Trần 300 dòng/5 dependency (máy ép) |
| **Adapter (biên dịch vụ ngoài)** | Service nghiệp vụ không được biết JSON của SePay | `sepay-payload.util.ts`, `sepay-signature.util.ts` (hàm thuần) + `SepayWebhookService` | Thêm một lớp parse | Unit `*.util.spec.ts` không cần mạng |
| **Decorator composition** | Gộp nhiều decorator thành một (sort/search chuẩn cho mọi list) | `@SortField`, `@SearchField` dùng `applyDecorators` | Một lớp gián tiếp | `list-query.dto.spec.ts` |
| **Guard / Pipe / Filter / Middleware** (Chain of Responsibility của Nest) | Auth, quyền, rate limit, validate, định dạng lỗi, request id làm ngang mọi route | `JwtAuthGuard`, `PermissionsGuard`, `RateLimitGuard`, `ValidationPipe`, `AllExceptionFilter`, `RequestIdMiddleware` | Phải biết thứ tự thực thi | `test/flows/access` (snapshot route–quyền, ma trận 401/403) |
| **Facade qua service được export** | Module khác cần một khả năng mà không biết bảng | `PaymentAttemptService`, `RefundService`, `*QueryService` export từ module | Phải thêm method khi cần | `architecture.spec.ts` (ghi chéo module qua hàm chủ) |
| **Hàm một điểm đổi (Single point of change)** | Một hiệu ứng phụ dùng ở nhiều luồng | `applyOrderPaid` (webhook khớp *và* admin xác nhận), `refreshProductRating` | Hàm nhận `EntityManager` nên khó gọi ngoài transaction | Unit + flow luồng thanh toán |
| **Scheduler (Cron job idempotent)** | Dọn trạng thái hết hạn trong DB | `PaymentExpiryScheduler` (`@Cron`, idempotent nên chạy nhiều instance vẫn an toàn) | Job chạy ở mọi instance | Unit service gọi |
| **Mutual exclusion (advisory lock)** | Hai instance cùng chạy migration lúc khởi động | `runMigrationsWithLock` (`scripts/migrate.ts`, `pg_advisory_lock`) | Instance sau chờ; giữ thêm một kết nối | `test/flows/migration/migration-lock.flow.ts` (hai runner đồng thời) |
| **Adapter + Fallback (graceful degradation)** | Rate limit dùng chung nhiều instance mà Redis lỗi không được kéo API sập | `RedisThrottlerStorage` bọc bởi `FallbackThrottlerStorage` (`common/utils/rate-limit.storage.ts`) | Khi Redis lỗi, giới hạn trở lại theo từng instance | `rate-limit.storage.spec.ts` + flow với Redis thật |
| **Structured logging** | Log text không lọc/nối được theo request | `RequestLogMiddleware` (`buildRequestLog` thuần), `ConsoleLogger({ json: true })` ở production | Phải giữ bộ trường ổn định; một dòng log mỗi request | `request-log.middleware.spec.ts`, `smoke:prod` |
| **Fail-fast (cấu hình)** | Production cấu hình sai thì không được chạy | `validateEnv` (`core/env.validation.ts`) | Thêm env mới phải sửa hàm validate | `env.validation.spec.ts` + smoke boot (`release-gate.md`) |
| **Cell / package-by-feature** | Module lớn khó biết phần nào lo việc gì | `payment/`, `order/`, `return/`, `review/`, `product/` | Nhiều thư mục; phải khai báo cạnh phụ thuộc | `architecture.spec.ts` (cell) |
| **Test Data Builder** | Dựng dữ liệu hợp lệ cho flow test | `test/support/builders.ts` (`b.user()`, `b.product()`…) | Phải cập nhật khi schema đổi | Flow test dùng chúng |
| **Ratchet** (không phải pattern GoF, là kỹ thuật kiểm) | Nợ cũ không được phình, chỉ co | allowlist kiến trúc, `coverage-baseline.json` | Phải dọn khi nợ giảm | CI |

### 3.1 Mẫu chi tiết của các pattern cốt lõi

**State machine** — một nguồn sự thật cho vòng đời:
```ts
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipping', 'cancelled'],
  // ...
};
const allowed = ORDER_TRANSITIONS[order.status];
if (!allowed.includes(dto.status)) throwAppError(...);
```
`Record<OrderStatus, …>` buộc compiler báo lỗi khi thêm trạng thái mà quên khai báo đường đi (Open/Closed bằng dữ liệu). Chuyển trạng thái do hệ thống (`RECEIVED → REFUNDED`) khai báo cùng bảng hoặc có tên riêng, không giấu trong `if`.

**Unit of Work + khoá** — thứ tự khoá cố định:
```ts
await this.dataSource.transaction(async (manager) => {
  const order = await findLocked(manager, Order, { id });           // 1) orders trước
  const attempt = await findLocked(manager, PaymentAttempt, {...}); // 2) rồi bản ghi con
  // ghi tất cả bằng `manager`, gọi hàm module khác cũng truyền `manager`
});
```

**Idempotency** — chốt chặn ở DB, không ở tầng ứng dụng một mình:
```ts
try { await manager.insert(PaymentTransaction, tx); }
catch (e) { if (isUniqueViolation(e, 'UQ_...')) return alreadyProcessed(); throw e; }
```

**Query/Command split** — ghi xong trả view qua service đọc của chính cell:
```ts
async cancel(...) { await this.dataSource.transaction(...); return this.queryService.findOne(userId, id); }
```

## 4. Sẽ dùng khi có điều kiện kích hoạt (chưa dùng, đừng làm trước)

| Pattern | Điều kiện kích hoạt | Hiện trạng |
|---|---|---|
| **Strategy / Port-Adapter** cho cổng thanh toán | Spec đã chốt nhà cung cấp thứ hai (vd PayPal). Một implementation thì chưa đáng | Chỉ SePay → chưa dùng |
| **Domain event + Outbox** | Có phản ứng phụ không cần nguyên tử (email/thông báo trạng thái đơn) | Chưa có thông báo → chưa dùng |
| **Retry + timeout tại adapter** | Gọi dịch vụ ngoài mà lỗi tạm thời gây hỏng nghiệp vụ (Supabase, SePay API) | Chưa có chính sách retry; thêm ở adapter khi có sự cố đo được |
| **Cache-aside** | Số đo cho thấy truy vấn lặp là điểm nghẽn (vd tỷ giá, cấu hình ship) | Chưa đo → chưa dùng |

### 4.1 Ví dụ có lời giải: thêm thanh toán PayPal

Cái gì **đã chung** và PayPal tái dùng nguyên: `assertOrderPayable` (đơn còn thanh toán được?), `applyOrderPaid` (hiệu ứng lên đơn), `PaymentAttempt`/`PaymentTransaction` (cột `provider` đã có), `RefundService`.
Cái gì **khác theo nhà cung cấp**: tạo phiên (QR vs link duyệt), xác minh callback (HMAC SePay vs chữ ký PayPal), cách hoàn tiền (chuyển khoản tay vs API).

Thiết kế theo bước, mỗi bước một spec nếu đổi ranh giới:
1. Cell mới `payment/paypal/` (adapter hàm thuần parse/verify + controller callback + service) — **không** nhét vào `sepay/`.
2. Chỗ `PaymentAttemptService` chọn cách tạo phiên theo `provider` là nơi **đáng dùng Strategy**: interface nhỏ (`createSession`, `verifyCallback`) + token DI, hai implementation thật (SePay, PayPal). Ghi cái giá: thêm interface + token.
3. Bất biến "đơn được đánh dấu paid" vẫn chỉ qua `applyOrderPaid`.
4. Phạm vi kiểm tra lại: `change-impact.md` (payment, order, refund, return, review, pending-count và flow tiền).

## 5. Không dùng (và lý do)

| Không dùng | Lý do |
|---|---|
| Singleton tự viết | DI của Nest đã quản lý vòng đời |
| Abstract Factory / Factory "cho đẹp" | Không có họ đối tượng cần chọn lúc chạy |
| Generic Repository bọc TypeORM | Che mất QueryBuilder/lock; thêm lớp không giải vấn đề |
| Kế thừa để tái dùng logic nghiệp vụ | Dùng composition + hàm thuần. Kế thừa chỉ cho cột/DTO chung (`BaseEntity`, `PaginationQueryDto`) |
| God service | Vi phạm SRP; trần 300 dòng/5 dependency |
| CQRS đầy đủ, Event Sourcing, Saga | Một DB, transaction cục bộ đủ; chưa có vấn đề nào chúng giải |
| Mediator / event bus nội bộ cho luồng tiền | Handler chạy ngoài transaction của người phát, mất nguyên tử |
| Active Record | Entity chỉ ánh xạ bảng, nghiệp vụ ở service/util |
| `forwardRef` | Dấu hiệu vòng phụ thuộc; sửa thiết kế |

## 6. Bảng tra nhanh: dấu hiệu → pattern

| Dấu hiệu trong code | Hướng |
|---|---|
| `if (status === …)` ở nhiều nơi | State machine |
| Entity trả thẳng cột tiền | Presenter |
| Hai thao tác ghi phải cùng thành công | Unit of Work |
| "Kiểm tra tồn tại rồi insert" | UNIQUE + bắt `23505` (Idempotency) |
| Service > 300 dòng hoặc vừa ghi vừa dựng query admin | Query/Command split |
| `switch (provider)` ở ≥ 2 nơi và có ≥ 2 nhà cung cấp thật | Strategy |
| Code nghiệp vụ gọi thẳng SDK/`fetch` ngoài | Adapter ở biên |
| Cùng một hiệu ứng phụ ở ≥ 3 luồng | Hàm một điểm đổi |
| Lặp một khung transaction nhưng mỗi nơi khác nhau (lỗi, sở hữu, thứ tự) | **Không gom**; gom phần giống thật (`findLocked`) |

## 7. Cách ghi pattern (để người học đọc được)

- **Spec mục 3.3:** bảng `Pattern · Dùng ở · Vấn đề · Cái giá`. "Không dùng pattern" thì nói lý do.
- **Code:** một dòng comment ở chỗ định nghĩa: tên pattern + vấn đề (vd `/** State machine: một nguồn sự thật cho đường đi của đơn */`). Giải thích dài để ở spec.
- **Báo cáo cuối:** 1–3 dòng "pattern nào, ở đâu, vì sao (hoặc vì sao cố ý không dùng)".

## 8. Checklist review pattern

- [ ] Pattern gọi tên được vấn đề cụ thể và cái giá? Không phải "để sau này"?
- [ ] Có cách đơn giản hơn (hàm/hằng/bảng) giải được không?
- [ ] Đã rule of three, hay mới lặp 1–2 lần?
- [ ] Không rơi vào danh sách "Không dùng"?
- [ ] Đã ghi ở spec 3.3 và comment một dòng ở chỗ định nghĩa?
