# Plan: Thêm GET list + Search + Pagination + Filter + Sort cho Admin APIs

## Hiện trạng

| Module     | GET List | Search | Filter | Sort | Pagination |
|------------|----------|--------|--------|------|------------|
| Products   | ❌       | ❌     | ❌     | ❌   | ❌         |
| Categories | ❌       | ❌     | ❌     | ❌   | ❌         |
| Collections| ❌       | ❌     | ❌     | ❌   | ❌         |
| Orders     | ✅       | ❌     | status | ❌   | page+limit |

## Thiết kế chung

### Response format thống nhất
```json
{ "data": [...], "total": 100, "page": 1, "limit": 25 }
```

### Query params chung
- `search` — keyword search qua ILIKE (case-insensitive)
- `page` — default 1
- `limit` — default 25
- `sort` — tuỳ module

### Search: dùng PostgreSQL `ILIKE` qua TypeORM
- Single field: `{ name: ILike(`%${search}%`) }`
- Multi-field: dùng mảng `FindOptionsWhere` với OR (TypeORM tự combine)

### Sort: switch-case map string → `FindOptionsOrder`

---

## 1. Products Admin (`GET /api/admin/products`)

### Files
- **NEW** `src/modules/product/dtos/admin-product-query.dto.ts`
- **MODIFY** `src/modules/product/product.service.ts` — thêm `findAllAdmin()`
- **MODIFY** `src/modules/product/admin-product.controller.ts` — thêm `@Get()`

### Query DTO fields
| Param       | Type   | Required | Mô tả                                    |
|-------------|--------|----------|------------------------------------------|
| search      | string | No       | Tìm trong name, slug, sku, description   |
| status      | string | No       | active / disabled / all                  |
| category    | string | No       | Filter theo category slug                |
| badge       | string | No       | new / sale / bestseller                  |
| sort        | string | No       | price_asc, price_desc, newest, oldest, name_asc, name_desc |
| page        | number | No       | Default 1                                |
| limit       | number | No       | Default 25                               |

### Service logic
1. Build `where` với điều kiện status, category (slug→ID), badge
2. Nếu có `search` → wrap `where` trong mảng OR conditions cho name, slug, sku, description
3. Sort theo sort param
4. Pagination: `skip = (page-1)*limit`, `take = limit`
5. Relations: `['category', 'subcategory']`

---

## 2. Categories Admin (`GET /api/admin/categories`)

### Files
- **NEW** `src/modules/category/dtos/admin-category-query.dto.ts`
- **MODIFY** `src/modules/category/category.service.ts` — thêm `findAllAdmin()`
- **MODIFY** `src/modules/category/admin-category.controller.ts` — thêm `@Get()`

### Query DTO fields
| Param   | Type   | Required | Mô tả                                    |
|---------|--------|----------|------------------------------------------|
| search  | string | No       | Tìm trong slug, title, description       |
| sort    | string | No       | title_asc, title_desc, newest, oldest    |
| page    | number | No       | Default 1                                |
| limit   | number | No       | Default 25                               |

### Service logic
- Search: ILIKE trên slug, title, description
- Sort + Pagination như pattern chung
- Relations: `['subcategories']` (eager nên tự động load, nhưng vẫn nên explicit)

---

## 3. Collections Admin (`GET /api/admin/collections`)

### Files
- **NEW** `src/modules/collection/dtos/admin-collection-query.dto.ts`
- **MODIFY** `src/modules/collection/collection.service.ts` — thêm `findAllAdmin()`
- **MODIFY** `src/modules/collection/admin-collection.controller.ts` — thêm `@Get()`

### Query DTO fields
| Param   | Type   | Required | Mô tả                                    |
|---------|--------|----------|------------------------------------------|
| search  | string | No       | Tìm trong slug, name, description, season|
| season  | string | No       | Filter theo season                       |
| sort    | string | No       | name_asc, name_desc, newest, oldest      |
| page    | number | No       | Default 1                                |
| limit   | number | No       | Default 25                               |

### Service logic
- Search: ILIKE trên slug, name, description, season
- Filter: season (string match)
- Relations: `['products']`

---

## 4. Orders Admin — nâng cấp (`GET /api/admin/orders`)

### Files
- **NEW** `src/modules/order/dtos/admin-order-query.dto.ts`
- **MODIFY** `src/modules/order/order.service.ts` — enhance `findAllAdmin()` thêm search
- **MODIFY** `src/modules/order/admin-order.controller.ts` — dùng Query DTO thay vì param rời

### Query DTO fields
| Param   | Type   | Required | Mô tả                                    |
|---------|--------|----------|------------------------------------------|
| search  | string | No       | Tìm trong userId, note, shippingAddress  |
| status  | string | No       | pending/confirmed/shipping/delivered/... |
| sort    | string | No       | newest, oldest, total_asc, total_desc    |
| page    | number | No       | Default 1                                |
| limit   | number | No       | Default 25                               |

---

## Thứ tự implement
1. **Products** — phức tạp nhất, nhiều filter/search field nhất
2. **Categories** — đơn giản
3. **Collections** — có thêm season filter
4. **Orders** — nâng cấp từ code có sẵn

## Pattern code cho Service (ví dụ Products)

```typescript
async findAllAdmin(query: AdminProductQueryDto) {
  const { search, status, category, badge, sort, page = 1, limit = 25 } = query;

  // Build base where
  const where: FindOptionsWhere<Product>[] = [{}];
  if (status) where[0].status = status;
  if (badge) where[0].badge = badge;
  if (category) {
    const cat = await this.categoryRepo.findOne({ where: { slug: category } });
    if (cat) where[0].category = { id: cat.id };
    else return { data: [], total: 0, page, limit };
  }

  // Search: OR across multiple columns
  if (search) {
    const like = ILike(`%${search}%`);
    where.length = 0;
    where.push(
      { name: like, ...conditions },
      { slug: like, ...conditions },
      { sku: like, ...conditions },
      { description: like, ...conditions },
    );
  }

  // Sort
  let order: FindOptionsOrder<Product> = { createdAt: 'DESC' };
  switch (sort) { ... }

  const [data, total] = await this.productRepo.findAndCount({
    where,
    relations: ['category', 'subcategory'],
    order,
    skip: (page - 1) * limit,
    take: limit,
  });

  return { data, total, page, limit };
}
```
