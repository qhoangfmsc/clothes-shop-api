# 0003 — `product` chia cell: catalog, admin

> Module: `product` (+ nhiều module khác đổi đường import entity/presenter) · Trạng thái: Implemented · Ngày: 2026-10-25 · Theo common/0011

## 1. Bối cảnh & vấn đề

`product` (sau product/0002) có `ProductQueryService` đọc cho cả khách (danh sách công khai, gợi ý, chi tiết) lẫn admin (danh sách admin), và `ProductService` ghi (admin). Hai controller đã tách theo khách/admin. Entity, presenter và `product-rating.util.ts` được cart, wishlist, collection, order, review dùng.

## 2. Mục tiêu & ngoài phạm vi

- Hai cell: `catalog/` (khách xem) và `admin/` (quản trị) + `shared/` (entity, presenter, hàm cập nhật điểm sản phẩm).
- **Không đổi hành vi**: route, quyền, response, mã lỗi. Code di chuyển nguyên văn; `findAllAdmin` tách khỏi service đọc công khai thành `ProductAdminQueryService`; `ProductService` đổi tên `ProductAdminService`.
- Ngoài phạm vi: đổi bộ lọc, luật validate.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. `catalog/` + `admin/` + `shared/` | Entity/presenter dùng chung nhiều module nằm ở một chỗ rõ ràng; khách và admin không dính nhau | Module nhỏ (8 file) nên thêm thư mục |
| B. Giữ phẳng | Không đổi | Trái yêu cầu "nhìn cây thư mục là biết" |

**Chọn A** theo yêu cầu áp dụng quy ước cho module có hơn một nhóm chức năng.

### 3.2 Kiến trúc & ranh giới

```
product/
  shared/   product.entity, product.presenter, product-rating.util, product.test-utils
  catalog/  ProductCatalogQueryService (findAllPublic, autocomplete, findById), ProductCatalogController (api/products),
            dtos/public-product-query, product-autocomplete-query, product-detail-query
  admin/    ProductAdminQueryService (findAllAdmin), ProductAdminService (create, update, delete), AdminProductController,
            dtos/admin-product-query, product.dto
```
- `ProductModule` export `ProductCatalogQueryService` (hiện không module nào inject).
- Module khác tiếp tục import entity/presenter từ `product/shared/`.

### 3.3 Design pattern áp dụng

Package by feature (cell). Cái giá: nhiều đường import ở module khác đổi (do công cụ viết lại tự động).

### 3.4 Kiểm tra SOLID

S ✔ (khách/admin tách lý do đổi), I ✔, O/L/D n.a.

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Không đổi.

## 4. Kế hoạch test

`product-query.service.spec.ts` tách: ca danh sách công khai/chi tiết/gợi ý/DTO → `catalog/`, ca danh sách admin → `admin/`; `setup` dùng chung ở `shared/product.test-utils.ts`. Số ca không đổi. Flow, snapshot route, test cell giữ nguyên.

## 5. Rủi ro & rollback

Rủi ro thấp (di chuyển nguyên văn, nhiều import đổi). Rollback: `git revert`.

## 6. Kết quả triển khai

- **File:** 14 file di chuyển bằng công cụ viết lại import (nhiều import ở cart, wishlist, collection, order, review đổi sang `product/shared/`); `ProductQueryService` tách `ProductCatalogQueryService` + `ProductAdminQueryService`; `ProductService` đổi tên `ProductAdminService`; `ProductController` đổi tên `ProductCatalogController`; test kit `shared/product.test-utils.ts`, `catalog/catalog.test-utils.ts`, `admin/admin.test-utils.ts`; `product-query.service.spec.ts` tách hai spec.
- **Kiểm chứng di chuyển nguyên văn:** so mọi dòng bốn file cũ với các file mới: chỉ khác tên class và constructor.
- **Khác thiết kế:** không có.
- **Kiểm chứng:** `tsc`, biome, 845 unit (không đổi), 883 flow (snapshot route–quyền không đổi), độ phủ 98/98 và 82/82.
- **Docs:** `product.md` (3, 4.6, 4.7, 4.9), `common.md`, `test/README.md`.
