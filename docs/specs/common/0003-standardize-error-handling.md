# 0003 — Chuẩn hoá lỗi: exception HTTP thô → `throwAppError` + error code

> Module: `common` (error code) + order, cart, address, review, auth · Trạng thái: Implemented · Ngày: 2026-10-22

## 1. Bối cảnh & vấn đề

CLAUDE.md quy định mọi lỗi nghiệp vụ dùng `throwAppError(errorCode, message?, status?)`. Hiện 27 chỗ trong 6 service (`order` 8, `google-auth` 7, `cart` 5, `auth` 4, `address` 2, `review` 1) vẫn ném `NotFoundException`/`BadRequestException`/`UnauthorizedException`. Hệ quả: các lỗi đó không có `errorCode`, nên client không phân biệt được "giỏ trống" với "sản phẩm hết hàng" ngoài việc so chuỗi message; ma trận auth/test cũng không phân biệt được 401 nghiệp vụ với 401 của guard. Allowlist của `architecture.spec.ts` đang ghi các chỗ này (spec common/0002).

Đã đọc: `error-codes.ts` (tiền tố 10–19 và 90 đã dùng), `app.exception.ts`, `exception.filter.ts` (giữ nguyên body của `HttpException`), 6 service, các spec đang `toBeInstanceOf(BadRequestException)` (6 chỗ trong `order.service.spec.ts`), mục Error code trong docs của 5 module. `auth/jwt.strategy.ts` cố ý ném `UnauthorizedException` thô (401 của guard không có `errorCode`) và **nằm ngoài phạm vi**.

## 2. Mục tiêu & ngoài phạm vi

- Mọi lỗi nghiệp vụ trong 6 service đi qua `throwAppError` với mã riêng; allowlist `RAW_HTTP_EXCEPTIONS` về rỗng và luật trở thành tuyệt đối.
- **Giữ nguyên** HTTP status và chuỗi message của từng chỗ.
- Ngoài phạm vi: `jwt.strategy.ts`; đổi status/message; mã lỗi `ORDER_NOT_FOUND` đang trả 400 ở một số chỗ admin (`throwAppError` không truyền 404) — ghi nhận, không sửa ở đây.

## 3. Thiết kế

### 3.1 Phương án

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Mỗi tình huống một mã mới (15 mã), message cũ giữ nguyên | Client phân biệt được từng lỗi; khớp chuẩn dự án | Thêm mã vào `error-codes.ts` |
| B. Dùng chung vài mã chung (`NOT_FOUND`, `BAD_REQUEST`) | Ít mã | Mất ý nghĩa của `errorCode`, trái chuẩn `[MM][EE]` theo module |

**Chọn A**; các lỗi cùng bản chất trong một module dùng chung mã, message riêng truyền vào (vd Google có 7 chỗ nhưng 3 mã).

### 3.5 Hành vi quan sát được thay đổi

| | Trước | Sau |
|---|---|---|
| HTTP status | giữ nguyên | giữ nguyên |
| `message` | giữ nguyên | giữ nguyên |
| `errorCode` | không có | **có** |
| `error` (`"Not Found"`, `"Bad Request"`, `"Unauthorized"`) | có | **bỏ** |

Body từ `{ "statusCode": 404, "message": "Order not found", "error": "Not Found" }` thành `{ "statusCode": 404, "errorCode": 1301, "message": "Order not found" }` (cùng dạng mọi lỗi `throwAppError` khác). Client đang đọc trường `error` sẽ ngừng nhận giá trị đó.

### 3.6 Bảng chuyển đổi (27 chỗ → mã)

Tiền tố mới: cart `20xx` (`ECartErrorCode`), address `21xx` (`EAddressErrorCode`), auth `22xx` (`EAuthErrorCode`). Mã mới in đậm.

| Service:dòng | Hiện tại (status · message) | Mã sau chuyển đổi |
|---|---|---|
| order:94, :288 | 404 · `Order not found` | `ORDER_NOT_FOUND` 1301 (truyền 404) |
| order:143 | 404 · `Address not found` | **`ADDRESS_NOT_FOUND` 2101** (truyền 404) |
| order:238 | 400 · `Some selected cart items do not exist in your cart` | **`ORDER_CART_ITEMS_INVALID` 1308** |
| order:243 | 400 · `Cart is empty` | **`ORDER_CART_EMPTY` 1309** |
| order:250 | 400 · `Some products are no longer available: …` | **`ORDER_PRODUCT_UNAVAILABLE` 1310** (message động) |
| order:291 | 400 · `Only pending orders can be cancelled` | **`ORDER_CANCEL_NOT_ALLOWED` 1311** |
| order:293 | 400 · `Order has already been cancelled` | **`ORDER_ALREADY_CANCELLED` 1312** |
| address:35, :48 | 404 · `Address not found` | `ADDRESS_NOT_FOUND` 2101 |
| cart:111, :124 | 404 · `Cart not found` | **`CART_NOT_FOUND` 2001** |
| cart:114, :127 | 404 · `Cart item not found` | **`CART_ITEM_NOT_FOUND` 2002** |
| cart:78 | 400 · `Product is not available` | **`CART_PRODUCT_UNAVAILABLE` 2003** |
| review:272 | 400 · `Nothing to update` | **`REVIEW_NOTHING_TO_UPDATE` 1909** |
| auth:81 | 401 · `User not found` | **`AUTH_USER_NOT_FOUND` 2201** |
| auth:94, :99, :105 | 401 · `Invalid refresh token` (và `User not found or disabled` bị nuốt) | **`AUTH_REFRESH_TOKEN_INVALID` 2202** |
| auth:99 | 401 · `User not found or disabled` | (không có mã: nhánh không bao giờ lộ ra, xem mục 6) |
| google:36, :47, :94 | 401 · `Invalid Google token…` / `Google user info missing email` | **`AUTH_GOOGLE_TOKEN_INVALID` 2210** (message giữ nguyên từng chỗ) |
| google:72, :75 | 401 · `No token received from Google` / `Failed to exchange authorization code` | **`AUTH_GOOGLE_EXCHANGE_FAILED` 2211** |
| google:89, :105 | 401 · `Failed to fetch Google user info` / `Failed to verify Google access token` | **`AUTH_GOOGLE_VERIFY_FAILED` 2212** |

15 mã mới, mỗi mã có chuỗi mặc định trong `ErrorMessages` trùng message hiện tại.

### 3.3 Design pattern áp dụng

Không thêm pattern: dùng cơ chế lỗi sẵn có (một điểm ném lỗi duy nhất `throwAppError` + bảng mã/ message), đúng nguyên lý Open/Closed bằng dữ liệu (thêm mã = thêm một dòng enum + một dòng message).

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Mã lỗi nằm một chỗ (`error-codes.ts`); service chỉ quyết định khi nào ném |
| O | ✔ | Thêm lỗi mới không sửa filter/helper |
| L / I / D | n.a. | — |

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Unit | 6 chỗ `toBeInstanceOf(BadRequestException)` đổi sang kiểm `AppException` + `errorCode` (1308/1309/1310) | `order.service.spec.ts` |
| Unit | Mỗi chỗ ném của `auth`, `google-auth`, `review` (Google giả bằng mock `OAuth2Client`/`fetch`) kiểm status + `errorCode` + message | `auth.service.spec.ts`, mới `google-auth.service.spec.ts`, `review.service.spec.ts` |
| Flow | `GET /api/orders/:id` lạ → 404/1301; checkout giỏ rỗng → 1309; huỷ đơn không `pending` → 1311, đã huỷ → 1312; `PATCH /api/addresses/:id` lạ → 404/2101; `PATCH/DELETE /api/cart/items/:id` lạ → 404/2002; thêm sản phẩm `disabled` → 2003 | `test/flows/order/`, `test/flows/cart/`, `test/flows/address/` |
| Kiến trúc | `RAW_HTTP_EXCEPTIONS` về `{}`: xoá hằng số, luật tuyệt đối | `architecture.spec.ts` |

Mỗi flow mới giảm `test/coverage-baseline.json` (ratchet) tương ứng.

## 5. Rủi ro & rollback

- Client đọc `error` hoặc so chuỗi `message` có thể bị ảnh hưởng (message giữ nguyên, `error` mất).
- Tiền tố 20/21/22 phải chưa được dùng cho mục đích khác (đã kiểm: chỉ 10–19 và 90 đang dùng).
- Rollback: `git revert` từng commit theo module.

## 6. Kết quả triển khai

- **File:** `error-codes.ts` (15 mã mới: order 1308–1312, review 1909, cart 2001–2003, address 2101, auth 2201, 2202, 2210–2212); `order|cart|address|review|auth.service.ts` và `google-auth.service.ts` (27 chỗ chuyển sang `throwAppError`); tests: `test/flows/order-payment/order-errors.flow.ts`, `test/flows/cart/cart-errors.flow.ts`, `test/flows/address/address-errors.flow.ts` (11 flow), `google-auth.service.spec.ts` mới (10 test), cập nhật `order|auth|review` spec; `architecture.spec.ts` (luật exception thô thành tuyệt đối, xoá `RAW_HTTP_EXCEPTIONS`).
- **Khác thiết kế:** bỏ mã `AUTH_USER_UNAVAILABLE` (2203). Trong `refreshToken`, `catch` ngoài nuốt mọi lỗi nên `User not found or disabled` chưa bao giờ tới client (luôn là `Invalid refresh token`). Để không đổi hành vi, logic tra user tách thành `findUserForRefreshToken` (trả `null` cho mọi thất bại, kể cả lỗi DB như trước) và `refreshToken` chỉ ném 2202.
- **Hành vi thay đổi trên dây:** đúng như mục 3.5 (thêm `errorCode`, bỏ `error`); status HTTP và message giữ nguyên, đã kiểm bằng flow/unit.
- **Phát hiện ghi nhận (không sửa):** `throwAppError` mặc định HTTP 400 nên `ORDER_NOT_FOUND` ở admin (`findOneAdmin`, `updateStatus`) trả 400 trong khi phía khách trả 404.
- **Kiểm chứng:** phá thử 3 điểm (đổi mã 1312 sang 1311, bỏ 404 của `CART_NOT_FOUND`, bọc lại `AppException` trong `exchangeAuthCode`) đều bị test bắt. Độ phủ endpoint: ca lỗi 4/96 → 11/96 (baseline co từ 95 xuống 94 route).
- **Sửa kèm:** log của flow test thật sự tắt (trước đó `Logger.overrideLogger` bị `TestingLogger` của Nest ghi đè nên log 503 kỳ vọng vẫn in); đặt `FLOW_TEST_LOGS=1` để bật lại khi debug.
- **Docs:** `docs/modules/{order,cart,address,review,auth,common}.md`, `test/README.md`, `test/PROGRESS.md`, roadmap.
