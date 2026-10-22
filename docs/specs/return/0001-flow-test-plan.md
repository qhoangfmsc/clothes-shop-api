# 0001 — Kế hoạch flow test cho module return

> Module: `return` · Trạng thái: Implemented · Ngày: 2026-10-22 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Chiến dịch test toàn diện (`test/PROGRESS.md`, skill `test-campaign`) phủ ca thành công và ca lỗi cho từng route. Module return có 10 route (batch 06–07) và là nơi tiền và trạng thái gặp nhau: nhận hàng tạo khoản hoàn theo tỷ lệ, khoản hoàn xong hoặc bị từ chối lại đổi trạng thái yêu cầu trả hàng (module payment). Trước batch 06 chỉ có unit test với manager giả.

## 2. Mục tiêu & ngoài phạm vi

Mỗi route return có ≥ 1 ca thành công và ≥ 1 ca lỗi nghiệp vụ trên Postgres thật, kể cả liên kết hai chiều với khoản hoàn. Ngoài phạm vi: đổi hành vi.

## 3. Thiết kế (batch)

3.3/3.4: không thêm pattern; `test/flows/return/steps.ts` gom cách dựng "đơn đã trả và đã giao" và "khách xin trả" (lặp quá ba lần).

| Batch | Route | Flow |
|---|---|---|
| 06 | `GET /api/returns`, `POST /api/returns`, `GET /api/returns/:returnId`, `PATCH /api/returns/:returnId/cancel`, `GET /api/returns/eligibility/:orderId` | `test/flows/return/return-customer.flow.ts` |
| 07 | `GET /api/admin/returns`, `GET /api/admin/returns/:returnId`, `POST /api/admin/returns/:returnId/approve`, `/receive`, `/reject` | `test/flows/return/return-admin.flow.ts` |

## 4. Kế hoạch test

Theo skill `test-campaign`. Phá thử các điểm tiền, trạng thái và khoá; điểm sống sót thì bịt bằng ca mới.

## 5. Rủi ro & rollback

`git revert` commit của batch.

## 6. Kết quả triển khai

- **Batch 06:** 24 flow test. Phá thử 3 điểm (trần số lượng, sở hữu khi huỷ, sở hữu khi xem chi tiết) đều bị bắt.
- **Batch 07:** 43 flow test. Phá thử 7 điểm: bắt ngay 5 (nhận hàng từ `REQUESTED`, bỏ khoá đơn, khoản hoàn bị từ chối không mở lại yêu cầu, khoản hoàn xong không chuyển `REFUNDED`, số lượng chấp nhận mặc định 0); 2 điểm sống sót lúc đầu rồi đã bịt:
  - `previousValueVnd` bị bỏ qua: tính theo tỷ lệ là tuyến tính nên chỉ khác khi làm tròn và khi tiền ngân hàng nhận khác tổng đơn → thêm ca nhận 300.000đ (143.836 + 143.835).
  - Kiểm phí ship một lần bị bỏ: nhánh "vượt tổng đơn" cũng trả 1805 → thêm assert message.
- **Tổng module:** 10/10 route return có ca thành công và ca lỗi. Độ phủ toàn cục sau batch 07: thành công 31/98, lỗi 36/96, baseline 68 route.
- **Docs:** `return.md` (4.7), `test/README.md`, `test/PROGRESS.md`.
