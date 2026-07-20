# Plan: Chuyển SubCategory sang nanoid16

## Vấn đề

`SubCategory` là entity **duy nhất** trong toàn bộ project dùng `@PrimaryGeneratedColumn('increment')` (numeric auto-increment). Tất cả entity khác đều extend `BaseEntity` với nanoid16 string PK. Không có lý do kỹ thuật nào cho sự khác biệt này.

Hệ quả:
- `CreateProductDto.categoryId: string` vs `subcategoryId: number` — 2 FK cùng vai trò nhưng khác kiểu
- `SubCategory.slug` không có `unique: true` → có thể trùng slug giữa 2 category khác nhau
- Product service: `validateSubcategoryBelongsToCategory(subCategoryId: number, categoryId: string)` — mixed types
- Không có `createdAt`/`updatedAt` → không thể sort/filter theo thời gian

## Files cần sửa

### 1. Entity
- **`src/modules/category/sub-category.entity.ts`** — extend `BaseEntity`, bỏ `@PrimaryGeneratedColumn`, thêm `unique: true` cho `slug`

### 2. DTO
- **`src/modules/product/dtos/product.dto.ts`** — `subcategoryId: number` → `subcategoryId: string` (cả CreateProductDto & UpdateProductDto)

### 3. Service
- **`src/modules/product/product.service.ts`** — `validateSubcategoryBelongsToCategory(subCategoryId: number, categoryId: string)` → `subCategoryId: string, categoryId: string`

### 4. Migration (file mới)
**`src/migrations/{timestamp}-MigrateSubcategoryToNanoid.ts`**

```sql
-- Bước 1: Drop FK constraint đang active
ALTER TABLE "products" DROP CONSTRAINT "FK_products_subcategory";

-- Bước 2: Thêm created_at, updated_at cho BaseEntity
ALTER TABLE "subcategories" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE "subcategories" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Bước 3: Thêm temporary column cho nanoid id
ALTER TABLE "subcategories" ADD COLUMN "new_id" VARCHAR(16);

-- Bước 4: (JS) Loop qua từng subcategory, generate nanoid16, set vào new_id
--         Đồng thời build map: old_id → new_id

-- Bước 5: Thêm temporary column trên products
ALTER TABLE "products" ADD COLUMN "new_subcategory_id" VARCHAR(16);

-- Bước 6: (JS) UPDATE products.new_subcategory_id = map[old_id]
--         Với từng old_id trong map, chạy:
--         UPDATE "products" SET "new_subcategory_id" = '<nanoid>' WHERE "subcategory_id" = <old_int>

-- Bước 7: Xóa old columns, rename new columns
ALTER TABLE "subcategories" DROP CONSTRAINT "PK_subcategories";
ALTER TABLE "subcategories" DROP COLUMN "id";
ALTER TABLE "subcategories" RENAME COLUMN "new_id" TO "id";
ALTER TABLE "subcategories" ADD CONSTRAINT "PK_subcategories" PRIMARY KEY ("id");

ALTER TABLE "products" DROP COLUMN "subcategory_id";
ALTER TABLE "products" RENAME COLUMN "new_subcategory_id" TO "subcategory_id";

-- Bước 8: Add FK constraint trở lại
ALTER TABLE "products" ADD CONSTRAINT "FK_products_subcategory" 
  FOREIGN KEY ("subcategory_id") REFERENCES "subcategories"("id") ON DELETE RESTRICT;

-- Bước 9: Add UNIQUE constraint cho subcategories.slug
ALTER TABLE "subcategories" ADD CONSTRAINT "UQ_subcategories_slug" UNIQUE ("slug");

-- Bước 10: Re-add NOT NULL constraint
ALTER TABLE "products" ALTER COLUMN "subcategory_id" SET NOT NULL;

-- Bước 11: Re-add index
CREATE INDEX "IDX_products_subcategory_id" ON "products" ("subcategory_id");
```

Lưu ý: `CK_subcategories_count` và `IDX_subcategories_category_id` vẫn giữ nguyên, không cần thay đổi.

## Rủi ro

- Migration này **đụng đến FK đang active** và thay đổi kiểu dữ liệu — phải cẩn thận thứ tự
- Seed data trong migration `1783478828862-SeedData.ts` có hard-code subcategory references bằng slug (không ảnh hưởng vì migration cũ đã chạy rồi)
- Nếu có data thật trên production → cần backup trước khi chạy
