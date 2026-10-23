# 0007 — Cập nhật một phần an toàn (`PATCH`): DTO không thuộc tính rỗng, ràng buộc kế thừa từ create

> Module: `common` (+ product, category, collection, address chỉ đổi khai báo DTO) · Trạng thái: Implemented · Ngày: 2026-10-23

## 1. Bối cảnh & vấn đề

Chiến dịch test (batch 13–18) và thăm dò thêm cho thấy bốn route `PATCH` (product, category, collection, address) cùng một họ lỗi:

1. **Khoá `undefined` ma**: `tsconfig` có `target: esnext` nên `useDefineForClassFields` mặc định `true`; mọi field khai báo trong class DTO được tạo thành thuộc tính `undefined` ngay khi `new Dto()`. `Object.assign(entity, dto)` ghi `undefined` lên entity: DB không đổi (TypeORM bỏ qua `undefined`) nhưng **response thiếu mọi field không gửi**, và ở product, `PATCH` đổi danh mục không gửi `slug` lưu SKU `…-undefined` vào DB (vì `product.slug` đã bị ghi `undefined` trước khi sinh SKU). Đã đo: `plainToInstance(UpdateProductDto, { name })` có 16 khoá; `exposeUnsetFields: false` **không** giảm được (khoá sinh từ khai báo field, không từ body).
2. **Ràng buộc lệch giữa create và update**: các `Update*Dto` được viết tay, thiếu `@IsNotEmpty` ở `slug`, `name`, `title`, `image`, `fullName`, `phone`… nên `PATCH { "slug": "" }` được chấp nhận và lưu chuỗi rỗng, trái docs ("cùng ràng buộc như create").
3. **`null` ở field không cho phép null**: `@IsOptional()` coi `null` như "không gửi", nên `PATCH { "name": null }` qua validation rồi nổ ở DB → **500**. Đã đo trên 7 route (product, category, collection, address, user).

Tra cứu: vấn đề `useDefineForClassFields` với DTO là vấn đề đã biết của hệ sinh thái NestJS/TypeORM; NestJS đã thêm `PartialType(Create, { skipNullProperties: false })` (có trong `@nestjs/swagger` 11.4.5 và `@nestjs/mapped-types` 2.1.1 đang cài) đúng cho trường hợp PATCH có field "không được null nhưng không bắt buộc gửi".

## 2. Mục tiêu & ngoài phạm vi

**Mục tiêu**
- DTO nhận từ body chỉ có đúng các khoá client gửi.
- Update DTO **kế thừa** ràng buộc của create (một nguồn), không viết lại tay.
- `null` ở field bắt buộc trong create bị từ chối ở tầng DTO (400, có thông điệp theo field).
- Có test tự động giữ ba điều trên cho mọi cặp `Create*Dto`/`Update*Dto`.

**Ngoài phạm vi**
- Thay mọi `@IsOptional()` trong repo bằng decorator khác, và các DTO ngoài 4 module này (review, order, return, payment, user): chưa có lỗi quan sát được; lỗi DB còn sót được đỡ ở tầng DB (spec 0008).
- Đổi hành vi của `PATCH` ngoài những điểm trên (không đổi route, quyền, mã lỗi).

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. `useDefineForClassFields: false` trong `tsconfig` + `PartialType(Create, { skipNullProperties: false })` cho Update DTO + test bảo vệ** | Sửa tận gốc (khoá ma biến mất cho **mọi** DTO, cả code tương lai); Update DTO thừa hưởng ràng buộc; chuẩn NestJS | Đổi cờ compiler toàn dự án (đã chạy thử: 755 unit + 832 flow xanh; test `list-query.dto.spec` phải đọc metadata thay vì dò khoá ma) |
| B. Giữ cờ, lọc `undefined` ở từng service (`pickDefined(dto)`) | Không đụng compiler | Quên một chỗ là lỗi lại; nguyên nhân gốc còn; bốn service phải sửa tay và còn phải nhớ cho service mới |
| C. `ValidationPipe` + pipe riêng bỏ khoá `undefined` | Một chỗ, không đổi compiler | Một pipe thứ hai ẩn sau pipe chuẩn, dễ lệch; vẫn không thừa hưởng ràng buộc |
| D. Giữ DTO viết tay, chỉ thêm `@IsNotEmpty` | Ít đổi | Lệch lại ngay lần sửa create tiếp theo (đúng cách lỗi này sinh ra) |

**Chọn A**, có B làm lưới phụ không cần viết (nếu cờ bị đổi lại, test bảo vệ đỏ).

### 3.2 Kiến trúc & ranh giới

- `tsconfig.json`: thêm `"useDefineForClassFields": false` (TypeScript khuyến nghị cho `experimentalDecorators`; TypeORM entity cũng không còn thuộc tính `undefined` ma).
- Update DTO ở product, category, collection, address: `class UpdateXDto extends PartialType(CreateXDto, { skipNullProperties: false }) {}`; field chỉ có ở update (category: `priority`) khai báo thêm trong class con.
- Hai field cố ý nhận `null` (`badge` của product, `heroImage` của category) giữ nguyên nhờ `@IsOptional()` kế thừa từ create; riêng `originalPriceVnd` của product đã có xử lý `null` = xoá giá gốc.
- **Quy ước `null`**: field bắt buộc ở create → `null` bị 400 (`skipNullProperties: false`). Field tuỳ chọn ở create mang `@IsOptional()` → `null` được hiểu **đúng như class-validator định nghĩa: "không gửi"**. Để quy ước này đúng ở tầng ghi, các service dùng `pickProvided(dto, nullableKeys)` (`common/base/provided-fields.util.ts`) khi tạo/sửa entity: bỏ `undefined`, bỏ `null` trừ field cố ý nhận null. Lý do không siết `null` thành 400 cho field tuỳ chọn: frontend hiện có thể đang gửi `null` và được chấp nhận; đổi contract đó cần quyết định riêng.
- Không đổi hướng phụ thuộc; không thêm module.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Giải quyết vấn đề gì | Cái giá phải trả |
|---|---|---|---|
| Kế thừa chỉ để dùng chung DTO (`PartialType`) | 4 `Update*Dto` | Một nguồn ràng buộc | Phụ thuộc helper của NestJS |
| Máy ép quy ước (guard test) | `src/common/dto/update-dto.spec.ts` | Không để update lệch create và không để khoá ma quay lại | Thêm một file test |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | DTO chỉ mô tả hình dạng input |
| O | ✔ | Thêm field vào create tự có ở update |
| L | ✔ | Kế thừa chỉ để dùng chung ràng buộc |
| I | n.a. | |
| D | n.a. | |

### 3.5 Dữ liệu / 3.6 API

Không đổi schema. API: `PATCH` trả đủ field; `PATCH` với chuỗi rỗng ở field bắt buộc → 400 (trước đây 200 và lưu rỗng); `null` ở field bắt buộc → 400 (trước đây 500).

### 3.7 Luồng xử lý, transaction, lock

Không đổi.

### 3.8 Lỗi & trường hợp biên

| Tình huống | Hành vi mong đợi |
|---|---|
| `PATCH {}` | 200, không đổi gì, response đủ field |
| `PATCH { "slug": "" }` | 400 (validation, không `errorCode`) |
| `PATCH { "name": null }` | 400 (validation) |
| `PATCH { "description": null }` ở field tuỳ chọn (vd address `label`, collection `subtitle`) | 200, coi như không gửi, giá trị cũ giữ nguyên |
| `PATCH { "badge": null }` (product) | 200, xoá badge |
| `PATCH { "categoryId": X }` không kèm `slug` | SKU sinh lại từ `slug` hiện có |

## 4. Kế hoạch test

| Tầng | Case | Vị trí file |
|---|---|---|
| Unit | Với mọi cặp `Create*Dto`/`Update*Dto` trong `modules/*/dtos`: `plainToInstance(Update, {})` không có khoá nào; mọi validator không-điều-kiện của create có ở update | `src/common/dto/update-dto.spec.ts` |
| Flow | product/category/collection/address: PATCH đầy đủ response, chuỗi rỗng → 400, `null` → 400, `badge: null` ok, đổi danh mục không gửi `slug` → SKU đúng | `test/flows/{product,category,collection,address}/*.flow.ts` |
| Phá thử | Bỏ `useDefineForClassFields` → test bảo vệ và flow đỏ; đổi `skipNullProperties` → flow `null` đỏ | thủ công |

## 5. Rủi ro & rollback

Rủi ro: cờ compiler đổi cách emit class (entity, DTO, provider). Đã chạy toàn bộ unit + flow; rollback = revert một dòng `tsconfig` + hai file. Không có thay đổi dữ liệu.

## 6. Kết quả triển khai

- **File:** `tsconfig.json`; `common/base/provided-fields.util.ts` (+ spec); `common/dto/update-dto.spec.ts`; `common/dto/list-query.dto.spec.ts` (đọc metadata thay vì dò khoá ma); `Update*Dto` của product, category, collection, address; service tương ứng dùng `pickProvided`; category `create` trả `subcategories: []` khi không gửi.
- **Khác thiết kế ban đầu:** ban đầu tôi đề xuất `exposeUnsetFields: false`; đo thật cho thấy không đủ nên chuyển sang sửa `tsconfig` (ghi ở mục 1). Thêm `pickProvided` để giữ đúng ngữ nghĩa "null = không gửi" của `@IsOptional()` ở tầng ghi (phát hiện khi test: `isDefault`, `subcategories`, `productIds`, `sku`… nhận `null` làm `PATCH` nổ 500).
- **Docs:** `common.md` (4.1, 4.13), `product.md`, `category.md`, `collection.md`, `address.md` (4.8), `test/README.md`, `test/PROGRESS.md` (6 phát hiện → Đã sửa).
- **Test:** 7 test unit mới (guard + helper), flow PATCH ở 4 module ghim response đầy đủ, chuỗi rỗng/`null` → 400, `null` ở field tuỳ chọn = không gửi, đổi danh mục không gửi `slug` sinh đúng SKU. Phá thử 8 điểm, tất cả bị bắt.
