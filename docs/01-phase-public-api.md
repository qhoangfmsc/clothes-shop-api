# 🔍 Phase 1: Public API Completion

> **Thời gian:** 1 tuần
> **Priority:** 🔴 CRITICAL — FE không thể làm Search/Filter/Pagination nếu BE chưa có
> **Mục tiêu:** Tất cả public endpoint có Search + Pagination + Filter + Sort chuẩn chỉnh

---

## 1. Vấn đề hiện tại

Admin API đã có đầy đủ Search + Pagination + Filter + Sort. Public API thì:

| Tính năng | Admin API | Public API |
|-----------|-----------|------------|
| Search (`search` param, ILIKE) | ✅ | ❌ |
| Pagination (`page` + `limit`) | ✅ | ❌ (chỉ có `limit`) |
| Filter by status | ✅ | ❌ (code cứng `status='active'`) |
| Filter by category/badge | ✅ | ✅ (một số) |
| Sort (`sorts` field mapping) | ✅ | ✅ (3 options cơ bản) |

→ **Chiến lược:** Copy pattern từ Admin API, chuẩn hóa dùng chung DTO, thêm search + pagination vào tất cả public endpoint.

---

## 2. Task List

### 2.1 Chuẩn hóa Public DTO

#### 🟡 Tạo `PublicPaginationDto` extends `FindBaseDto`

```typescript
// src/common/dto/public-pagination.dto.ts
import { IsIn, IsOptional, IsString } from 'class-validator';
import { FindBaseDto } from './find-base.dto';

export class PublicPaginationDto extends FindBaseDto {
  @IsOptional()
  @IsString()
  @IsIn(['active', 'disabled', 'all'])
  status?: string = 'active'; // Public mặc định chỉ xem active
}
```

Lý do tạo class riêng thay vì dùng `FindBaseDto`:
- Public không được phép xem disabled products
- Public có thể có params khác admin (VD: filter theo category slug thay vì ID)
- Tách biệt rõ ràng để tránh lộ dữ liệu private

### 2.2 Products Public API — Thêm Search + Pagination

#### 🟡 Refactor `GET /api/products`

Hiện tại:
```typescript
@Get()
async findAll(
  @Query('category') category?: string,
  @Query('subcategory') subcategory?: string,
  @Query('badge') badge?: string,
  @Query('sort') sort?: string,
  @Query('limit') limit?: string,
)
```

Sau refactor:
```typescript
// src/modules/product/dtos/public-product-query.dto.ts
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PublicPaginationDto } from '@common/dto/public-pagination.dto';

export class PublicProductQueryDto extends PublicPaginationDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsOptional()
  @IsString()
  @IsIn(['new', 'sale', 'bestseller'])
  badge?: string;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsString()
  minPrice?: string;

  @IsOptional()
  @IsString()
  maxPrice?: string;

  @IsOptional()
  @IsString()
  sizes?: string;  // "S,M,L" → split & filter

  @IsOptional()
  @IsString()
  colors?: string; // "Red,Blue" → split & filter
}
```

```typescript
// src/modules/product/product.controller.ts (cập nhật)
@Get()
@ApiOperation({ summary: 'List products with search, filter, sort, pagination' })
@ApiQuery({ name: 'search', required: false })
@ApiQuery({ name: 'page', required: false })
@ApiQuery({ name: 'limit', required: false })
@ApiQuery({ name: 'sort', required: false, description: 'price_asc, price_desc, newest, name_asc, name_desc' })
async findAll(@Query() query: PublicProductQueryDto) {
  return this.productService.findAllPublic(query);
}
```

```typescript
// src/modules/product/product.service.ts (thêm method)
async findAllPublic(query: PublicProductQueryDto) {
  const { search, category, subcategory, badge, sort,
          minPrice, maxPrice, sizes, colors,
          page = 1, limit = 24 } = query;

  const qb = this.productRepo.createQueryBuilder('p')
    .leftJoinAndSelect('p.category', 'category')
    .leftJoinAndSelect('p.subcategory', 'subcategory')
    .where('p.status = :status', { status: 'active' });

  // Search: ILIKE trên name, slug, description
  if (search) {
    qb.andWhere('(p.name ILIKE :s OR p.slug ILIKE :s OR p.description ILIKE :s)',
      { s: `%${search}%` });
  }

  // Filter by category slug
  if (category) {
    qb.andWhere('category.slug = :catSlug', { catSlug: category });
  }

  // Filter by subcategory slug
  if (subcategory) {
    qb.andWhere('subcategory.slug = :subSlug', { subSlug: subcategory });
  }

  // Filter by badge
  if (badge) {
    qb.andWhere('p.badge = :badge', { badge });
  }

  // Filter by price range
  if (minPrice) {
    qb.andWhere('p.price >= :minPrice', { minPrice: Number(minPrice) });
  }
  if (maxPrice) {
    qb.andWhere('p.price <= :maxPrice', { maxPrice: Number(maxPrice) });
  }

  // Filter by sizes (array overlap)
  if (sizes) {
    const sizeArr = sizes.split(',').map(s => s.trim());
    qb.andWhere('p.sizes && :sizes', { sizes: sizeArr }); // PostgreSQL array overlap
  }

  // Filter by colors (JSONB matching)
  if (colors) {
    const colorArr = colors.split(',').map(c => c.trim());
    // colors là jsonb array [{name, hex}], dùng JSONB overlap
    qb.andWhere('EXISTS (SELECT 1 FROM jsonb_array_elements(p.colors) AS c WHERE c->>\'name\' IN (:...colors))',
      { colors: colorArr });
  }

  // Sort
  switch (sort) {
    case 'price_asc':   qb.orderBy('p.price', 'ASC'); break;
    case 'price_desc':  qb.orderBy('p.price', 'DESC'); break;
    case 'name_asc':    qb.orderBy('p.name', 'ASC'); break;
    case 'name_desc':   qb.orderBy('p.name', 'DESC'); break;
    case 'newest':
    default:            qb.orderBy('p.createdAt', 'DESC'); break;
  }

  // Pagination
  const [data, total] = await qb
    .skip((page - 1) * limit)
    .take(limit)
    .getManyAndCount();

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}
```

**Lưu ý:** Giữ lại method `findAll` cũ với tên mới hoặc deprecated 1 thời gian để FE migrate, sau đó xóa.

**Cách triển khai an toàn (không break FE):**
1. Thêm `findAllPublic` method mới
2. Route `GET /api/products` gọi `findAllPublic` khi có query param `search` hoặc `page`, nếu không thì fallback về `findAll` cũ
3. Sau khi FE update → xóa `findAll` cũ, chỉ dùng `findAllPublic`

### 2.3 Collections Public API — Thêm Search + Pagination

```typescript
// src/modules/collection/dtos/public-collection-query.dto.ts
export class PublicCollectionQueryDto extends PublicPaginationDto {
  @IsOptional() @IsString()
  sort?: string; // newest, name_asc, name_desc
}
```

Áp dụng pattern tương tự: `qb.where('c.status = :status', { status: 'active' })` + search trên `name`, `slug`, `description`.

### 2.4 Categories Public API — Thêm Search + Pagination

```typescript
// src/modules/category/dtos/public-category-query.dto.ts
export class PublicCategoryQueryDto extends PublicPaginationDto {
  @IsOptional() @IsString()
  sort?: string;
}
```

### 2.5 Reviews Public API — Thêm Pagination

```typescript
// src/modules/review/dtos/public-review-query.dto.ts
export class PublicReviewQueryDto extends PublicPaginationDto {
  @IsOptional() @IsString()
  productId?: string;

  @IsOptional() @IsString()
  sort?: string; // newest, rating_desc, rating_asc
}
```

### 2.6 Orders Public API — Thêm Pagination

```typescript
// src/modules/order/dtos/public-order-query.dto.ts
export class PublicOrderQueryDto extends PublicPaginationDto {
  @IsOptional() @IsString()
  @IsIn(['pending', 'confirmed', 'shipping', 'delivered', 'completed', 'cancelled'])
  status?: string;

  @IsOptional() @IsString()
  sort?: string;
}
```

### 2.7 Permission Sync Endpoint

#### 🟢 `GET /api/admin/permissions`

```typescript
// src/modules/auth/auth.controller.ts (thêm route)
@Get('api/admin/permissions')
@ApiBearerAuth()
@ApiOperation({ summary: 'Lấy danh sách tất cả permissions' })
async getPermissions() {
  return {
    data: Object.entries(Permission)
      .filter(([key]) => isNaN(Number(key))) // Lọc ra enum keys
      .map(([key, value]) => ({ code: value, name: key })),
  };
}
```

FE gọi 1 lần khi admin login, cache vào memory → không cần sync thủ công nữa.

---

## 3. Response Format Chuẩn Hóa

Tất cả public endpoints trả về format thống nhất:

```typescript
// Chuẩn cho list
{
  data: T[],
  total: number,
  page: number,
  limit: number,
  totalPages: number
}

// Chuẩn cho single item
{
  data: T,
  related?: T[]  // Nếu có related items (VD: product detail)
}
```

---

## 4. Phụ thuộc

- ✅ **Phase 0** — Cần test để verify refactor không break API cũ

---

## 5. Tech Stack Additions

Không cần package mới. Chỉ dùng các package hiện có: `class-validator`, `class-transformer`, TypeORM QueryBuilder.

---

## 6. Files Created/Changed

| File | Action | Type |
|------|--------|------|
| `src/common/dto/public-pagination.dto.ts` | New | 🔵 |
| `src/modules/product/dtos/public-product-query.dto.ts` | New | 🔵 |
| `src/modules/product/product.controller.ts` | Modify | 🟡 |
| `src/modules/product/product.service.ts` | Modify (thêm method) | 🟢 |
| `src/modules/collection/dtos/public-collection-query.dto.ts` | New | 🔵 |
| `src/modules/collection/collection.controller.ts` | Modify | 🟡 |
| `src/modules/collection/collection.service.ts` | Modify | 🟡 |
| `src/modules/category/dtos/public-category-query.dto.ts` | New | 🔵 |
| `src/modules/category/category.controller.ts` | Modify | 🟡 |
| `src/modules/category/category.service.ts` | Modify | 🟡 |
| `src/modules/review/dtos/public-review-query.dto.ts` | New | 🔵 |
| `src/modules/review/review.controller.ts` | Modify | 🟡 |
| `src/modules/review/review.service.ts` | Modify | 🟡 |
| `src/modules/order/dtos/public-order-query.dto.ts` | New | 🔵 |
| `src/modules/order/order.controller.ts` | Modify | 🟡 |
| `src/modules/order/order.service.ts` | Modify | 🟡 |
| `src/modules/auth/auth.controller.ts` | Modify (thêm route) | 🟢 |
| `test/unit/services/product.service.spec.ts` | Modify (thêm test case) | 🟢 |

---

## 7. Test Coverage Target

| Module | Test cases |
|--------|-----------|
| ProductService.findAllPublic | search, pagination, filter category, filter price range, filter sizes, filter colors, sort, combine search+filter |
| CollectionService.findAllPublic | search + pagination |
| CategoryService.findAllPublic | search + pagination |
| ReviewService.findAllPublic | pagination + filter productId |
| GET /api/admin/permissions | trả về đúng format, đủ permissions |
