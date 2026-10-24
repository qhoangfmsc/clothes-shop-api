# 0002 — Tách `ReturnService` thành đọc và ghi

> Module: `return` (+ `pending-count` đổi chỗ tiêm) · Trạng thái: Implemented · Ngày: 2026-10-24

## 1. Bối cảnh & vấn đề

`ReturnService` (450 dòng, 4 dependency) nằm trong `OVERSIZED_SERVICES`. Đã đọc code, hai controller, `ReturnModule`, `PendingCountService`, `return.service.spec.ts`. Nhóm theo việc thật sự làm:

| Nhóm | Phương thức | Dependency dùng |
|---|---|---|
| Đọc | `getEligibility`, `findAll`, `findOne`, `findAllAdmin`, `countRequested`, `findOneAdmin` (+ `getView`, `toViews`, 90 dòng dựng view có tiền VND/USD) | `DataSource` (manager), `returnRepo`, `ShippingConfigService` (cửa sổ trả hàng) |
| Ghi | `create`, `cancel`, `approve`, `reject`, `receive` (+ `withLockedRequest`, `assertStatus`, `resolveAcceptedQuantities`) | `DataSource` (transaction), `ShippingConfigService` (`create`), `RefundService` (`receive`) |

`activeQuantities` (số lượng đã nằm trong yêu cầu còn hiệu lực) dùng ở cả đọc (`getEligibility`) lẫn ghi (`create`); sau mỗi lần ghi, ghi đọc lại view để trả về.

## 2. Mục tiêu & ngoài phạm vi

- Hai service ≤ 300 dòng, ≤ 5 dependency; bỏ mục `return.service.ts` khỏi allowlist.
- **Không đổi hành vi**: cùng route, response, transaction, thứ tự khoá (đơn → yêu cầu trả hàng), mã lỗi. Code **di chuyển nguyên văn**.
- Ngoài phạm vi: đổi luật trả hàng, công thức hoàn tiền, view.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. `ReturnQueryService` (đọc + view) và `ReturnService` (ghi), `activeQuantities` thành hàm thuần nhận `manager` | Theo tiền lệ order/review/payment; ghi gọi đọc một chiều; không cần DI cho hàm chia sẻ | Controller tiêm nhiều service hơn |
| B. Tách thêm `ReturnReceiveService` cho `receive` (luồng tiền, ~65 dòng) | Luồng tiền riêng | Ghi còn ~270 dòng, dưới ngưỡng; chưa cần |
| C. Giữ nguyên, nâng ngưỡng | Không rủi ro | Trái mục tiêu co allowlist |

**Chọn A**.

### 3.2 Kiến trúc & ranh giới

```
return/return-query.service.ts          getEligibility, findAll, findOne, findAllAdmin, countRequested,
                                        findOneAdmin, getView (+ toViews)           deps: DataSource, returnRepo, ShippingConfigService
return/return.service.ts                create, cancel, approve, reject, receive    deps: DataSource, ShippingConfigService, RefundService, ReturnQueryService
return/return-active-quantities.util.ts activeReturnQuantities(manager, orderId)    (đọc DB bằng manager được truyền vào)
```
- `ReturnService` → `ReturnQueryService` một chiều (trả view sau khi ghi, `findOne` cho khách), không vòng.
- `ReturnModule` cung cấp cả hai, **export `ReturnQueryService`** (`PendingCountService` chỉ dùng `countRequested`).
- `ReturnController` tiêm Query + Command; `AdminReturnController` tiêm Query + Command.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Tách command/query theo use case | hai service | Mỗi lớp một lý do đổi; view tiền (VND/USD) nằm cạnh các truy vấn | Controller tiêm nhiều service hơn |
| Hàm tiện ích nhận `manager` | `activeReturnQuantities` | Dùng ở cả đọc và ghi (trong transaction của `create`) mà không phụ thuộc lẫn nhau | Một file nhỏ |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Đọc/dựng view tách khỏi luật chuyển trạng thái và hoàn tiền |
| O | ✔ | Thêm bộ lọc admin chỉ sửa Query; thêm bước xử lý chỉ sửa Service |
| L / I | n.a. / ✔ | `PendingCountService` chỉ tiêm Query |
| D | ✔ (trong module) | Biên ngoài (`RefundService`) giữ như cũ |

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Không đổi (không migration). Phương thức cắt nguyên khối; chỉ đổi `this.getView/findOne/findOneAdmin/activeQuantities` sang Query và hàm thuần.

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Unit | `return.service.spec.ts` dựng cả hai service; ca đọc gọi `queries`, số ca không đổi | `return.service.spec.ts` |
| Unit | `pending-count.spec.ts` không đổi (mock `countRequested`) | không đổi |
| Flow (không sửa) | return-flow đủ vòng đời, lỗi, quyền, đồng thời (khoá đơn → yêu cầu) | toàn bộ |
| Kiến trúc | Bỏ mục `return.service.ts` | `architecture.spec.ts` |
| Phá thử | bỏ `activeReturnQuantities` khỏi `create` (cho trả quá số lượng) → test đỏ | thủ công |

## 5. Rủi ro & rollback

Rủi ro: luồng hoàn tiền (`receive`) nằm trong phần bị cắt. Giảm thiểu: di chuyển nguyên văn và đối chiếu từng dòng, `tsc`, toàn bộ flow trả hàng/hoàn tiền chạy lại, phá thử. Rollback: `git revert`.

## 6. Kết quả triển khai

- **File mới:** `return-query.service.ts` (187 dòng, 3 dependency), `return-active-quantities.util.ts`. **Sửa:** `return.service.ts` (450 → 266 dòng, 4 dependency), `return.controller.ts`, `admin-return.controller.ts`, `return.module.ts` (export `ReturnQueryService`), `PendingCountService`, `return.service.spec.ts`, allowlist kiến trúc (bỏ mục `return.service.ts`).
- **Kiểm chứng di chuyển nguyên văn:** so mọi dòng của file cũ với ba file mới: chỉ khác import, `this.activeQuantities` → `activeReturnQuantities`, `this.getView/findOne/findOneAdmin` → `this.queryService.*` và `getView` thành public.
- **Khác thiết kế:** không có.
- **Kiểm chứng:** 829 unit (số ca không đổi so với trước phần này) và 883 flow đều xanh, độ phủ route 98/98 và 82/82, `nest build` qua; không sửa flow nào. Phá thử: thay `activeReturnQuantities` trong `create` bằng bản đồ rỗng → 1 unit đỏ (số lượng không được trừ).
- **Docs:** `return.md` (4.6, 4.7, 4.9), `pending-count.md`, `common.md` (4.13).
