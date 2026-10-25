---
name: design-principles
description: Kiến thức và checklist áp dụng Design pattern, kiến trúc, coding convention và SOLID khi thiết kế (tech spec) và viết/review code NestJS ở clothes-shop-api — chọn pattern theo vấn đề, mẫu code, ví dụ tốt/xấu từ repo, câu hỏi tự kiểm. Dùng ở bước ② và ③ của feature-workflow, khi review, hoặc khi cần giải thích vì sao code có hình dạng như vậy.
---

# design-principles — chọn đúng công cụ, giải thích được vì sao

Luật bắt buộc: `.claude/rules/engineering-principles.md`. Skill này là **giáo trình + checklist**: dùng để quyết định và để giải thích cho người học. Mọi ví dụ "trong repo" đã được đối chiếu với code.

## 1. Quy trình chọn (làm theo thứ tự, dừng ở bước đủ)

1. **Gọi tên vấn đề** bằng một câu cụ thể ("trạng thái đơn đang được kiểm bằng `if` ở 4 nơi"). Không gọi tên được → chưa cần pattern.
2. **Thử cách đơn giản nhất** (hàm thuần, hằng số, bảng tra). Giải được thì dừng.
3. **Mới lặp lần 1–2?** Chấp nhận lặp. **Lần 3?** Gom lại (rule of three).
4. **Cần pattern?** Tra mục 3, chọn cái nhỏ nhất đủ dùng, ghi vào spec 3.3 kèm cái giá.
5. **Kiểm SOLID** (mục 4) cho thiết kế vừa chọn; ghi vào spec 3.4.
6. **Thử đọc lại như người mới:** có hiểu trong 2 phút không? Không → đơn giản hoá hoặc thêm comment "vì sao".

## 2. Kiến trúc — những câu hỏi tự kiểm

| Câu hỏi | Vì sao quan trọng | Hiện trạng repo |
|---|---|---|
| Controller có logic nghiệp vụ không? | Logic ở controller không test được nếu không dựng HTTP, và bị lặp giữa public/admin | Tốt: controller chỉ chuyển tiếp (`order.controller.ts`) |
| Module A có với tay vào bảng của module B? | Đổi cột của B làm vỡ A (coupling qua dữ liệu) | Lệch: `Order` được import ở payment, return, review và các module đó tự `forFeature([Order])` — ghi ở `common.md` 4.13 |
| Có vòng phụ thuộc giữa module? | Vòng buộc hai module sống chết cùng nhau, khó test | Tốt: không có `forwardRef` |
| `common/` có import `modules/`? | Hạ tầng phụ thuộc nghiệp vụ làm đảo chiều phụ thuộc | Gần sạch: chỉ `permissions.guard.ts` import `User` |
| Service > ~300 dòng hoặc > ~5 dependency? | Dấu hiệu nhiều lý do để đổi (SRP) | cả hai allowlist đã rỗng; các service từng vượt đều được tách theo đọc/ghi hoặc use case (`OrderService` spec `order/0002`, `ReviewService` `review/0002`, `PaymentService` `payment/0002`, `RefundService` `payment/0003`, `ReturnService` `return/0002`, `CategoryService` `category/0002`, `ProductService` `product/0002`) |
| Logic thuần có tách khỏi I/O? | Hàm thuần test nhanh, không mock | Tốt: `sepay-*.util`, `payment-paid.util`, `*-eligibility.util`, `money.util` |
| Ranh giới transaction ở đâu? | Ghi tiền/trạng thái rải nhiều transaction thì có trạng thái nửa vời | Tốt: `cancelLocked` gom huỷ đơn + hoàn tiền + huỷ QR trong một transaction |

**Modular monolith:** mỗi module sở hữu bảng và nghiệp vụ của nó, cho module khác dùng qua service được export. Chưa cần microservice/CQRS/DDD đầy đủ; chỉ cân nhắc khi spec chỉ ra vấn đề cụ thể mà cấu trúc hiện tại không giải được.

## 3. Danh mục pattern (vấn đề → pattern → mẫu → cái giá)

### State machine — vòng đời có luồng
*Dấu hiệu:* `if (status === ...)` rải rác; thêm trạng thái phải sửa nhiều nơi.
```ts
export const ORDER_STATUSES = ['pending', 'confirmed', 'shipping', 'delivered', 'completed', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** State machine: mỗi trạng thái → các trạng thái được chuyển tới (một nguồn sự thật) */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipping', 'cancelled'],
  shipping: ['delivered'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!TRANSITIONS[from].includes(to)) throwAppError(EOrderErrorCode.ORDER_STATUS_INVALID_TRANSITION, `${from} → ${to}`);
}
```
`Record<OrderStatus, …>` buộc compiler báo lỗi khi thêm trạng thái mà quên khai báo chuyển tiếp (Open/Closed bằng dữ liệu). *Cái giá:* thêm một file; chỉ đáng khi ≥ 3 trạng thái. *Trong repo:* `VALID_TRANSITIONS` (order, kiểu `Record<string, string[]>` lỏng), `assertStatus` (return).

### Gom phần lặp thật, không gom cả khung — Template Method / hàm tiện ích
*Dấu hiệu:* cùng một đoạn lặp ở nhiều nơi (rule of three). *Bài học trong repo:* khung "transaction → khoá → kiểm tra tồn tại → làm việc" lặp 22 lần nhưng **khác nhau thật** (lỗi 404 hay 400, điều kiện sở hữu, tra bản ghi con trước khi khoá cha), nên một wrapper nhiều tham số sẽ khó đọc. Phần giống hệt là literal khoá, và đó mới là thứ được gom:
```ts
// common/base/lock.util.ts: một chỗ chọn chiến lược khoá
export function findLocked<T extends ObjectLiteral>(manager: EntityManager, entity: EntityTarget<T>, where: FindOptionsWhere<T>, extra = {}) {
  return manager.findOne(entity, { ...extra, where, lock: { mode: 'pessimistic_write' } });
}
```
Khung transaction giữ trong từng service. *Cái giá của phương án này:* mỗi service vẫn tự viết "không thấy thì báo lỗi gì" (đúng là phần khác nhau). Chỉ khi ≥ 3 khung *giống hệt* mới đáng gom thành wrapper (spec `common/0004`).

### Strategy — thay thuật toán/nhà cung cấp lúc chạy
*Dấu hiệu:* `switch (provider)` ở nhiều nơi; thêm nhà cung cấp phải sửa service.
```ts
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
export interface PaymentGateway {
  verifyWebhook(input: WebhookInput): VerifiedTransfer;       // thuần: ký, parse
  buildQr(attempt: PaymentAttempt): QrView;
}
// module: { provide: PAYMENT_GATEWAY, useClass: SepayGateway }
// service: constructor(@Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway)
```
*Cái giá:* thêm interface + token + một lớp gián tiếp. **Chỉ làm khi có ≥ 2 nhà cung cấp thật** (hoặc spec đã chốt). Hiện repo chỉ có SePay nên chưa dùng — đây là lựa chọn đúng.

### Adapter — bọc dịch vụ ngoài
Parse/verify là hàm thuần tách khỏi service để test không cần mạng/DB (`sepay-signature.util.ts`, `sepay-payload.util.ts`). Service nghiệp vụ nhận kiểu của *mình* (`SepayWebhookPayload`), không nhận JSON thô.

### Presenter — entity → response
Không bao giờ trả entity thô. Dùng generic kiểu hẹp (`OrderLike`) để dùng lại cho nhiều hình dạng (`presentOrder<O extends OrderLike>`). Kiểu trả về `MoneyFields<'price'>` ép cặp `Vnd`/`Usd` ngay lúc compile.

### Unit of Work + khoá bi quan — nhiều ghi phải cùng thành công
`dataSource.transaction` + `findLocked` theo **thứ tự cố định** (`Order` trước, rồi bản ghi con) để tránh deadlock; thứ tự ghi ở `docs/modules/common.md`, hợp đồng khoá được kiểm bằng `test/flows/order-payment/lock-contract.flow.ts` (giữ khoá từ ngoài, đổi đơn, nhả khoá: thao tác bỏ khoá sẽ lộ ra). Race giữa webhook và huỷ đơn là lý do tồn tại của nó.

### Idempotency — chịu được gửi lặp
UNIQUE ở DB làm chốt chặn cuối + bắt lỗi `23505` thành kết quả "đã xử lý" (`SepayWebhookService`). Không tin vào kiểm tra "đã tồn tại chưa" ở tầng ứng dụng một mình (race).

### Builder (test) — dữ liệu hợp lệ với mặc định hợp lý
`b.product({ price: 350_000 })` chỉ nêu cái khác biệt (`test/support/builders.ts`).

### Event / Observer — chỉ cho phản ứng phụ
Phù hợp thông báo, đồng bộ cache, ghi log nghiệp vụ. **Không** dùng cho bước cần nguyên tử với tiền: `@nestjs/event-emitter` chạy handler ngoài transaction của người phát.

### Không dùng (và vì sao)
Singleton tự viết (DI đã quản lý vòng đời), Abstract Factory/Factory "cho đẹp" (không có họ đối tượng cần chọn), generic repository bọc TypeORM (che mất tính năng của QueryBuilder/lock), kế hoạch kế thừa sâu để chia sẻ logic (dùng composition + hàm thuần).

## 4. SOLID — câu hỏi tự kiểm kèm ví dụ

| | Câu hỏi | Tốt trong repo | Cần cải thiện |
|---|---|---|---|
| **S** | "Class này có mấy lý do để đổi?" | Presenter, scheduler, config, `sepay-*.util` mỗi cái một việc | `OrderService` cũ (checkout + báo giá + huỷ + trạng thái + lọc admin) đã tách thành Query / Checkout / Status; `PaymentService` cũ (cấp mã QR + xác nhận thủ công + truy vấn) đã tách thành ba service |
| **O** | "Thêm giá trị mới có phải sửa logic cũ?" | `@SortField([...])`, `ORDER_STATUSES`, `sortValues` | Thêm phương thức giao/cổng thanh toán phải sửa service |
| **L** | "Lớp con thay lớp cha có vỡ không?" | `BaseEntity`; `PaginationQueryDto` (có test ép) | — |
| **I** | "Có bị ép nhận thứ không dùng?" | `presentOrder` nhận `OrderLike` (4 field), không nhận cả `Order` | Hàm nhận entity đầy đủ chỉ để đọc 1–2 field |
| **D** | "Logic nghiệp vụ biết tên chi tiết cụ thể nào?" | Nest DI tiêm service | `SepayWebhookService` (cell `payment/sepay/`) biết thẳng SePay; `OrderStatusService` / `OrderQueryService` gọi trực tiếp `PaymentAttemptService` + `RefundService` (có chủ đích vì cần cùng transaction) |

Cách đếm nhanh SRP: **số dependency của constructor** và **số mock cần cho một unit test**.

## 5. Coding convention — kiểm nhanh khi review

- [ ] Lỗi dùng `throwAppError` + error code; không exception thô.
- [ ] Trạng thái/enum là `as const` + type union dùng chung DTO ↔ entity.
- [ ] Không magic number/string; không code chết; comment ít và ngắn (rule `comments.md`).
- [ ] Tên file/class/hàm đúng vai trò (`x.service.ts`, `presentX`, `assertX`, `applyX`).
- [ ] Tiền theo cặp `Vnd/Usd`, qua `money()`; không trả entity thô.
- [ ] `yarn lint` không thêm cảnh báo; quy ước quan trọng có test/lint ép; `yarn test` (gồm `architecture.spec.ts`) xanh, không thêm vào allowlist để qua.

## 6. Cách giải thích cho người học (trong spec, comment, báo cáo)

Theo mẫu 3 ý: **vấn đề → pattern/nguyên lý chọn → cái giá**. Ví dụ: "Trạng thái đơn bị kiểm bằng `if` ở nhiều nơi → dùng bảng chuyển trạng thái (State machine) để có một nguồn sự thật → thêm một file và buộc khai báo đủ mọi trạng thái." Một dòng comment ở chỗ định nghĩa pattern là đủ; phần giải thích dài nằm ở spec.
