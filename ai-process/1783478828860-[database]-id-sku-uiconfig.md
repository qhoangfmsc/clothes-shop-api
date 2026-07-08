# Quyết định: ID, SKU, và xóa category_ui_configs

**Thời điểm**: 2026-07-08T09:47:08+07:00
**Module**: database, product, category

---

## Quyết định

### 1. Tất cả ID phải là nanoid16
- **KHÔNG** được dùng ID tự chế (tops-1, col-1, rev-001, cat-tops...)
- **PHẢI** dùng `nanoid(16)` với alphabet `a-zA-Z0-9`
- Áp dụng cho MỌI bảng: users, products, categories, collections, reviews
- BaseEntity đã có `@BeforeInsert()` generate nanoid16

### 2. SKU auto-generate từ category + subcategory + slug
- Format: `{category}-{subcategory}-{slug}`
- Ví dụ: `tops-camisoles-silk-camisole-rose`
- KHÔNG gán manual SKU (OB-TP-001, OB-SK-002...)
- Product entity tự generate trong `@BeforeInsert()`

### 3. Xóa bảng category_ui_configs
- Bảng chứa hero_image, mood_image, tagline, accent_color, bg_tint
- User đánh giá không cần thiết
- FE sẽ handle UI config ở client-side hoặc trong layout code

## Lý do
- nanoid16 đảm bảo unique, không collision, không lộ business logic qua URL
- SKU auto-gen đảm bảo consistency, không phụ thuộc human input
- UIConfig là presentation concern, không thuộc về backend
