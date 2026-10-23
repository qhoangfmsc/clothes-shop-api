# 0006 — Ranh giới ghi giữa các module (Order, Return, Product, Cart)

> Module: `common` (kiến trúc; chạm payment, return, review, order nếu được duyệt) · Trạng thái: Draft · Ngày: 2026-10-23

## 1. Bối cảnh & vấn đề

Đã đọc code các module (sau khi chiến dịch test phủ 98/98 route) và đo bằng script mọi chỗ **service/util của một module dùng entity của module khác** (không tính entity `User`, spec và file `*.module.ts`). Kết quả:

| Module dùng | Entity của module khác | Đọc | **Ghi** | Nơi ghi |
|---|---|---|---|---|
| payment | `Order`, `OrderItem` (order) | 19 | 3 | `payment-paid.util.ts:13-14` (`applyOrderPaid`: `paymentStatus='paid'`, `status 'pending'→'confirmed'`), `refund.service.ts:238` (`paymentStatus='refunded'`) |
| payment | `ReturnRequest`, `ReturnRequestItem` (return) | 5 | 2 | `refund.service.ts:241` (`RECEIVED→REFUNDED`), `refund.service.ts:269-275` (`RECEIVED→APPROVED`, xoá `acceptedQuantity`) |
| review | `Product` (product) | 3 | 1 | `review.service.ts:539` (`rating_average`, `rating_count`) |
| order | `CartItem`, `Cart` (cart), `Address` (address) | 4 | 1 | `order-checkout.service.ts:116` (xoá dòng giỏ đã đặt) |
| return | `Order`, `OrderItem` (order), `Refund` (payment) | 12 | 0 | — |
| cart, collection, wishlist, review | `Product` (product) | 14 | 0 | — |
| product | `Category`, `SubCategory` (category) | 8 | 0 | — |

Hai loại phụ thuộc khác nhau về rủi ro:

- **Đọc**: một module truy vấn bảng của module kia để dựng dữ liệu của mình (giỏ cần giá sản phẩm, trả hàng cần dòng đơn). Mỗi lần đổi cột của bảng đó, người sửa phải tìm các chỗ đọc rải rác; không làm sai dữ liệu.
- **Ghi (4 nhóm trên)**: module A đổi trạng thái thuộc vòng đời của module B. Quy tắc chuyển trạng thái (ai được chuyển từ đâu sang đâu, hiệu ứng phụ nào đi kèm) nằm ở nơi không phải chủ của nó. Ví dụ: `ReturnRequest` có state machine `REQUESTED → APPROVED → RECEIVED → REFUNDED` (chủ: return) nhưng hai bước `RECEIVED → REFUNDED` và `RECEIVED → APPROVED` được viết trong `RefundService` (payment); thêm một trạng thái trả hàng phải sửa cả hai module. Test chiến dịch cũng cho thấy hai luồng này đúng nhưng phụ thuộc vào việc người sửa nhớ cập nhật cả hai nơi.

Hiện luật kiến trúc (`architecture.spec.ts`) chỉ cấm vòng giữa các module Nest và `forwardRef`; không đo việc ghi chéo module, nên không có gì ngăn chỗ ghi thứ năm xuất hiện.

## 2. Mục tiêu & ngoài phạm vi

**Mục tiêu**
- Mỗi chuyển trạng thái của một bảng được viết **một chỗ**, ở module chủ bảng đó.
- Một luật máy kiểm chặn việc ghi chéo module mới (allowlist chỉ co lại, như các luật hiện có).
- Không đổi hành vi quan sát được: cùng API, cùng thứ tự khoá (`orders` → bản ghi con), cùng transaction (một `EntityManager` truyền qua), cùng mã lỗi.

**Ngoài phạm vi**
- Việc **đọc** chéo module (14 + 12 + 8… chỗ ở bảng trên): chấp nhận, ghi trong docs là phụ thuộc đọc có chủ đích. Gom đọc vào facade/query-service cho mọi cặp module là phình to code mà không giảm rủi ro dữ liệu.
- Tách payment/return/order thành service độc lập, đổi schema, đổi API.
- Domain event / message bus: các luồng này là tiền và trạng thái đơn, cần nguyên tử trong một transaction (xem `engineering-principles.md` mục 1, "Eventual consistency").

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Chỉ ghi nhận + luật máy** (allowlist 4 nhóm ghi hiện có, cấm ghi mới; không đổi code chạy) | Rẻ, không chạm luồng tiền; chặn được xấu đi | Bốn chỗ ghi sai chủ vẫn còn; state machine vẫn nằm hai nơi |
| **B. Hàm của module chủ nhận `EntityManager`** (`markOrderPaid(manager, …)`, `markReturnRefunded(manager, …)`, `reopenReturnAfterRefundRejected(manager, …)`, `refreshProductRating(manager, …)`, `removeOrderedCartItems(manager, …)`) và gọi từ nơi cần; kèm luật A | State machine về đúng chủ; vẫn một transaction, một thứ tự khoá; đúng mẫu đã có (`refundService.createForReturn(manager, …)`); mỗi hàm nhỏ, test được độc lập | Thêm 5 hàm export; module gọi vẫn import file của module chủ (phụ thuộc còn, nhưng chỉ gọi hàm có tên nghiệp vụ, không biết cột) |
| C. Cổng (port) do module gọi định nghĩa, module chủ cài đặt (`REFUND_OUTCOME_HANDLERS`) | Payment không biết return; đảo chiều phụ thuộc | Một implementation duy nhất hiện nay (luật: Strategy/port chỉ khi ≥ 2 implementation); thêm provider token, multi-provider; khó đọc hơn nhiều so với lợi ích |
| D. Domain event (`EventEmitter`) | Tách rời hoàn toàn | Không nguyên tử với tiền/trạng thái; lỗi nuốt im lặng; thứ tự khoá không còn kiểm soát — bị luật chặn |
| E. Gộp payment + return thành một module | Hết ghi chéo ở cặp này | Module quá lớn (đã có 6 dependency ở `PaymentService`), đảo ngược hướng tách đã làm |

**Đề xuất chọn B kèm luật của A** vì giải đúng vấn đề đo được (4 chỗ ghi sai chủ) với đổi code nhỏ, giữ nguyên transaction và thứ tự khoá, và có sẵn lưới an toàn: 832 flow test (đặc biệt `lock-contract`, `payment-refund-actions`, `return-admin`, `order-checkout`, `review`) phủ cả bốn luồng. C/D/E bị loại vì cái giá lớn hơn lợi ích hiện tại.

### 3.2 Kiến trúc & ranh giới (theo B)

```
 payment ──markOrderPaid / markOrderRefunded──► order      (order/order-payment-state.util.ts)
 payment ──markReturnRefunded / reopenReturn──► return     (return/return-refund-state.util.ts)
 review  ──refreshProductRating──────────────► product     (product/product-rating.util.ts)
 order   ──removeOrderedCartItems────────────► cart        (cart/cart-checkout.util.ts)
```

- Hàm là **hàm thuần có `EntityManager`** trong file `*.util.ts` của module chủ (không thêm provider, không thêm module import mới ngoài những cái đã có), cùng kiểu `applyOrderPaid` hiện tại; chỉ đổi **vị trí** (về module chủ) và **tên** (nghiệp vụ, không nêu cột).
- Hướng phụ thuộc không đổi so với hôm nay (payment→order, payment→return, review→product, order→cart đã tồn tại ở mức import file/entity); không tạo vòng module Nest mới. `return → payment` (qua `RefundService`) và `payment → return` (qua hàm trạng thái) vẫn là hai chiều ở mức file; luật hiện tại chỉ xét vòng module Nest nên vẫn đạt, và đây là điểm ghi nhận ở 3.4.
- Luật máy mới (trong `architecture.spec.ts`): với mỗi cặp (module A dùng entity của module B) đo các lời gọi `.update/.save/.delete/.insert/.remove` lên entity đó trong `src/modules/A/**` (bỏ spec); allowlist ban đầu = 0 sau khi làm B (hoặc 4 mục nếu chỉ làm A), chỉ được co lại.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Giải quyết vấn đề gì | Cái giá phải trả |
|---|---|---|---|
| Hàm tiện ích một điểm đổi (như `findLocked`) | 5 hàm state ở module chủ | Mỗi chuyển trạng thái được định nghĩa một chỗ, ở chủ vòng đời | Thêm 5 hàm export; người đọc luồng thanh toán phải nhảy sang module khác |
| Unit of Work (đã có) | `EntityManager` truyền vào từng hàm | Giữ cùng một transaction và thứ tự khoá | Không đổi |
| Không dùng port/event | — | Tránh phình to khi chưa có implementation thứ hai | Phụ thuộc file còn nguyên (ghi ở 3.4 mục D) |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S — một lý do để đổi | ✔ (sau B) | Hôm nay `RefundService` đổi khi đổi quy tắc hoàn tiền **và** khi đổi vòng đời trả hàng; sau B chỉ còn lý do thứ nhất |
| O — mở rộng không sửa code cũ | ✔ (sau B) | Thêm trạng thái trả hàng chỉ sửa module return |
| L — thay thế được | n.a. | Không có kế thừa |
| I — interface nhỏ | ✔ | Mỗi hàm nhận `manager` và id, không nhận cả entity |
| D — phụ thuộc abstraction | ✘ chấp nhận | Payment vẫn phụ thuộc hàm cụ thể của return/order. Chấp nhận vì chỉ có một implementation; xem lại khi có consumer thứ hai (sẽ cân nhắc phương án C) |

### 3.5 Dữ liệu

Không đổi (không migration, không cột mới).

### 3.6 API / contract

Không đổi.

### 3.7 Luồng xử lý, transaction, lock

Không đổi: mỗi hàm chạy trong transaction của người gọi, sau khi người gọi đã khoá theo thứ tự `orders` → bản ghi con. Hàm không tự mở transaction, không tự khoá (giống `applyOrderPaid`); điều kiện chuyển trạng thái được giữ trong mệnh đề `WHERE` như hiện nay (vd `UPDATE … WHERE id = $1 AND status = 'RECEIVED'`) để thao tác lặp là no-op.

### 3.8 Lỗi & trường hợp biên

| Tình huống | Hành vi mong đợi |
|---|---|
| Hoàn tiền xong cho yêu cầu trả hàng không còn `RECEIVED` (vd đã `REFUNDED`) | Không đổi gì (như hôm nay: `WHERE status = 'RECEIVED'`) |
| Khoản hoàn bị từ chối, yêu cầu trả hàng về `APPROVED` | `receivedAt = null`, `shippingRefunded = false`, `acceptedQuantity = null` ở mọi dòng — như hôm nay |
| `markOrderPaid` gọi khi đơn không còn `pending` | Chỉ đặt `paymentStatus`/`paidAt`, giữ `status` — như `applyOrderPaid` hôm nay |

## 4. Kế hoạch test

| Tầng | Case | Vị trí file |
|---|---|---|
| Flow (có sẵn, phải giữ xanh) | Toàn bộ thanh toán, hoàn tiền, trả hàng, đánh giá, checkout | `test/flows/order-payment/*`, `payment/*`, `return/*`, `review/*`, `order/*` |
| Unit | Từng hàm state: WHERE đúng, idempotent | cạnh file `*.util.ts` mới |
| Kiến trúc | Luật "không ghi chéo module" + allowlist co lại; hiện 4 nhóm → 0 | `src/common/architecture/architecture.spec.ts` |
| Phá thử | Bỏ điều kiện `status = 'RECEIVED'` trong `markReturnRefunded`, bỏ xoá `acceptedQuantity`, bỏ `status 'pending'` trong `markOrderPaid` | thủ công, khôi phục sau khi thấy đỏ |

## 5. Rủi ro & rollback

- Luồng tiền: chỉ **di chuyển** câu lệnh, không đổi nội dung; rủi ro là sai thứ tự gọi hoặc quên một hiệu ứng phụ. Giảm bằng cách làm từng nhóm một commit riêng, chạy lại toàn bộ flow sau mỗi nhóm và phá thử như bảng trên.
- Rollback: `git revert` từng commit; không có thay đổi dữ liệu.

## 6. Kết quả triển khai

_Chưa triển khai — chờ quyết định._

**Cần người dùng quyết định**

1. Chọn phương án: **B + luật** (đề xuất), **A** (chỉ ghi nhận + luật), hay giữ nguyên.
2. Nếu chọn B: làm cả 4 nhóm hay chỉ nhóm `payment → return` (vòng đời trả hàng, rủi ro thay đổi cao nhất) trước.
