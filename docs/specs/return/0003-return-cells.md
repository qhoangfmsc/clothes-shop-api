# 0003 — `return` chia cell: request, processing

> Module: `return` (+ `pending-count` đổi đường import) · Trạng thái: Implemented · Ngày: 2026-10-25 · Theo common/0011, 0012

## 1. Bối cảnh & vấn đề

`return` có 11 file phẳng; hai service (return/0002) vẫn trộn hai nhóm việc: khách gửi/huỷ/xem yêu cầu và cửa hàng duyệt/từ chối/nhận hàng. `ReturnService` gồm `create`, `cancel` (khách) cùng `approve`, `reject`, `receive` (admin); `ReturnQueryService` gồm đọc cho khách và đọc cho admin; hai controller tương ứng hai nhóm.

## 2. Mục tiêu & ngoài phạm vi

- Hai cell: `request/` (khách) và `processing/` (cửa hàng) + `shared/`; mỗi service và controller chỉ phục vụ một cell.
- **Không đổi hành vi**: route, quyền, response, transaction, thứ tự khoá (đơn → yêu cầu), mã lỗi. Code di chuyển nguyên văn; hai chỗ đổi dạng: `getView`/`toViews` (dựng view, dùng cho cả hai nhóm) thành hàm nhận `EntityManager` ở `shared/`, `assertStatus` thành hàm thuần ở `shared/`.
- Ngoài phạm vi: đổi luật trả hàng.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Hai cell + `shared/` có hàm dựng view nhận `manager` | Hai nhóm không phụ thuộc nhau; không cần cạnh cell → cell | Hàm view là hàm chứ không phải service |
| B. Cell `processing/` import `request/` để dùng service đọc chung | Giữ `ReturnQueryService` | Cạnh phụ thuộc không cần thiết |

**Chọn A**.

### 3.2 Kiến trúc & ranh giới

```
return/
  shared/      return-request.entity, return-request-item.entity, return.constant, return-eligibility.util,
               return-active-quantities.util, return-refund-state.util, return-status.util (assertReturnStatus),
               return-view.util (presentReturnViews, findReturnView), return.test-utils
  request/     ReturnRequestService (create, cancel), ReturnRequestQueryService (getEligibility, findAll, findOne),
               ReturnController (api/returns), dtos/create-return, public-return-query
  processing/  ReturnProcessingService (approve, reject, receive), ReturnProcessingQueryService (findAllAdmin, countRequested, findOneAdmin),
               AdminReturnController (api/admin/returns), dtos/approve-return, reject-return, receive-return, admin-return-query
```
- Không có cạnh cell → cell. `ReturnModule` export `ReturnProcessingQueryService` (`PendingCountService.countRequested`).
- `RefundModule` tiếp tục dùng `return/shared/return-refund-state.util`.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Package by feature (cell) | `return/*` | Tìm file theo chức năng | Hàm view dùng chung đặt ở `shared/` |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Service không còn gộp khách và cửa hàng |
| I | ✔ | `PendingCountService` chỉ nhận `ReturnProcessingQueryService` |
| O / L / D | n.a. | |

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Không đổi.

## 4. Kế hoạch test

`return.service.spec.ts` (hơn 600 dòng) tách theo describe: `request/return-request.service.spec.ts` (eligibility, create, đọc/huỷ của khách, DTO của khách) và `processing/return-processing.service.spec.ts` (duyệt/từ chối, nhận hàng, lệch tiền nhiều lần trả, DTO của cửa hàng); fixture và `setup` dùng chung ở `shared/return.test-utils.ts`. Số ca không đổi. Flow, snapshot route, test kiến trúc cell giữ nguyên.

## 5. Rủi ro & rollback

Luồng hoàn tiền (`receive`) nằm trong phần di chuyển. Giảm thiểu: nguyên văn, đối chiếu từng dòng, toàn bộ flow trả hàng/hoàn tiền chạy lại, phá thử. Rollback: `git revert`.

## 6. Kết quả triển khai

- **File:** 19 file di chuyển bằng công cụ viết lại import; `ReturnService`/`ReturnQueryService` tách bốn (`ReturnRequestService`, `ReturnRequestQueryService`, `ReturnProcessingService`, `ReturnProcessingQueryService`); mới `shared/return-view.util.ts`, `shared/return-status.util.ts`, `shared/return.test-utils.ts` (fixture + `buildReturnTestKit`), `request/request.test-utils.ts`, `processing/processing.test-utils.ts`; `return.service.spec.ts` tách hai spec theo cell.
- **Kiểm chứng di chuyển nguyên văn:** so mọi dòng hai file cũ với các file mới: chỉ khác tên class, constructor, `this.assertStatus` → `assertReturnStatus`, `this.getView/toViews` → hàm nhận `manager`.
- **Khác thiết kế:** (1) test "ba lần trả một món cộng lại đúng số đã trả" cũ gọi `create` rồi `approve/receive` qua hai service nên vượt ranh giới cell; viết lại để đặt sẵn ba yêu cầu `REQUESTED` (phần `create` chỉ chèn dòng, không liên quan phép chia tiền). (2) Helper dựng service (`setupRequest`, `setupProcessing`) nằm trong từng cell vì `shared/` không được import cell.
- **Kiểm chứng:** `tsc`, biome, 842 unit (không đổi), 883 flow, độ phủ 98/98 và 82/82.
- **Docs:** `return.md` (3, 4.6, 4.7, 4.9), `pending-count.md`, `refund.md`, `common.md`, `test/README.md`.
