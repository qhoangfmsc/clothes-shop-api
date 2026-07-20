---
name: validation-standards
description: Quy chuẩn validate 3 tầng (DTO - Service - DB) cho production
metadata:
  type: project
---

# Validation Standards cho Production

Khi tạo CRUD hoặc endpoint mới trong dự án clothes-shop-api, PHẢI validate ở **3 tầng**:

## Tầng 1 — DTO (class-validator)
- `@IsNotEmpty()`, `@IsString()`, `@IsNumber()`, `@IsIn([...])` cho enum
- `@Min(0)`, `@MaxLength(...)` cho giá trị
- `@ArrayMinSize(1)` cho arrays bắt buộc không rỗng
- `@ValidateNested({ each: true })` + `@Type(() => NestedDto)` cho nested objects

## Tầng 2 — Service (Business Logic)
- **Unique check**: slug, SKU, email — dùng `ensureXxxUnique()` private method
- **FK existence**: verify categoryId/subcategoryId/productIds tồn tại
- **Cross-field**: subcategory ∈ category, originalPrice >= price
- **State transition**: validate status flow (vd: order pending→confirmed)
- **Self-protection**: không cho admin sửa role/status của chính mình
- **Catch DB errors**: try/catch FK RESTRICT → trả về error code đẹp
- Dùng `throwAppError(errorCode, message?)` từ `@common/exceptions/app.exception`

## Tầng 3 — Database (Migration CHECK/FK/UNIQUE)
- CHECK: price > 0, rating 1-5, status IN (...), role IN (...), subtotal >= 0
- FK: ON DELETE RESTRICT cho quan hệ bắt buộc, CASCADE cho quan hệ phụ thuộc, SET NULL cho historical data
- UNIQUE: slug, SKU, email, (category_id + slug) cho subcategories
- INDEX: tất cả FK columns + columns query thường xuyên

## Pattern
```typescript
async create(dto: CreateDto) {
  await this.ensureSlugUnique(dto.slug);           // unique check
  await this.validateCategory(dto.categoryId);      // FK exists
  await this.validateBusinessRule(dto);             // cross-field
  const entity = this.repo.create(dto);
  return { data: await this.repo.save(entity) };
}
```

**Why:** Validate ở 3 tầng đảm bảo nếu BE có bug, DB vẫn chặn được. Nếu DB throw lỗi thô, BE catch và trả về error code đẹp cho client.
**How to apply:** Mỗi khi tạo CRUD mới, thêm CHECK constraints vào migration, validate trong service, và dùng class-validator trong DTO.
