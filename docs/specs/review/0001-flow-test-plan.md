# 0001 — Kế hoạch flow test cho module review

> Module: `review` · Trạng thái: Approved · Ngày: 2026-10-23 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Chiến dịch test toàn diện (`test/PROGRESS.md`, skill `test-campaign`) phủ ca thành công và ca lỗi cho từng route. Module review có 16 route (batch 09–12), chạm điểm trung bình của sản phẩm, vote đồng thời, ảnh trên storage và kiểm duyệt. Trước batch 09 chỉ có unit test với DB giả; các QueryBuilder và thao tác đồng thời chưa có test tự động.

## 2. Mục tiêu & ngoài phạm vi

Mỗi route review có ≥ 1 ca thành công và ≥ 1 ca lỗi nghiệp vụ trên Postgres thật (route không có ca lỗi nghiệp vụ ghi `exempt`). Ngoài phạm vi: đổi hành vi.

## 3. Thiết kế (batch)

3.3/3.4: không thêm pattern. Dùng Test Data Builder cho đánh giá kiểu seed (`b.review()`); `flows/review/steps.ts` gom cấu hình storage giả và ảnh `REVIEW` của user.

| Batch | Route | Flow |
|---|---|---|
| 09 | `POST /api/reviews`, `GET /api/reviews/:productId`, `GET /api/reviews/:productId/summary`, `PATCH /api/reviews/:reviewId`, `DELETE /api/reviews/:reviewId/helpful` | `test/flows/review/review.flow.ts` |
| 10 | `POST /api/reviews/:reviewId/helpful`, `POST /api/reviews/images`, `GET /api/my-reviews`, `/pending`, `/votes` | `test/flows/review/review-customer.flow.ts` |
| 11 | `GET /api/admin/reviews`, `GET /api/admin/reviews/:reviewId`, `POST .../hide`, `POST .../publish`, `DELETE .../reply` | _(chưa làm)_ |
| 12 | `PUT /api/admin/reviews/:reviewId/reply` | _(chưa làm)_ |

## 4. Kế hoạch test

Theo skill `test-campaign`; phá thử các điểm tính điểm sản phẩm, sở hữu, trạng thái và vote.

## 5. Rủi ro & rollback

`git revert` commit của batch.

## 6. Kết quả triển khai

- **Batch 10:** 33 flow test; storage giả bằng `jest.spyOn(globalThis, 'fetch')`. Phá thử 14 điểm (vote: tự vote, trùng, khoá dòng, đếm lại; `my-reviews`; `pending`: đã đánh giá, thanh toán, hạn; `votes`: người, sản phẩm; upload: giới hạn, người, cửa sổ 24 giờ, magic bytes) đều bị bắt sau khi bổ sung ca đơn đã giao nhưng chưa trả.
- **Batch 09:** 56 flow test. Phá thử 11 điểm đều bị bắt. `GET /api/reviews/:productId/summary` không có ca lỗi nghiệp vụ (`exempt`).
