# Database & Entity Conventions

## ID Rules — STRICT

- **Tất cả bảng** sử dụng `id VARCHAR(16)` primary key
- ID **PHẢI** là nanoid16 (alphabet: `a-zA-Z0-9`, length: 16)
- **TUYỆT ĐỐI KHÔNG** dùng ID tự chế (ví dụ: `tops-1`, `col-1`, `cat-tops`, `rev-001`)
- **TUYỆT ĐỐI KHÔNG** dùng UUID, auto-increment cho bảng chính
- BaseEntity (`@common/base/base.entity.ts`) đã có `@BeforeInsert()` tự generate nanoid16
- Khi tạo seed data trong migration, dùng `customAlphabet` từ `nanoid` để generate

## SKU Rules — Products

- SKU **PHẢI** auto-generate từ: `{category}-{subcategory}-{slug}`
- Product entity có `@BeforeInsert()` tự tạo SKU nếu chưa có
- **KHÔNG** gán SKU thủ công
- SKU là unique, dùng cho inventory/admin reference

## Entity Rules

- Mỗi entity kế thừa `BaseEntity` (có sẵn `id`, `createdAt`, `updatedAt`)
- Column names trong DB dùng `snake_case`
- Property names trong entity dùng `camelCase`
- Sử dụng `JSONB` cho arrays/objects (sizes, colors, tags, images, productIds)
- FK columns luôn suffix `_id` (ví dụ: `category_id`, `user_id`)
- Nullable FK dùng `onDelete: 'SET NULL'`
- Required FK dùng `onDelete: 'CASCADE'`

## Migration Rules

- File name: `{Date.now()}-{DescriptiveName}.ts` (timestamp lấy từ `node -e "console.log(Date.now())"`)
- Class name khớp với file: `DescriptiveName{timestamp}`
- Seed data: generate nanoid16 IDs, KHÔNG dùng hardcoded string IDs
- Khi cần reference giữa các bảng, dùng biến để giữ mapping

## Bảng hiện tại

| Bảng | ID Type | Notes |
|------|---------|-------|
| users | nanoid16 | |
| products | nanoid16 | SKU auto-gen |
| categories | nanoid16 | |
| subcategories | SERIAL (auto-increment) | Child of category |
| collections | nanoid16 | productIds là JSONB array |
| reviews | nanoid16 | userId nullable FK |

## Bảng KHÔNG tạo

- `category_ui_configs` — presentation concern, handle ở FE
