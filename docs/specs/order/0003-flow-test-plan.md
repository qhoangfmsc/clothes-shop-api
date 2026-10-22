# 0003 — Kế hoạch flow test cho module order

> Module: `order` · Trạng thái: Implemented · Ngày: 2026-10-22 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Chiến dịch test toàn diện (`test/PROGRESS.md`, skill `test-campaign`) phủ ca thành công và ca lỗi cho từng route. Module order có 8 route (batch 04–05). Trước batch 04 đã có flow cho luồng đặt hàng–thanh toán–huỷ, lỗi đơn hàng, chuỗi trạng thái admin, truy vấn, song song và hợp đồng khoá; còn thiếu ca lỗi/validation, báo giá, các biến thể checkout, và sắp xếp/tìm kiếm phía admin.

## 2. Mục tiêu & ngoài phạm vi

Mỗi route order có ≥ 1 ca thành công và ≥ 1 ca lỗi nghiệp vụ trên Postgres thật; ngoài phạm vi: đổi hành vi (quirk `ORDER_NOT_FOUND` trả 400 ở route admin được ghi nhận, không sửa).

## 3. Thiết kế (batch)

3.3/3.4: không thêm pattern.

| Batch | Route | Flow |
|---|---|---|
| 04 | `GET /api/orders`, `POST /api/orders`, `GET /api/orders/:orderId`, `PATCH /api/orders/:orderId/cancel`, `POST /api/orders/quote` | `test/flows/order/order-checkout.flow.ts` (+ các flow order-payment có sẵn) |
| 05 | `GET /api/admin/orders`, `GET /api/admin/orders/:orderId`, `PATCH /api/admin/orders/:orderId/status` | `test/flows/order/order-admin.flow.ts` (+ `order-status`, `order-queries`) |

## 4. Kế hoạch test

Theo skill `test-campaign`; phá thử các điểm tiền và snapshot.

## 5. Rủi ro & rollback

`git revert` commit của batch.

## 6. Kết quả triển khai

- **Batch 04:** 24 flow test; phá thử 5 điểm (ngưỡng miễn ship `>=`, giá không chốt khi đặt, tỷ giá không chốt, dọn cả giỏ thay vì dòng đã đặt, snapshot pickup) đều bị bắt; thêm ca biên đúng ngưỡng miễn ship và thiếu 1 đồng.
- **Batch 05:** 12 flow test; phá thử sắp xếp và tìm kiếm admin đều bị bắt.
- **Tổng module:** 8/8 route order có ca thành công và ca lỗi trên Postgres thật. Độ phủ toàn cục sau batch 05: thành công 21/98, lỗi 26/96, baseline 78 route.
- **Docs:** `order.md` (4.7), `test/README.md`, `test/PROGRESS.md`.
