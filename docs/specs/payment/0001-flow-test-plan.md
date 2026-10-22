# 0001 — Kế hoạch flow test cho module payment

> Module: `payment` · Trạng thái: Approved (đang thực hiện: batch 01 xong, còn 02 và 03) · Ngày: 2026-10-22 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Chiến dịch test toàn diện (`test/PROGRESS.md`, skill `test-campaign`) phủ ca thành công và ca lỗi cho từng route. Module payment có 12 route (batch 01–03). Trước chiến dịch mới có luồng thanh toán–hoàn tiền chính; nhiều nhánh (trạng thái phiên, kết quả đối soát webhook, tra cứu admin) chỉ có unit test dùng manager giả.

## 2. Mục tiêu & ngoài phạm vi

- Mỗi route payment có ≥ 1 ca thành công và ≥ 1 ca lỗi nghiệp vụ trên Postgres thật, ma trận auth/quyền đã phủ 401/403.
- Ngoài phạm vi: đổi hành vi của module; test hiệu năng.

## 3. Thiết kế (batch)

| Batch | Route | Flow |
|---|---|---|
| 01 (xong) | `GET /api/payments/:orderId/status`, `POST /api/payments/qr`, `POST /api/webhooks/sepay`, `GET /api/admin/payments/attempts`, `GET /api/admin/payments/orders/:orderId` | `test/flows/payment/payment-session.flow.ts`, `payment-admin-queries.flow.ts` |
| 02 | `POST /api/admin/payments/orders/:orderId/confirm`, `POST /api/admin/payments/orders/:orderId/qr`, `GET /api/admin/payments/transactions`, `GET /api/admin/refunds`, `POST /api/admin/refunds` | theo batch |
| 03 | `POST /api/admin/refunds/:refundId/complete`, `POST /api/admin/refunds/:refundId/reject` | theo batch |

3.3/3.4: không thêm pattern; flow dùng builder, steps và helper ký webhook sẵn có.

## 4. Kế hoạch test

Mỗi batch: danh mục ca theo loại route (skill `test-campaign`), phá thử các điểm trọng yếu để chắc test bắt được lỗi, `yarn test:coverage:update` để baseline co lại.

## 5. Rủi ro & rollback

Test phát hiện hành vi nghi là lỗi: ghi vào "Phát hiện" của PROGRESS, không sửa code lặng lẽ. Rollback: `git revert` commit của batch.

## 6. Kết quả triển khai

- **Batch 01:** 31 flow test, 5/5 route đủ ca thành công và ca lỗi; độ phủ toàn cục 14 → 16/98 thành công, 13 → 16/96 lỗi. Hai đột biến không bị bắt ngay đã được phân tích: một đột biến tương đương (nhánh SQL dự phòng), một lỗ hổng test đã bịt (kiểm tài khoản nhận hai lớp).
- Batch 02 và 03: chưa làm.
