# 0011 — Quy ước "cell": module lớn chia thành thư mục chức năng

> Module: `common` (quy ước kiến trúc) · Trạng thái: Approved · Ngày: 2026-10-25

## 1. Bối cảnh & vấn đề

`src/modules/payment` có 37 file phẳng gồm QR/phiên thanh toán, giao dịch ngân hàng, webhook SePay, xác nhận thủ công, hoàn tiền; ba controller admin trộn lẫn. Nhìn danh sách file không biết file nào thuộc nhóm chức năng nào, và `PaymentQueryService` đọc cho cả ba nhóm. Mục 4.9 các module khác (order, review, return, product, category, media...) cũng đã được tách thành nhiều service nhưng vẫn nằm phẳng trong một thư mục.

Người dùng yêu cầu (2026-10-25): chia nhỏ tới mức "tế bào", nhìn vào cây thư mục là biết phần nào phục vụ chức năng nào; áp dụng cho mọi module có hơn một nhóm chức năng.

## 2. Mục tiêu & ngoài phạm vi

- Quy ước **cell**: trong một module, mỗi nhóm chức năng là một thư mục chứa đủ controller, service, dto, util, spec của riêng nó.
- Module nào có một thực thể độc lập (vòng đời, bảng, route riêng, không ai khác trong module dùng) thì tách thành **module cấp cao**, không chỉ thư mục.
- Máy ép quy ước (test kiến trúc), không dựa vào trí nhớ.
- Ngoài phạm vi: đổi route, bảng DB, hành vi, mã lỗi. Mỗi lần áp dụng cho một module có spec riêng.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Cell là thư mục trong một Nest module; thực thể độc lập tách thành module cấp cao | Ranh giới nhìn thấy trên cây thư mục, không thêm DI hay vòng module; chỉ module nào thật sự độc lập mới thành module | Ranh giới giữa các cell chỉ do test kiến trúc giữ |
| B. Mỗi cell là một Nest module | Nest ép ranh giới | Ghi chéo bảng phải thành hàm owner, dễ vòng module, nhiều boilerplate nhưng cell chỉ vài file |
| C. Giữ phẳng, đặt tên file có tiền tố | Không đổi gì | Không đạt mục tiêu "nhìn là biết" |

**Chọn A** (đã được người dùng duyệt).

### 3.2 Kiến trúc & ranh giới

```
src/modules/<module>/
├── <module>.module.ts        ghép các cell (một Nest module)
├── shared/                   entity, constant, presenter, config, util dùng chung các cell; không import cell nào
└── <cell>/                   một nhóm chức năng
    ├── <cell>.controller.ts / admin-<cell>.controller.ts
    ├── *.service.ts, *-query.service.ts
    ├── dtos/, *.util.ts, *.scheduler.ts
    └── *.spec.ts             test của chính cell
```
- Luật: file trong `<cell>/` chỉ import `shared/` và chính `<cell>/`; `shared/` không import cell; cell cần cell khác thì đi qua service được `PaymentModule` cung cấp, không import file chéo thư mục. Ngoại lệ phải ghi trong allowlist có lý do.
- Mỗi cell có đúng một lý do để đổi; tên thư mục là danh từ chức năng (`attempt`, `transaction`, `sepay`), tên class giữ tiền tố module để không trùng khi DI (`PaymentAttemptService`).
- Module có một cell duy nhất hoặc dưới ~8 file thì không cần chia cell (không chia cho đẹp).
- Entity của module nằm ở `shared/` vì cell nào cũng có thể đọc dữ liệu chung (cùng bảng, cùng quan hệ).

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Package by feature (cell) | thư mục cell | Tìm file theo chức năng thay vì theo loại | Cell cần dữ liệu chung phải qua `shared/` |
| Hàm kiểm tra kiến trúc | `architecture.spec.ts` | Quy ước không bị thoái hoá | Thêm một test quét import |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Mỗi cell một nhóm chức năng |
| O | ✔ | Thêm chức năng = thêm cell mới, không sửa cell cũ |
| I | ✔ | Cell khác chỉ nhận service của cell cần |
| L / D | n.a. | |

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Không đổi.

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Kiến trúc | Cell chỉ import `shared/` và chính nó; `shared/` không import cell; file trong thư mục module (không thuộc cell) chỉ là `*.module.ts` | `architecture.spec.ts` |
| Hành vi | Toàn bộ unit và flow có sẵn không đổi | `yarn test`, `yarn test:flows` |

## 5. Rủi ro & rollback

Rủi ro: di chuyển file làm hỏng import hoặc route table. Giảm thiểu: công cụ viết lại import tự động, `tsc`, snapshot route–quyền, toàn bộ test. Rollback: `git revert`.

## 6. Kết quả triển khai

_Điền sau khi làm xong._
