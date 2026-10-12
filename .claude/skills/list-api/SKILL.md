---
name: list-api
description: Checklist và template khi tạo/sửa API list (public hoặc admin) trong clothes-shop-api — phân trang, sort, search, filter, response phải đồng bộ giữa mọi module. Dùng mỗi khi thêm endpoint GET trả danh sách, thêm filter/sort, hoặc đổi limit/page.
---

# list-api — API list đồng bộ toàn project

Nguồn chuẩn: mục **List API Standards** trong `CLAUDE.md`. Skill này là checklist thao tác. Khi chuẩn thay đổi, sửa CLAUDE.md, skill này, helper dùng chung và spec guard **cùng một lượt**, không sửa lẻ từng module.

## Helper dùng chung (không viết lại)

| Việc | Dùng |
|---|---|
| page/limit (default 1/25, max 200) | `PaginationQueryDto` — `@common/dto/pagination-query.dto` |
| hằng số phân trang | `DEFAULT_PAGE`, `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE` — `@common/base/pagination.util` |
| lấy page/limit trong service | `getPaging(query)` |
| response | `paginated(data, total, page, limit)` |
| sort (DTO) | `@SortField([...], defaultSort)` — `@common/decorator/sort-field.decorator` |
| sort (service) | `parseSort(sort, defaultSort)` — `@common/base/sort.util` |
| search | `@SearchField('<cột được tìm>')` — `@common/decorator/search-field.decorator` |
| enum lặp lại | `@common/constants/enum-values.constant` hoặc `ORDER_STATUSES` |

## Quy trình

1. **DTO** `dtos/<public|admin>-<name>-query.dto.ts`: `extends PaginationQueryDto`. Không khai báo lại `page`/`limit`, không có biến thể public/admin của pagination.
2. **Sort**: `@SortField(['field1', 'createdAt'], '-createdAt') sort?: string;`
   - `field` = ASC, `-field` = DESC, một field duy nhất. CẤM `newest/oldest/price_asc/...` và tham số `sorts`.
   - Chọn default hợp lý (`-createdAt` cho dữ liệu theo thời gian, `priority` cho danh mục có thứ hạng).
3. **Search**: `@SearchField('Search keyword (cột1, cột2)') search?: string;`
4. **Filter**: tên param trùng tên field; enum dùng `@IsIn(CONST)` với hằng dùng chung; quan hệ lọc bằng slug; khoảng giá trị là `minX`/`maxX`; đa giá trị là chuỗi phẩy. Filter ở public và admin của cùng resource phải cùng tên, cùng kiểu.
5. **Service**:
   ```ts
   const { search, status, sort } = query;
   const { page, limit } = getPaging(query);
   const { field, direction } = parseSort(sort, '-createdAt'); // trùng default ở @SortField
   // ... build where/qb, order: { [field]: direction } hoặc qb.orderBy(`alias.${field}`, direction)
   return paginated(data, total, page, limit);
   ```
   Query builder có join 1-nhiều thì paginate trên bảng chính trước rồi load quan hệ riêng (xem `CategoryService.findAllPublic`).
6. **Controller**: `@Query() query: XxxQueryDto`; thêm `@Permissions(...)` đúng quyền cho route admin.
7. **Test**: chạy `yarn test`. `src/common/dto/list-query.dto.spec.ts` tự quét mọi `*-query.dto.ts`. DTO không phải list thì thêm vào `NOT_LIST_DTO_FILES`, kèm lý do.
8. **Docs (bắt buộc)**: trước khi sửa, đọc `docs/modules/<module>.md` của module (skill `module-docs`, giai đoạn A); sau khi sửa, cập nhật mục 4.1 (query/response) và 4.8 nếu có lệch chuẩn, đổi `Cập nhật lần cuối`. Chưa cập nhật docs = chưa xong. Không tạo tài liệu riêng cho FE.

## Cấm

- Hardcode `24`, `20`, `100`, `200` cho limit; `query.limit ?? N`; `limit = 25` trong destructure.
- `sorts`, `sort=newest`, `switch (sort)` theo tên, tự parse `startsWith('-')`.
- Tự viết `search` với MaxLength riêng, hoặc `q`/`keyword` thay `search` (trừ autocomplete).
- Trả list admin thiếu `totalPages`, hoặc `{ data, total, page, limit }` tự ghép thay vì `paginated()`.
- Lặp literal enum (`['active', 'disabled']`) ở nhiều DTO.

## Kiểm tra cuối

```bash
npx tsc --noEmit && npx biome check src/ && yarn test && npx nest build
```
