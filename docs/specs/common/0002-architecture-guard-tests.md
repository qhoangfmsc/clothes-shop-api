# 0002 — Test kiến trúc: quy ước được máy ép, allowlist chỉ co lại

> Module: `common` · Trạng thái: Implemented · Ngày: 2026-10-22
> Allowlist exception thô trong spec này đã về rỗng (xem 0003); phần còn lại vẫn đúng.

## 1. Bối cảnh & vấn đề

`engineering-principles.md` và `CLAUDE.md` đặt các luật kiến trúc/convention (hướng phụ thuộc, không vòng module, không code chết, lỗi qua `throwAppError`, service không quá lớn) nhưng chỉ nhờ người đọc rule. Hiện trạng đã đo: `common/` import `modules/` ở 1 chỗ (`permissions.guard.ts` → `User`), 27 chỗ ném exception HTTP thô trong 6 service (`order` 8, `google-auth` 7, `cart` 5, `auth` 4, `address` 2, `review` 1), không có `forwardRef`, 8 service vượt 300 dòng (`order`, `payment` có 6 dependency). Code mới có thể làm tệ hơn mà không có gì báo.

## 2. Mục tiêu & ngoài phạm vi

- Biến các luật trên thành test chạy trong `yarn test`; vi phạm cũ nằm trong allowlist **chỉ được co lại** (thêm vi phạm mới hoặc để vi phạm cũ lớn thêm thì đỏ; sửa xong mà không giảm allowlist cũng đỏ).
- Ngoài phạm vi: sửa các vi phạm cũ (Phần 7–11), kiểm tra theo ngữ nghĩa (vd service gọi repo của module khác), `jwt.strategy.ts` (cố ý ném `UnauthorizedException` thô để 401 của guard không có `errorCode`, ma trận auth dựa vào điều đó).

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Test jest quét mã nguồn + metadata Nest, allowlist trong code | Chạy sẵn trong `yarn test`, không thêm phụ thuộc, sửa allowlist qua code review | Quét bằng regex nên giới hạn ở các mẫu đơn giản |
| B. `dependency-cruiser` / eslint-plugin-boundaries | Mạnh cho đồ thị import | Thêm công cụ và cấu hình; dự án dùng Biome, không có ESLint |
| C. Chỉ ghi trong rule | Không tốn công | Không ai ép |

**Chọn A**. Mô hình `list-query.dto.spec.ts` sẵn có (test quét để ép chuẩn) được mở rộng.

### 3.2 Kiến trúc & ranh giới

```
src/common/architecture/
├── architecture.spec.ts                    các test (chạy bằng `yarn test`)
├── architecture-allowlist.test-utils.ts    vi phạm cũ được phép + lý do (chỉ co lại)
└── source-scan.test-utils.ts               đọc file nguồn, bỏ comment, đếm mẫu
```
Hậu tố `.test-utils.ts` để `tsconfig.build.json` loại khỏi bản build. Đồ thị module lấy từ metadata runtime của Nest (`Reflect.getMetadata('imports', Module)`), không parse text.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Architecture fitness function (test kiến trúc) | `architecture.spec.ts` | Luật kiến trúc không bị lệch dần | Quét bằng regex, chỉ bắt mẫu đơn giản |
| Ratchet (allowlist chỉ co lại) | `architecture-allowlist.test-utils.ts` | Có nợ cũ nhưng không cho tăng thêm | Phải sửa allowlist khi sửa nợ |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Quét file, allowlist và các luật tách thành ba phần |
| O | ✔ | Thêm luật = thêm một `it`; thêm ngoại lệ = thêm một dòng allowlist có lý do |
| L / I / D | n.a. | Không có kế thừa/interface |

### 3.7 Các luật

| # | Luật | Cách đo | Allowlist hiện tại |
|---|---|---|---|
| 1 | `common/`, `core/` không import `modules/` | Quét `from '...'` bắt đầu `@/` hoặc chứa `modules/` | `permissions.guard.ts` (kiểu `User`) |
| 2 | Đồ thị module Nest không có vòng, không `forwardRef`, không entry `imports` là `undefined` | Metadata `imports` của mọi `*.module.ts` | không |
| 3 | Không export thừa trong `common/`, `core/` | Symbol export không được file khác tham chiếu và không dùng trong chính file (sau khi bỏ comment) | `ApiEndpoint` (quy ước trong skill `.agent`) |
| 4 | `*.service.ts` không ném exception HTTP thô (`throw new XxxException`, trừ `AppException`); dùng `throwAppError` | Đếm theo file | 6 file, 27 chỗ |
| 5 | Service ≤ 300 dòng và ≤ 5 dependency constructor | Đếm theo file | 8 file quá dòng (không được dài thêm), 2 file 6 dependency (không được thêm) |

Quy tắc ratchet: vi phạm mới → đỏ; vi phạm cũ tăng → đỏ; vi phạm cũ giảm hoặc hết mà allowlist chưa giảm → đỏ (nhắc cập nhật). Riêng độ dài: dài thêm → đỏ; ngắn đi mà vẫn > 300 dòng thì không bắt buộc cập nhật; xuống ≤ 300 mà còn trong allowlist → đỏ.

### 3.8 Lỗi & trường hợp biên

| Tình huống | Hành vi |
|---|---|
| Thêm `throw new BadRequestException` vào service sạch | Đỏ, nêu file và hướng dẫn dùng `throwAppError` |
| Sửa xong một exception thô ở file trong allowlist | Đỏ cho tới khi giảm số trong allowlist |
| Thêm `forwardRef` hoặc tạo vòng giữa hai module | Đỏ, in vòng |
| Thêm export mới không ai dùng trong `common/` | Đỏ |

## 4. Kế hoạch test

Chính các test này là sản phẩm. Kiểm chứng bằng phá thử: import `modules/` vào `common/`, thêm exception thô vào service sạch, thêm `forwardRef`, thêm export thừa, làm `payment.service.ts` dài thêm, giảm một exception thô mà không giảm allowlist.

## 5. Rủi ro & rollback

Regex có thể bắt nhầm/bỏ sót ở trường hợp lạ; giảm thiểu bằng thông báo nêu dòng vi phạm và allowlist có lý do. Rollback: xoá thư mục `src/common/architecture/`.

## 6. Kết quả triển khai

- **File:** `src/common/architecture/{architecture.spec.ts, architecture-allowlist.test-utils.ts, source-scan.test-utils.ts}` (5 test).
- **Khác thiết kế:** thêm kiểm tra entry `imports` là `undefined`. Phá thử bằng vòng `SiteConfigModule -> CurrencyModule -> SiteConfigModule` lúc đầu lọt: với vòng import giữa hai file module, một bên thấy `undefined` lúc decorator chạy nên đồ thị không hiện vòng (và một vòng chạy được trong Nest bắt buộc phải có `forwardRef`, đã bị chặn). Thêm khẳng định chống qua rỗng (phải thấy > 10 module và > 10 cạnh).
- **Vi phạm cũ trong allowlist:** 1 import `common → modules` (`permissions.guard.ts`), `ApiEndpoint`, 27 exception thô ở 6 service, 8 service quá 300 dòng, 2 service 6 dependency (`order`, `payment`). Các phần sau sẽ giảm dần.
- **Kiểm chứng:** phá thử 7 lần (import modules vào common, export thừa, exception thô trong service sạch, `forwardRef`, vòng module, service dài thêm, giảm exception thô mà không giảm allowlist) đều bị bắt đúng luật. `tsc`, 734 unit test, 28 flow test, `nest build` qua.
- **Docs:** `docs/modules/common.md` (4.12, 4.13), `test/README.md`, `.claude/rules/{engineering-principles,testing}.md`, `CLAUDE.md`, skill `design-principles`, roadmap.
