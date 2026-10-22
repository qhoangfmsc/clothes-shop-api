# 0004 — Một chỗ duy nhất cho khoá dòng (`findLocked`)

> Module: `common` (+ order, payment, return, review chỉ đổi cách gọi) · Trạng thái: Implemented · Ngày: 2026-10-22

## 1. Bối cảnh & vấn đề

Đã đọc 22 chỗ mở transaction và 20 chỗ khoá dòng `pessimistic_write` ở order, payment (3 service), return, review. Hiện trạng:

- Literal `manager.findOne(X, { where, lock: { mode: 'pessimistic_write' } })` lặp **20 lần**; muốn đổi chiến lược khoá (vd thêm timeout, `NOWAIT`) phải sửa 20 chỗ.
- Quy tắc chống deadlock "khoá `Order` trước, rồi bản ghi con (`PaymentTransaction` → `PaymentAttempt`, `Refund`, `ReturnRequest`)" chỉ nằm trong comment; các unit test (`manager.locks`) đang kiểm thứ tự này ở payment-confirm, refund, return, sepay-webhook.
- Hai helper cục bộ gần giống nhau: `ReturnService.withLockedRequest` (tra yêu cầu, khoá đơn rồi yêu cầu) và `ReviewService.withLockedReview` (khoá đánh giá).
- Các khung **khác nhau thật**: lỗi khi không thấy (404 hay 400 mặc định: `updateStatus` của admin cố ý chưa truyền 404), điều kiện sở hữu theo `userId`, tra bản ghi con *trước* khi khoá cha (refund, return, webhook), một số khoá có `select`.
- Khoá cố vấn (advisory) của category (`pg_advisory_xact_lock`) là cơ chế khác, ngoài phạm vi.

## 2. Mục tiêu & ngoài phạm vi

- Một hàm duy nhất ở `common/` mô tả cách khoá một dòng; mọi chỗ khoá dòng dùng nó; máy ép (không còn literal `lock: { mode:` ngoài hàm đó).
- Không đổi hành vi: cùng truy vấn, cùng thứ tự khoá, cùng lỗi.
- Ngoài phạm vi: gộp các khung transaction thành wrapper chung nhiều tham số; đổi chiến lược khoá; khoá cố vấn của category.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. `findLocked(manager, Entity, where, extra?)` + luật kiến trúc + ghi quy tắc thứ tự khoá một chỗ | Bỏ lặp, một chỗ đổi chiến lược khoá, máy ép; khung từng service giữ nguyên nên đọc vẫn rõ | Mỗi service vẫn tự viết "không thấy thì báo lỗi gì" (đúng là phần khác nhau) |
| B. A + wrapper `lockedTransaction(dataSource, Entity, where, onMissing, work)` | Bỏ thêm 2 dòng mỗi chỗ | 5 tham số; các khung khác nhau (tra con trước, sở hữu qua đơn, 400 vs 404) không vừa → hai nửa vừa dùng vừa không |
| C. Không làm | — | Giữ 20 literal |

**Chọn A.** Wrapper chung chưa được chứng minh: các khung có hình dạng khác nhau, nên giữ khung trong từng service (rule of three chỉ thỏa cho literal khoá, không thỏa cho cả khung).

### 3.2 Kiến trúc & ranh giới

```
common/base/lock.util.ts      findLocked(manager, entity, where, extra?): Promise<T | null>
service (order, payment, refund, return, review, sepay-webhook)  gọi findLocked thay literal
architecture.spec.ts          luật: `lock: { mode:` chỉ xuất hiện trong lock.util.ts
```
`common/` chỉ phụ thuộc TypeORM (không import `modules/`).

Quy tắc thứ tự khoá toàn dự án (ghi ở `docs/modules/common.md` và đầu `lock.util.ts` một dòng): `Order` trước, rồi bản ghi con theo thứ tự `PaymentTransaction` → `PaymentAttempt` / `Refund` / `ReturnRequest`; `Review` và `Product` (tính lại điểm sao) khoá riêng, không cùng `Order` trong một transaction.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Hàm tiện ích một điểm (single point of change) | `findLocked` | Đổi chiến lược khoá ở một chỗ | Thêm một hàm mỏng |

Không dùng Template Method/wrapper nhiều tham số (xem 3.1).

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Cách khoá nằm một chỗ; service chỉ quyết định khoá gì và báo lỗi gì |
| O | ✔ | Thêm tuỳ chọn khoá (timeout) vào một hàm, không sửa 20 chỗ |
| L / I / D | n.a. | — |

### 3.5–3.8

Dữ liệu, API, lỗi: không đổi. Luồng: giữ nguyên thứ tự và điều kiện từng lần khoá (cùng `where`, cùng `select` nếu có); mỗi chỗ thay đúng một lệnh gọi.

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Unit (có sẵn) | Thứ tự khoá `Order → …` ở confirm, refund, return, webhook, createQr; số lần khoá ở review | `*.spec.ts` hiện có |
| Unit | `findLocked` gọi `findOne` với `lock: { mode: 'pessimistic_write' }`, đúng `where`/`select`, trả `null` khi không có | `lock.util.spec.ts` (mới) |
| Kiến trúc | Không còn `lock: { mode:` ngoài `lock.util.ts` | `architecture.spec.ts` |
| Flow (Postgres thật, song song) | (1) nhiều `POST /api/payments/qr` đồng thời cho một đơn → mọi lời gọi thành công, đúng 1 phiên `PENDING`, cùng mã; (2) hai webhook cùng id gửi song song → 1 giao dịch, đơn `paid` một lần; (3) huỷ đơn và webhook thanh toán chạy đồng thời, lặp nhiều lần → luôn giữ bất biến "không có đơn `cancelled` + `paid` mà thiếu khoản hoàn" | `test/flows/order-payment/concurrency.flow.ts` (mới) |
| Hồi quy | 752 unit, 44 flow, snapshot route | toàn bộ |

Các flow song song kiểm **bất biến**, không kiểm kết quả cụ thể của cuộc đua, để không chập chờn. Phá thử: bỏ khoá ở `createQr` → flow (1) phải đỏ.

## 5. Rủi ro & rollback

Rủi ro: đổi sai `where`/thứ tự khoá gây deadlock hoặc mất bảo vệ đua; giảm thiểu bằng việc thay từng chỗ một cách máy móc, unit test thứ tự khoá có sẵn và flow song song mới. Rollback: `git revert`.

## 6. Kết quả triển khai

- **File:** `common/base/lock.util.ts` (+ `lock.util.spec.ts`), 25 chỗ gọi ở `order`, `payment`, `refund`, `sepay-webhook`, `return`, `review` (thay mọi literal `lock: { mode: 'pessimistic_write' }`, không còn chỗ nào ngoài tiện ích), luật kiến trúc "khoá dòng chỉ qua `findLocked`", `test/support/locks.ts`, `concurrency.flow.ts` (4), `lock-contract.flow.ts` (4); `biome.json` loại `test/coverage-baseline.json` (Biome tự định dạng lại file JSON này và xung đột với định dạng script ghi).
- **Khác thiết kế:** thêm tuỳ chọn `order` cho `findLocked` (một chỗ khoá bản ghi mới nhất của đơn). Ngoài ra thêm hợp đồng khoá tất định (`lock-contract.flow.ts`) vì test đua ngẫu nhiên không đủ: bỏ khoá ở huỷ đơn khách 3/3 lần không bị bắt, trong khi giữ khoá từ kết nối riêng bắt được cả 4 điểm (huỷ, đổi trạng thái, tạo QR, webhook) và 7/8 test đỏ khi chính `findLocked` ngừng khoá.
- **Trần kích thước service:** 3 file (`refund`, `return`, `review`) dài thêm đúng 1 dòng do dòng `import { findLocked }`; nâng trần mỗi file 1 dòng trong allowlist (độ phức tạp không tăng, phần lặp bị loại).
- **Phá thử:** bỏ khoá ở `createQr` (test song song bắt 3/3), ở huỷ đơn, đổi trạng thái, webhook (hợp đồng khoá bắt từng điểm), `findLocked` ngừng khoá (7/8 đỏ), thêm literal khoá ngoài tiện ích (luật kiến trúc bắt).
- **Docs:** `common.md` (4.8, 4.12), `payment.md` (4.7), skill `design-principles`, rule `engineering-principles`, `test/README.md`, `test/PROGRESS.md`, roadmap.
