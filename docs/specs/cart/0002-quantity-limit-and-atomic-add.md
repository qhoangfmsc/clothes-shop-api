# 0002 — Giới hạn số lượng một dòng giỏ có mã lỗi rõ ràng, cộng dồn nguyên tử

> Module: `cart` · Trạng thái: Approved · Ngày: 2026-10-23 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Test (batch 08) lộ hai lỗi ở `POST /api/cart/items`:

1. Thêm cùng sản phẩm/size/màu khi dòng đã có 99 cái: tổng 100 vi phạm `CK_cart_items_quantity_max` ở DB → **500**. DTO chỉ chặn `quantity` 1–99 của *một lần gọi*, không chặn tổng.
2. Cộng dồn là "đọc rồi ghi" (`existing.quantity += n; save`): hai request đồng thời cùng đọc `q` rồi cùng ghi `q + n` → **mất một lần cộng** (lost update), và lần đầu thêm đồng thời còn vi phạm `UQ_carts_user` / `UQ_cart_items_unique` → 500 (spec common/0008).

Cách các sàn làm (Amazon, Shopify): khi vượt mức tối đa cho một dòng thì **không thêm và báo rõ đã đạt giới hạn** (Shopify trả lỗi nêu số tối đa); không âm thầm kẹp số lượng, vì người mua sẽ không biết đơn của mình khác ý định. Chủ dự án chọn đúng hướng này.

## 2. Mục tiêu & ngoài phạm vi

- Tổng số lượng một dòng > 99 → lỗi nghiệp vụ `CART_QUANTITY_LIMIT (2004)`, HTTP 400, message nêu giới hạn; giỏ **không đổi**.
- Cộng dồn nguyên tử trong một câu `UPDATE … SET quantity = quantity + n WHERE … AND quantity + n <= 99`: đồng thời không mất lần cộng và không vượt 99.
- Tạo giỏ/dòng đồng thời không còn 500 (đọc lại khi thua cuộc đua).
- Hằng số 99 có một nguồn (`CART_MAX_ITEM_QUANTITY`) cho DTO và service.
- Ngoài phạm vi: giới hạn số dòng trong giỏ; kẹp số lượng; đổi `PATCH /api/cart/items/:itemId` (đã chặn 1–99 bằng DTO, đặt tuyệt đối).

## 3. Thiết kế

### 3.3 Design pattern

| Pattern | Dùng ở | Giải quyết vấn đề gì | Cái giá phải trả |
|---|---|---|---|
| Cập nhật nguyên tử có điều kiện (compare-and-swap bằng SQL) | `CartService.addItem` | Lost update + trần 99 trong một câu | Một truy vấn `UPDATE` bằng QueryBuilder thay cho `save` |
| Idempotency (đọc lại sau khi thua) | `getOrCreateCart`, tạo dòng | Đua tạo `carts`/`cart_items` | Một vòng thử lại tối đa một lần |

### 3.4 SOLID

S ✔ (service chỉ điều phối), O ✔ (hằng số một chỗ), L/I/D n.a.

### Luồng `addItem(userId, dto)`

1. Lấy/tạo giỏ (thua cuộc đua `UQ_carts_user` → đọc lại).
2. Kiểm sản phẩm (không đổi: 1001 / 2003 / 1303).
3. `UPDATE cart_items SET quantity = quantity + n WHERE cart_id, product_id, size, color AND quantity + n <= 99`. Có dòng bị đổi → xong.
4. Không dòng nào bị đổi: nếu dòng đã tồn tại → `CART_QUANTITY_LIMIT`; nếu chưa → `INSERT` dòng mới (n ≤ 99 do DTO); thua `UQ_cart_items_unique` → quay lại bước 3 (tối đa một lần).

### Lỗi & biên

| Tình huống | Hành vi |
|---|---|
| 98 + 1 | 201, 99 |
| 99 + 1; 50 + 50 | 400 / 2004, giữ nguyên |
| 60 + 60 đồng thời | một 201 (60 hoặc 120 không bao giờ xuất hiện): kết quả hợp lệ duy nhất là một thành công và một 2004 |
| 3 request thêm 1 đồng thời, dòng chưa có | cả ba 201, số lượng 3 |

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Flow | các dòng ở bảng biên; số lượng không đổi khi báo lỗi; size/màu khác không bị tính chung; thêm đồng thời cộng đúng; `PATCH` vẫn đặt tuyệt đối | `test/flows/cart/cart.flow.ts` |
| Phá thử | bỏ điều kiện `<= 99`; quay lại đọc-rồi-ghi | thủ công |

## 5. Rủi ro & rollback

Thấp; không đổi schema. Rollback: `git revert`.

## 6. Kết quả triển khai

_Điền sau khi làm xong._
