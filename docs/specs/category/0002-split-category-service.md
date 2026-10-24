# 0002 — Tách `CategoryService` thành đọc và ghi

> Module: `category` · Trạng thái: Draft · Ngày: 2026-10-24 · Cỡ: rút gọn (không đổi hành vi)

## 1. Bối cảnh & vấn đề

`CategoryService` (376 dòng theo cách đếm của `architecture.spec.ts`) còn trong `OVERSIZED_SERVICES`. Đã đọc code, hai controller, `CategoryModule`, `docs/modules/category.md` và các flow test của category (không có unit spec cho service). Hai nhóm không gọi nhau:

| Nhóm | Phương thức | Dependency |
|---|---|---|
| Đọc | `findAll`, `findAllPublic`, `findBySlug`, `findAllAdmin` | `categoryRepo` |
| Ghi | `create`, `update`, `reorder`, `delete` (+ `ensureSlugUnique`, `lockPriorities`, `maxPriority`, `moveToPriority`, `validateSubCategorySlugs`, `reconcileSubCategories`) | `categoryRepo` (kèm `manager.transaction`) |

Phần ghi gánh luật khó (priority UNIQUE DEFERRABLE, advisory lock, đồng bộ subcategory theo slug); phần đọc chỉ là truy vấn và map response.

## 2. Mục tiêu & ngoài phạm vi

- `CategoryQueryService` (đọc) và `CategoryService` (ghi, giữ tên); bỏ mục `category.service.ts` khỏi allowlist.
- **Không đổi hành vi** (cùng route, response, mã lỗi, transaction, advisory lock). Code **di chuyển nguyên văn**.
- Ngoài phạm vi: đổi luật priority, đổi shape response.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Tách đọc/ghi | Đồng nhất với order/review/payment/return; hai nhóm không phụ thuộc nhau nên cắt sạch, không cần service gọi service | Controller admin tiêm hai service |
| B. Giữ nguyên, nâng ngưỡng | Không rủi ro | Trái mục tiêu đưa allowlist về rỗng |

**Chọn A**.

### 3.2 Kiến trúc & ranh giới

```
category/category-query.service.ts  findAll, findAllPublic, findBySlug, findAllAdmin   deps: categoryRepo
category/category.service.ts        create, update, reorder, delete (+ helper)         deps: categoryRepo
```
- Không có phụ thuộc giữa hai service. `CategoryController` chỉ tiêm Query; `AdminCategoryController` tiêm Query (`findAllAdmin`) + Command.
- `CategoryModule` cung cấp cả hai, export `CategoryQueryService` (phần đọc là thứ module khác có thể cần; phần ghi giữ nội bộ).

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Tách command/query theo use case | hai service | Luật ghi (priority, lock) tách khỏi map response | Controller admin tiêm hai service |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Đọc/ghi tách lý do đổi |
| I | ✔ | Module khác chỉ nhận Query |
| O / L / D | n.a. | Không đổi |

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Không đổi (không migration).

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Flow (không sửa) | Đọc công khai/admin, tạo, sửa, reorder, xoá, đồng thời (priority, slug) | `test/flows/category/*.flow.ts` |
| Kiến trúc | Bỏ mục `category.service.ts` | `architecture.spec.ts` |
| Phá thử | bỏ `lockPriorities` trong `create` → flow đồng thời đỏ | thủ công |

## 5. Rủi ro & rollback

Rủi ro thấp (di chuyển nguyên văn, hai nhóm độc lập). Rollback: `git revert`.

## 6. Kết quả triển khai

_Điền sau khi làm xong._
