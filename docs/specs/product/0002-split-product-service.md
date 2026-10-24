# 0002 — Tách `ProductService` thành đọc và ghi

> Module: `product` · Trạng thái: Draft · Ngày: 2026-10-24 · Cỡ: rút gọn (không đổi hành vi)

## 1. Bối cảnh & vấn đề

`ProductService` (326 dòng theo cách đếm của `architecture.spec.ts`) là service cuối còn trong `OVERSIZED_SERVICES`. Đã đọc code, hai controller, `ProductModule`, `product.service.spec.ts`. Hai nhóm không gọi nhau:

| Nhóm | Phương thức | Dependency |
|---|---|---|
| Đọc | `findAllPublic`, `autocomplete`, `findById`, `findAllAdmin` | `productRepo`, `categoryRepo` (admin lọc theo slug danh mục), `CurrencyService` |
| Ghi | `create`, `update`, `delete` (+ `ensureSlugUnique`, `ensureSkuUnique`, `validateSubcategoryBelongsToCategory`) | `productRepo`, `categoryRepo`, `subCategoryRepo`, `CurrencyService` |

## 2. Mục tiêu & ngoài phạm vi

- `ProductQueryService` (đọc) và `ProductService` (ghi, giữ tên); bỏ mục cuối của `OVERSIZED_SERVICES` (allowlist về rỗng).
- **Không đổi hành vi**; code **di chuyển nguyên văn**.
- Ngoài phạm vi: đổi bộ lọc/sort, đổi luật validate.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Tách đọc/ghi | Đồng nhất với các module trước; hai nhóm độc lập nên không cần service gọi service | Controller admin tiêm hai service |
| B. Giữ nguyên | Không rủi ro | Trái mục tiêu allowlist về rỗng |

**Chọn A**.

### 3.2 Kiến trúc & ranh giới

```
product/product-query.service.ts  findAllPublic, autocomplete, findById, findAllAdmin   deps: productRepo, categoryRepo, CurrencyService
product/product.service.ts        create, update, delete (+ helper)                      deps: productRepo, categoryRepo, subCategoryRepo, CurrencyService
```
- `ProductController` chỉ tiêm Query; `AdminProductController` tiêm Query (`findAllAdmin`) + Command.
- `ProductModule` cung cấp cả hai, export `ProductQueryService` (hiện không module nào dùng `ProductService`).

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Tách command/query theo use case | hai service | Luật validate khi ghi tách khỏi bộ lọc/sort khi đọc | Controller admin tiêm hai service |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Đọc/ghi tách lý do đổi |
| I | ✔ | Controller công khai chỉ nhận Query |
| O / L / D | n.a. | Không đổi |

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Không đổi (không migration).

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Unit | `product.service.spec.ts` dựng `ProductQueryService` cho ca đọc (số ca không đổi) | `product.service.spec.ts` |
| Flow (không sửa) | đọc công khai/admin, tạo/sửa/xoá, đồng thời slug/SKU | `test/flows/product/*.flow.ts` |
| Kiến trúc | Allowlist `OVERSIZED_SERVICES` về `{}` | `architecture.spec.ts` |
| Phá thử | bỏ `validateSubcategoryBelongsToCategory` trong `create` → test đỏ | thủ công |

## 5. Rủi ro & rollback

Rủi ro thấp. Rollback: `git revert`.

## 6. Kết quả triển khai

_Điền sau khi làm xong._
