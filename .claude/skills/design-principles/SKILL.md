---
name: design-principles
description: Cách áp dụng Design pattern, kiến trúc, coding convention và SOLID khi thiết kế (tech spec) và viết/review code NestJS ở clothes-shop-api — quy trình chọn, mẫu code đã đối chiếu repo, câu hỏi tự kiểm, cách giải thích cho người học. Dùng ở bước ② và ③ của feature-workflow, khi review, hoặc khi cần giải thích vì sao code có hình dạng như vậy.
---

# design-principles — chọn đúng công cụ, giải thích được vì sao

Luật bắt buộc nằm ở bốn rule (đọc trước khi dùng skill này); skill chỉ là **cách làm** và **mẫu**:

| Cần biết | Rule |
|---|---|
| Code nằm đâu, ai được phụ thuộc ai, transaction/khoá, tích hợp ngoài | `.claude/rules/architecture.md` |
| Pattern đang dùng / chỉ dùng khi có điều kiện / không dùng | `.claude/rules/design-patterns.md` |
| SOLID: câu hỏi, ví dụ tốt, chỗ còn lệch | `.claude/rules/solid.md` |
| Đặt tên, lỗi, log, cấu hình, API, test, git | `.claude/rules/coding-conventions.md` |

## 1. Quy trình khi thiết kế (spec mục 3.1–3.4)

1. **Gọi tên vấn đề** bằng một câu cụ thể ("trạng thái đơn đang được kiểm bằng `if` ở 4 nơi"). Không gọi tên được → chưa cần pattern.
2. **Thử cách đơn giản nhất** (hàm thuần, hằng số, bảng tra). Giải được thì dừng.
3. **Đếm lần lặp.** Mới 1–2 lần: chấp nhận lặp. Lần 3: gom (rule of three).
4. **Cần pattern?** Tra `design-patterns.md` mục 3–6, chọn cái nhỏ nhất đủ dùng, ghi vào spec 3.3 kèm cái giá.
5. **Đặt code đúng chỗ:** controller → service → util/presenter; module hay cell? (`architecture.md` mục 4); cạnh phụ thuộc mới phải khai báo.
6. **Kiểm SOLID** (`solid.md`) và điền bảng spec 3.4; mục ✘ có lý do.
7. **Đọc lại như người mới:** có hiểu trong 2 phút không? Không → đơn giản hoá hoặc thêm một dòng "vì sao".

## 2. Mẫu code đã đối chiếu repo

### State machine — vòng đời có luồng
```ts
export const ORDER_STATUSES = ['pending', 'confirmed', 'shipping', 'delivered', 'completed', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** State machine: một nguồn sự thật cho đường đi của đơn */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  // ...
};
```
`Record<OrderStatus, …>` buộc compiler báo lỗi khi thêm trạng thái mà quên đường đi. Thật trong repo: `order/shared/order.constant.ts`, `return/shared/return-status.util.ts`.

### Gom phần giống thật, không gom cả khung
Khung "transaction → khoá → kiểm tra → làm" lặp nhiều lần nhưng **khác nhau thật** (lỗi 404/400, sở hữu, thứ tự), nên không có wrapper nhiều tham số. Phần giống hệt là literal khoá, và đó mới là thứ được gom:
```ts
// common/base/lock.util.ts
export function findLocked<T extends ObjectLiteral>(manager: EntityManager, entity: EntityTarget<T>, where: FindOptionsWhere<T>, extra = {}) {
  return manager.findOne(entity, { ...extra, where, lock: { mode: 'pessimistic_write' } });
}
```
Spec `common/0004` ghi lý do. Chỉ khi ≥ 3 khung *giống hệt* mới đáng gom thành wrapper.

### Strategy — chỉ khi có ≥ 2 nhà cung cấp thật
```ts
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
export interface PaymentGateway {
  verifyCallback(input: CallbackInput): VerifiedPayment; // thuần: ký, parse
  createSession(attempt: PaymentAttempt): SessionView;
}
// module: { provide: PAYMENT_GATEWAY, useClass: SepayGateway }
```
Hiện chỉ có SePay nên **chưa dùng**; ví dụ thêm PayPal đầy đủ ở `design-patterns.md` mục 4.1.

### Adapter + hàm thuần ở biên
Parse/verify tách khỏi service để test không cần mạng/DB (`sepay-signature.util.ts`, `sepay-payload.util.ts`). Service nghiệp vụ nhận kiểu của mình, không nhận JSON thô.

### Presenter
Không trả entity thô. Generic theo kiểu hẹp (`presentOrder<O extends OrderLike>`); kiểu trả về `MoneyFields<'price'>` ép cặp `Vnd`/`Usd` lúc compile.

### Unit of Work + khoá, Idempotency
Xem `architecture.md` mục 6 và `design-patterns.md` mục 3.1. Hợp đồng khoá kiểm bằng flow `lock-contract.flow.ts`; race webhook ↔ huỷ đơn là lý do tồn tại.

### Event / Observer — chỉ cho phản ứng phụ
Hợp với thông báo, cache, log nghiệp vụ. **Không** cho bước cần nguyên tử với tiền (handler chạy ngoài transaction của người phát).

## 3. Cách giải thích cho người học (spec, comment, báo cáo)

Mẫu 3 ý: **vấn đề → pattern/nguyên lý chọn → cái giá**. Ví dụ: "Trạng thái đơn bị kiểm bằng `if` ở nhiều nơi → bảng chuyển trạng thái (State machine) cho một nguồn sự thật → thêm một file và buộc khai báo đủ mọi trạng thái." Một dòng comment ở chỗ định nghĩa; phần dài nằm ở spec.

## 4. Kiểm nhanh khi review

- [ ] `architecture.md` mục 12, `design-patterns.md` mục 8, `solid.md` mục 9, `coding-conventions.md` mục 13 đều đạt?
- [ ] `yarn test` (gồm `architecture.spec.ts`, `conventions.spec.ts`) xanh, không thêm vào allowlist để qua?
