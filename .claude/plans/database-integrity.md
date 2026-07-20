# Plan: Database Referential Integrity — FK Relations cho toàn bộ hệ thống

## Hiện trạng: 3 mối quan hệ bị đứt

```
✅ Category    ↔ SubCategory   (OneToMany/ManyToOne, CASCADE)        — OK
✅ User        → Address       (ManyToOne, CASCADE)                  — OK
✅ User        → Cart          (ManyToOne, CASCADE)                  — OK
✅ Cart        ↔ CartItem      (OneToMany/ManyToOne, CASCADE)        — OK
✅ CartItem    → Product       (ManyToOne, CASCADE)                  — OK
✅ User        → Order         (ManyToOne, SET NULL)                  — OK
✅ Order       ↔ OrderItem     (OneToMany/ManyToOne, CASCADE)        — OK
✅ OrderItem   → Product       (ManyToOne, SET NULL)                 — OK
✅ User        → Wishlist      (ManyToOne, CASCADE)                  — OK
✅ Product     → Wishlist      (ManyToOne, CASCADE)                  — OK
✅ Review      → User          (ManyToOne, SET NULL)                 — OK

🔴 Product     → Category      (string slug, NO FK)                 — BROKEN
🔴 Product     → SubCategory   (string slug, NO FK)                 — BROKEN
🔴 Review      → Product       (no @ManyToOne, no FK constraint)    — BROKEN
🔴 Collection  ↔ Product       (jsonb array, NO join table, NO FK)  — BROKEN
```

---

## Mục tiêu

Sau khi hoàn thành, **100% mối quan hệ** trong DB có FK constraint + TypeORM relation decorator:

```
✅ Product     → Category      (@ManyToOne, FK, ON DELETE RESTRICT)
✅ Product     → SubCategory   (@ManyToOne, FK, ON DELETE RESTRICT)
✅ Review      → Product       (@ManyToOne, FK, ON DELETE CASCADE)
✅ Collection  ↔ Product       (@ManyToMany, junction table, FK, ON DELETE CASCADE)
```

---

## Chi tiết từng phần

### 1. Product → Category / SubCategory

**Hiện tại:**
```
products.category     = 'tops'       (varchar slug)
products.subcategory  = 'tshirt'     (varchar slug)
```

**Sau khi sửa:**
```
products.category_id   = 'abc123...'  (FK → categories.id)
products.subcategory_id = 5           (FK → subcategories.id)
```

**Migration — 5 bước:**
```sql
-- 1. Thêm cột FK mới (nullable tạm)
ALTER TABLE products ADD COLUMN category_id VARCHAR(16);
ALTER TABLE products ADD COLUMN subcategory_id INT;

-- 2. Populate FK từ slug hiện có
UPDATE products p SET category_id = c.id
FROM categories c WHERE p.category = c.slug;

UPDATE products p SET subcategory_id = sc.id
FROM subcategories sc
JOIN categories c ON sc.category_id = c.id
WHERE p.subcategory = sc.slug AND p.category = c.slug;

-- 3. NOT NULL + FK constraint
ALTER TABLE products ALTER COLUMN category_id SET NOT NULL;
ALTER TABLE products ADD CONSTRAINT FK_products_category
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT;
ALTER TABLE products ADD CONSTRAINT FK_products_subcategory
  FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE RESTRICT;

-- 4. Xoá cột cũ
ALTER TABLE products DROP COLUMN category;
ALTER TABLE products DROP COLUMN subcategory;

-- 5. Xoá index cũ (tạo bởi InitSchema)
DROP INDEX IF EXISTS IDX_products_category;
DROP INDEX IF EXISTS IDX_products_subcategory;
```

**Entity changes:**
```typescript
// Product entity — thay 2 cột string bằng 2 relation
@ManyToOne(() => Category)
@JoinColumn({ name: 'category_id' })
category: Category;

@ManyToOne(() => SubCategory)
@JoinColumn({ name: 'subcategory_id' })
subcategory: SubCategory;
```

**DTO changes:**
```typescript
// CreateProductDto / UpdateProductDto
// category: string  →  categoryId: string
// subcategory: string → subcategoryId: number
```

**Service changes:**
- `ProductService.findAll` — join với Category/SubCategory để lọc bằng slug
- `ProductService.create` — SKU generation chuyển từ @BeforeInsert sang service layer
- Public API vẫn nhận `?category=tops` (slug), resolve ra ID bên trong
- Admin API dùng `categoryId`, `subcategoryId`

**Product.entity.ts — bỏ @BeforeInsert generateSku:**
- Chuyển logic generate SKU vào `ProductService.create()`

---

### 2. Review → Product

**Hiện tại:** `Review.productId` là plain column, không có `@ManyToOne`, không có FK constraint.

**Migration:**
```sql
ALTER TABLE reviews ADD CONSTRAINT FK_reviews_product
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
```

**Entity:**
```typescript
// Review entity — thêm relation
@ManyToOne(() => Product, { onDelete: 'CASCADE' })
@JoinColumn({ name: 'product_id' })
product: Product;
```

---

### 3. Collection ↔ Product (Many-to-Many)

**Hiện tại:** `Collection.productIds` là `jsonb` array — lưu mảng ID string.

**Sau khi sửa:** Junction table `collection_products` + `@ManyToMany`.

**Migration:**
```sql
-- 1. Tạo junction table
CREATE TABLE collection_products (
  collection_id VARCHAR(16) NOT NULL,
  product_id VARCHAR(16) NOT NULL,
  PRIMARY KEY (collection_id, product_id),
  CONSTRAINT FK_cp_collection FOREIGN KEY (collection_id)
    REFERENCES collections(id) ON DELETE CASCADE,
  CONSTRAINT FK_cp_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE CASCADE
);

-- 2. Migrate data từ jsonb array
INSERT INTO collection_products (collection_id, product_id)
SELECT c.id, p.value::text
FROM collections c, jsonb_array_elements_text(c.product_ids) p(value);

-- 3. Xoá cột jsonb cũ
ALTER TABLE collections DROP COLUMN product_ids;
```

**Entity:**
```typescript
// Collection entity
@ManyToMany(() => Product)
@JoinTable({
  name: 'collection_products',
  joinColumn: { name: 'collection_id', referencedColumnName: 'id' },
  inverseJoinColumn: { name: 'product_id', referencedColumnName: 'id' },
})
products: Product[];
```

**Service changes:**
- `CollectionService.findBySlug` — dùng `relations: ['products']` thay vì resolve thủ công
- `CollectionService.create/update` — dùng `products` array thay vì `productIds`
- Bỏ `ensureProductsExist` (FK constraint tự check)

**DTO changes:**
- `CreateCollectionDto` — `productIds?: string[]` vẫn giữ nhưng đổi tên hoặc giữ nguyên (FE chỉ gửi mảng ID)

---

## Danh sách file

### File mới (1)
| # | File | Mô tả |
|---|---|---|
| 1 | `src/migrations/XXXX-AddForeignKeyConstraints.ts` | Migration tổng: FK Product→Category, Product→SubCategory, Review→Product, Collection→Product |

### File sửa (14)
| # | File | Thay đổi |
|---|---|---|
| 2 | `src/modules/product/product.entity.ts` | Bỏ category/subcategory string, thêm @ManyToOne, bỏ generateSku |
| 3 | `src/modules/product/product.service.ts` | Cập nhật findAll (JOIN), create (SKU gen), update, validate |
| 4 | `src/modules/product/dtos/product.dto.ts` | categoryId, subcategoryId thay vì category, subcategory |
| 5 | `src/modules/product/admin-product.controller.ts` | (nhẹ) khớp với DTO mới |
| 6 | `src/modules/collection/collection.entity.ts` | Bỏ productIds, thêm @ManyToMany products |
| 7 | `src/modules/collection/collection.service.ts` | Dùng relations thay vì resolve thủ công, bỏ ensureProductsExist |
| 8 | `src/modules/collection/dtos/collection.dto.ts` | (nhẹ) |
| 9 | `src/modules/review/review.entity.ts` | Thêm @ManyToOne product |
| 10 | `src/modules/product/product.module.ts` | Import Category, SubCategory entities |
| 11 | `src/modules/cart/cart.service.ts` | Update query nếu có ảnh hưởng |
| 12 | `src/common/guards/permissions.guard.ts` | (ko đổi, chỉ check) |
| 13 | `src/modules/category/category.entity.ts` | Thêm @OneToMany products? (tuỳ chọn — inverse side) |

---

## ON DELETE strategy

| Relation | onDelete | Lý do |
|---|---|---|
| Product → Category | **RESTRICT** | Không cho xoá Category nếu còn Product tham chiếu |
| Product → SubCategory | **RESTRICT** | Không cho xoá SubCategory nếu còn Product tham chiếu |
| Review → Product | **CASCADE** | Xoá Product → xoá hết Review liên quan |
| Collection → Product (junction) | **CASCADE** | Xoá Product/Collection → xoá entry trong junction table |

---

## Thứ tự thực hiện

1. Migration — tạo FK constraint + migrate data
2. Entity — thêm TypeORM relation decorators
3. DTOs — cập nhật field names
4. Services — cập nhật query logic
5. Controllers — (nhẹ, chỉ khớp DTO)
6. Modules — thêm entity imports nếu cần
7. Lint + Build
