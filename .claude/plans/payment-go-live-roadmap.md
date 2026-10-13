# Lộ trình thanh toán: từ "chạy được" tới "mở bán an toàn"

> Dành cho chủ dự án (người chưa quen mảng thanh toán). Cập nhật: 2026-10-13.
> Đây là kế hoạch và danh sách kiểm tra, không phải tài liệu kỹ thuật (tài liệu kỹ thuật nằm ở `docs/modules/`).

## 1. Ba khái niệm cần nhớ

| Khái niệm | Trả lời câu hỏi | Giá trị | Nằm ở |
|---|---|---|---|
| **Trạng thái thanh toán** của đơn | Khách đã trả chưa? | `unpaid`, `paid` (sau này thêm `refunded`) | `orders.payment_status` |
| **Trạng thái xử lý** của đơn | Cửa hàng làm tới đâu? | `pending` (chờ xác nhận) → `confirmed` → `shipping` → `delivered` → `completed`; hoặc `cancelled` | `orders.status` |
| **Mã chuyển khoản** (phiên QR) | Mã nào đã cấp cho khách, còn hiệu lực không? | `PENDING`, `PAID`, `EXPIRED`, `CANCELLED` | `payment_attempts` |

Quy tắc vàng: **hai trạng thái của đơn là hai trục riêng.** Khi khách trả tiền thành công, hệ thống tự đặt `paid` và đưa đơn `pending` sang `confirmed`. Các bước giao hàng còn lại do admin bấm.

Mỗi lần khách tạo lại QR sẽ có **mã mới**; mã cũ vẫn được giữ để biết khách có thể đã chuyển theo mã nào. Mỗi mã chỉ chỉ ra đúng một đơn.

## 2. Hiện đã có (đã kiểm tra bằng test và chạy thật trên Postgres thử)

- Tạo QR từ đơn, số tiền lấy từ DB (khách không gửi được số tiền); hết hạn sau 30 phút.
- Webhook SePay: kiểm tra chữ ký trên nội dung gốc, chống gửi trùng, chống tấn công phát lại, khớp đơn theo mã chuyển khoản, kiểm tra số tiền và tài khoản nhận, ghi lại mọi giao dịch (kể cả không khớp) để đối soát.
- Đã trả thì đơn tự chuyển `confirmed`; khách không tự huỷ được đơn đã trả.
- Mã chuyển khoản hết hạn tự được đánh dấu `EXPIRED` trong DB mỗi phút; huỷ đơn thì mã chờ thành `CANCELLED`.
- Admin: tra nội dung chuyển khoản → thấy đơn, khách, trạng thái, giao dịch; danh sách giao dịch cần đối soát; xác nhận thủ công đúng mã khi webhook không tới (có ghi người xác nhận, lúc nào, lý do).
- Khách xem lại mọi mã đã cấp của đơn mình (kể cả hết hạn), kèm mã giao dịch khi đã trả.
- Phí ship và chính sách đổi trả cấu hình được trên admin; báo giá trước khi đặt kèm số VND.

## 3. Việc cần làm, theo thứ tự ưu tiên

### A. Bắt buộc trước khi mở bán (chưa thoả)

| # | Việc | Vì sao | Ai làm |
|---|---|---|---|
| A1 | Deploy backend có bản mới nhất và chạy `yarn migration:run` (4 migration thanh toán, `ConfirmPaidPendingOrders` mới nhất) | Code mới cần schema mới | Bạn |
| A2 | Đặt đủ biến môi trường thanh toán trên môi trường deploy (7 biến) và restart | Thiếu thì tạo QR trả 503 | Bạn |
| A3 | Trên dashboard SePay: URL webhook phải trỏ **thẳng vào backend** (không phải trang web), đúng secret, tiền tố `DH`, "chỉ gửi khi có mã thanh toán" | Hiện URL `doovan.vn` trả trang 404 của FE nên webhook chưa bao giờ tới backend | Bạn |
| A4 | Kiểm tra bằng lệnh `curl -X POST <url webhook> -d '{}'` phải ra lỗi 401 dạng JSON `PAYMENT_INVALID_SIGNATURE` | Xác nhận request đã tới đúng backend | Bạn |
| A5 | Chuyển khoản **một giao dịch thật nhỏ** và xem trọn vòng: webhook tới, đơn `paid` và `confirmed`, khách thấy trang thành công | Chưa có webhook thật nào từng chạy trọn vòng | Bạn (tôi hỗ trợ đọc log) |
| A6 | Thử gửi lại webhook từ dashboard SePay (retry) sau ít nhất 5 phút | Chưa biết SePay có ký lại timestamp khi gửi lại; nếu không, lần gửi lại muộn sẽ bị từ chối | Bạn |
| A7 | Tách DB thử nghiệm và DB thật; dọn dữ liệu test (đơn 0.52, 3 phiên thử...) | Tránh lẫn dữ liệu thử vào sổ sách thật | Bạn (tôi viết script khi bạn cho phép) |
| A8 | Sửa dữ liệu thử: đơn `zAwdO9GeCxt8Dm3y` đang ghi sai mã được trả (`DHS75TYVN3` thay vì `DHG29JR5A8`) và `provider` của dòng giao dịch | Dữ liệu sai làm sai báo cáo | Tôi, khi bạn đồng ý |
| A9 | Xoá các biến cũ `SEPAY_ENV`, `SEPAY_MERCHANT_ID`, `SEPAY_SECRET_KEY` trong `.env` và trên môi trường deploy | Tránh nhầm với secret của webhook | Bạn |
| A10 | FE hoàn thành: trang QR (poll trạng thái), màn admin (tra mã, xác nhận, đối soát) | Không có màn thì không dùng được các tính năng admin | FE |

### B. Nên có ngay sau khi mở bán (vài ngày đầu)

| # | Việc | Ghi chú |
|---|---|---|
| B1 | **Thói quen đối soát hằng ngày** (xem mục 4) | Mỗi ngày mở màn đối soát, lọc các giao dịch `LATE`, `UNMATCHED`, `AMOUNT_MISMATCH`; so với sao kê ngân hàng |
| B2 | Cảnh báo khi có giao dịch không khớp (email hoặc Slack cho admin) | Hiện bạn phải tự mở màn để thấy |
| B3 | Giám sát lỗi và log trên máy chủ (Render logs hoặc Sentry) | Bắt kịp khi webhook trả lỗi 500 liên tục |
| B4 | Sao lưu DB định kỳ (Supabase có sẵn, kiểm tra đã bật) | Mất bảng giao dịch là mất bằng chứng tiền |
| B5 | Bật "cảnh báo webhook thất bại" trên SePay | SePay báo ngay khi backend không nhận được |

### C. Làm khi thật sự cần (nghĩ sau)

| # | Việc | Khi nào cần |
|---|---|---|
| C1 | Trạng thái `refunded` và luồng hoàn tiền | Khi có đơn phải huỷ sau khi đã trả (hiện admin huỷ được đơn đã trả nhưng hoàn tiền làm tay bên ngoài hệ thống) |
| C2 | Tự kéo giao dịch từ API của SePay để đối soát tự động | Khi số đơn nhiều, không muốn so sao kê bằng tay |
| C3 | Giữ tồn kho khi tạo đơn | Hiện không có tồn kho; hai khách có thể mua cùng một món cuối cùng |
| C4 | Email xác nhận thanh toán cho khách | Khi muốn khách biết ngay mà không cần ở trang QR |
| C5 | Hết hạn đơn chưa trả (tự huỷ đơn `unpaid` sau X giờ) | Khi nhiều đơn bỏ dở làm rối danh sách |
| C6 | Gộp `delivered` và `completed` nếu thấy thừa | Chỉ khi vận hành thấy không dùng |

## 4. Quy trình hằng ngày khi "khách nói đã chuyển tiền nhưng đơn chưa cập nhật"

1. Hỏi khách **nội dung chuyển khoản** (hoặc ảnh chụp). Dạng `DHG29JR5A8`.
2. Mở sao kê SePay hoặc ngân hàng: có khoản tiền vào với nội dung đó không, đúng số tiền không?
3. Admin → màn **Tra nội dung chuyển khoản** → gõ mã. Xem mã thuộc đơn nào, trạng thái gì (`EXPIRED`, `PENDING`...), đã có giao dịch gắn chưa.
4. Nếu **có tiền thật** và đơn chưa `paid`: bấm **Xác nhận đã thanh toán**, nhập số tiền thực nhận và ghi chú (vd "Đối chiếu sao kê VCB lúc 14:05, SePay lỗi webhook"). Nếu biết ID giao dịch SePay, nhập thêm để lần gửi lại webhook không bị báo trùng.
5. Nếu **không thấy tiền**: không xác nhận; hướng dẫn khách gửi lại sao kê.
6. Nếu số tiền lệch: xác nhận cần chọn rõ "chấp nhận lệch" và ghi lý do.

## 5. Sai thường gặp (đừng làm)

- Đừng đổi tay `payment_status` hay `status` trong DB: dùng nút xác nhận để có dấu vết.
- Đừng xoá mã chuyển khoản hay giao dịch cũ, kể cả dữ liệu thử trên DB thật nếu chưa tách môi trường.
- Đừng đổi `PAYMENT_TRANSFER_PREFIX` hoặc tài khoản nhận khi còn đơn đang chờ trả (mã cũ sẽ không khớp).
- Đừng đưa secret webhook vào FE hay log.

## 6. Điều kiện coi là "xong, mở bán được"

Tất cả A1 → A10 đã tick, đã có ít nhất một giao dịch thật chạy trọn vòng và một lần xác nhận thủ công thử, và bạn đã thử quy trình ở mục 4 một lần.
