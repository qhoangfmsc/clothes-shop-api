# 0003 — `review` chia cell: public, authoring, vote, moderation

> Module: `review` (+ `pending-count` đổi đường import) · Trạng thái: Implemented · Ngày: 2026-10-25 · Theo common/0011

## 1. Bối cảnh & vấn đề

`review` có 11 file phẳng (hai service từ review/0002, ba controller, entity, util). Ba controller và hai service vẫn trộn bốn nhóm việc:

| Nhóm | Phương thức / route |
|---|---|
| Xem công khai | `findByProductId`, `getSummary`; `GET /api/reviews/:productId`, `/:productId/summary` |
| Khách viết | `create`, `update`, `uploadImage`; `findMine`, `findPending`, `findOneOwn`; `POST /api/reviews`, `PATCH /api/reviews/:id`, `POST /api/reviews/images`; `GET /api/my-reviews`, `/pending` |
| Bình chọn "hữu ích" | `vote`, `unvote`, `findMyVotes`; `POST/DELETE /api/reviews/:id/helpful`; `GET /api/my-reviews/votes` |
| Kiểm duyệt (admin) | `hide`, `publish`, `reply`, `removeReply`; `findAllAdmin`, `findOneAdmin`, `countAwaitingReply`; `/api/admin/reviews/*` |

Các nhóm dùng chung entity, view, thao tác khoá sản phẩm và tính lại điểm sản phẩm (`lockProduct`, `refreshProductRating`).

## 2. Mục tiêu & ngoài phạm vi

- Bốn cell `public/`, `authoring/`, `vote/`, `moderation/` + `shared/`; mỗi service và controller chỉ phục vụ một cell, không cell nào import cell khác.
- **Không đổi hành vi**: route (kể cả `@RateLimit('upload')` của upload ảnh), quyền, response, transaction, thứ tự khoá (đánh giá → sản phẩm), mã lỗi. Code di chuyển nguyên văn; `lockProduct`, `refreshProductRating`, `getWithProduct` thành hàm ở `shared/` nhận `EntityManager`/repository.
- Ngoài phạm vi: đổi luật đánh giá.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Bốn cell, hàm dùng chung ở `shared/` | Mỗi cell một nhóm chức năng, không có cạnh cell → cell | Nhiều file nhỏ (cell vote chỉ một service) |
| B. Hai cell (khách / admin) | Ít file | Khách gộp xem, viết, bình chọn: vẫn nhiều lý do để đổi |

**Chọn A** theo yêu cầu "chia nhỏ tới mức tế bào".

### 3.2 Kiến trúc & ranh giới

```
review/
  shared/      review.entity, review-vote.entity, review.constant, review-eligibility.util, review-view.util,
               review-rating.util (lockProduct, refreshProductRating), review-lookup.util (findReviewWithProduct),
               review-sql.constant (HAS_IMAGES_SQL, NO_IMAGES_SQL), review.test-utils
  public/      ReviewPublicQueryService (findByProductId, getSummary), ReviewPublicController, dtos/public-review-query
  authoring/   ReviewAuthoringService (create, update, uploadImage), ReviewAuthoringQueryService (findMine, findPending, findOneOwn),
               ReviewAuthoringController (POST images, POST, PATCH), MyReviewController (GET mine, pending),
               dtos/create-review, update-review, my-review-query, my-pending-review-query
  vote/        ReviewVoteService (vote, unvote, findMyVotes), ReviewVoteController (helpful), MyReviewVotesController (GET votes),
               dtos/my-review-votes-query
  moderation/  ReviewModerationService (hide, publish, reply, removeReply), ReviewModerationQueryService (findAllAdmin, findOneAdmin,
               countAwaitingReply), AdminReviewController, dtos/admin-review-query, hide-review, reply-review
```
- `ReviewModule` export `ReviewModerationQueryService` (`PendingCountService.countAwaitingReply`).
- Prefix route giữ nguyên (`api/reviews`, `api/my-reviews`, `api/admin/reviews`) ở nhiều controller; snapshot route–quyền không đổi.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Package by feature (cell) | `review/*` | Tìm file theo chức năng | Thao tác khoá/tính điểm dùng chung ở `shared/` |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Viết, bình chọn, kiểm duyệt, xem công khai tách lý do đổi |
| I | ✔ | `PendingCountService` chỉ nhận `ReviewModerationQueryService` |
| O / L / D | n.a. | |

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Không đổi.

## 4. Kế hoạch test

`review.service.spec.ts` tách theo cell (mỗi test về đúng cell của nó; các test đang trộn nhiều cell, như "bình chọn và phản hồi không đổi điểm sản phẩm", tách thành hai test mỗi cell một test); fixture và `buildReviewTestKit` ở `shared/review.test-utils.ts`, helper dựng service ở từng cell. Số ca không đổi. Flow, snapshot route, test kiến trúc cell giữ nguyên.

## 5. Rủi ro & rollback

Luồng khoá sản phẩm/tính điểm nằm trong phần di chuyển. Giảm thiểu: nguyên văn, đối chiếu từng dòng, toàn bộ flow review chạy lại, phá thử. Rollback: `git revert`.

## 6. Kết quả triển khai

- **File:** 21 file di chuyển bằng công cụ viết lại import; `ReviewService`/`ReviewQueryService` tách thành 3 service ghi/vote/kiểm duyệt và 3 service đọc; 3 controller cũ tách thành 6; mới ở `shared/`: `review-rating.util.ts`, `review-lookup.util.ts`, `review-sql.constant.ts`, `review.test-utils.ts`; helper dựng service ở từng cell (`authoring.test-utils.ts`, `vote.test-utils.ts`, `moderation.test-utils.ts`, `public.test-utils.ts`).
- **Kiểm chứng di chuyển nguyên văn:** so mọi dòng hai service và ba controller cũ với các file mới: chỉ khác tên class, constructor, `this.lockProduct/refreshProductRating/getWithProduct` → hàm ở `shared/`.
- **Khác thiết kế:** ba test trộn nhiều cell phải tách mỗi cell một test: "hasImages lọc danh sách công khai và admin" (public / moderation), "bình chọn và phản hồi không đổi điểm sản phẩm" (vote / moderation), "danh sách của tôi và admin cùng dạng tóm tắt sản phẩm" (authoring / moderation), nên unit tăng 842 → 845.
- **Kiểm chứng:** `tsc`, biome, 845 unit, 883 flow (snapshot route–quyền không đổi), độ phủ 98/98 và 82/82.
- **Docs:** `review.md` (3, 4.6, 4.7, 4.9), `pending-count.md`, `common.md`, `test/README.md`.
