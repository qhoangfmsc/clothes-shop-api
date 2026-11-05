# 0002 — Tách `ReviewService` thành đọc và ghi

> Module: `review` (+ `pending-count` đổi chỗ tiêm) · Trạng thái: Implemented · Ngày: 2026-10-24

## 1. Bối cảnh & vấn đề

`ReviewService` (548 dòng) nằm trong allowlist `OVERSIZED_SERVICES`. Đã đọc code, ba controller, `ReviewModule`, `PendingCountService`, `review.service.spec.ts` (746 dòng). Phương thức gom theo dependency thật sự dùng:

| Nhóm | Phương thức | Dependency dùng |
|---|---|---|
| Đọc | `findByProductId`, `getSummary`, `findMine`, `findPending`, `findMyVotes`, `findAllAdmin`, `countAwaitingReply`, `findOneAdmin` (+ `getWithProduct`, các view, `roundAverage`, `HAS_IMAGES_SQL`) | `reviewRepo`, `DataSource` (query builder) |
| Ghi | `create`, `update`, `uploadImage`, `vote`/`unvote`, `hide`, `publish`, `reply`, `removeReply` (+ `resolveImages`, `lockProduct`, `refreshProductRating`, `withLockedReview`) | `DataSource` (transaction), `MediaService` |

Hai nhóm có lý do đổi khác nhau (bộ lọc/hiển thị so với luật nghiệp vụ và khoá) và gần như không dùng chung dependency. Sau mỗi lần ghi, nhóm ghi đọc lại bản ghi để trả về (view tác giả hoặc admin).

## 2. Mục tiêu & ngoài phạm vi

- Hai service đều ≤ 300 dòng, ≤ 5 dependency; bỏ mục `review.service.ts` khỏi allowlist.
- **Không đổi hành vi**: cùng route, response, transaction, thứ tự khoá (đánh giá → sản phẩm), mã lỗi. Code **di chuyển nguyên văn**.
- Ngoài phạm vi: đổi logic đánh giá, bộ lọc, hay luật kiểm duyệt.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. `ReviewQueryService` (đọc) + `ReviewService` (ghi), view tách ra `review-view.util.ts` | Hai lý do đổi tách bạch; theo đúng tiền lệ order; ghi gọi đọc một chiều | Controller tiêm nhiều service hơn |
| B. Tách ba (đọc công khai / đọc admin / ghi) | Nhỏ hơn nữa | Thêm file không cần: đọc ~250 dòng, còn dưới ngưỡng |
| C. Giữ nguyên, nâng ngưỡng allowlist | Không rủi ro | Trái mục tiêu co allowlist |

**Chọn A**.

### 3.2 Kiến trúc & ranh giới

```
review/review-view.util.ts       toPublicView, toOwnView, toAdminView, productSummary (hàm thuần)
review/review-query.service.ts   findByProductId, getSummary, findMine, findPending, findMyVotes,
                                 findAllAdmin, countAwaitingReply, findOneAdmin, findOneOwn      deps: DataSource, reviewRepo
review/review.service.ts         create, update, uploadImage, vote/unvote, hide, publish, reply, removeReply
                                                                                                 deps: DataSource, MediaService, ReviewQueryService
```
- `ReviewService` → `ReviewQueryService` một chiều (đọc-sau-ghi qua `findOneOwn`/`findOneAdmin`), không vòng.
- `ReviewModule` cung cấp cả hai, **export `ReviewQueryService`** (`PendingCountService` chỉ cần `countAwaitingReply`).
- Controller công khai tiêm Query + Command; `MyReviewController` chỉ Query; `AdminReviewController` Query + Command.
- `isUniqueViolation` cục bộ dùng lại bản trong `common/base/db-error.util.ts`.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Tách command/query theo use case | hai service | Mỗi lớp một lý do đổi, ít dependency | Controller tiêm nhiều service hơn |
| Presenter thuần dùng chung | `review-view.util.ts` | Cả đọc lẫn ghi trả cùng view, không lặp | Thêm một file |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Đọc / ghi / hiển thị tách |
| O | ✔ | Thêm bộ lọc chỉ sửa Query; thêm luật kiểm duyệt chỉ sửa Service |
| L / I | n.a. / ✔ | `PendingCountService` chỉ tiêm Query |
| D | ✔ | Biên ngoài (`MediaService`) giữ như cũ |

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Không đổi. Phương thức được cắt nguyên khối; chỉ đổi `this.getWithProduct` sang `findOneOwn`/`findOneAdmin` của Query.

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Unit | `review.service.spec.ts` dựng `ReviewQueryService` + `ReviewService`; ca đọc đổi sang gọi Query, số ca không đổi | `review.service.spec.ts` (giữ tên, hoặc tách `review-query.service.spec.ts` cho ca đọc) |
| Unit | `pending-count.spec.ts` giữ nguyên (mock `countAwaitingReply`) | không đổi |
| Flow | Toàn bộ flow review có sẵn (16 route đủ ca) | không sửa |
| Kiến trúc | Bỏ mục `review.service.ts` khỏi allowlist | `architecture.spec.ts` |

## 5. Rủi ro & rollback

Rủi ro: lỡ tay đổi hành vi khi cắt; tiêm sai. Giảm thiểu: di chuyển nguyên văn, `tsc`, toàn bộ flow review chạy lại. Rollback: `git revert`.

## 6. Kết quả triển khai

- **File mới:** `review-query.service.ts` (248 dòng, 2 dependency), `review-view.util.ts` (56 dòng). **Sửa:** `review.service.ts` (548 → 265 dòng, 3 dependency), `review.controller.ts`, `my-review.controller.ts`, `admin-review.controller.ts`, `review.module.ts` (export `ReviewQueryService`), `PendingCountService`, `review.service.spec.ts`, allowlist kiến trúc (bỏ mục `review.service.ts`).
- **Khác thiết kế:** `isUniqueViolation` cục bộ được thay bằng bản dùng chung ở `common/base/db-error.util.ts`. Spec đơn vị giữ một file (`review.service.spec.ts`) dựng cả hai service để không đổi số ca.
- **Kiểm chứng:** 825 unit và 883 flow giữ nguyên số lượng, đều xanh; độ phủ route 98/98 và 82/82, ratchet OK; không sửa flow nào.
- **Docs:** `review.md` (4.6, 4.7, mục 4.9 mới), `pending-count.md`, `common.md` (4.13), `test/README.md`.
