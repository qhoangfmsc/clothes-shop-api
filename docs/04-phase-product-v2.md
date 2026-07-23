# 📦 Phase 4: Product System v2

> **Thời gian:** 2-3 tuần
> **Priority:** 🔴 HIGH — Tồn kho theo variant là nền tảng vận hành fashion store
> **Mục tiêu:** Thay mô hình `sizes[] + colors[]` phẳng bằng ProductVariant có SKU, stock, price và status riêng

---

## 1. Vì sao cần refactor

Mô hình hiện tại:

```text
Product.sizes = ['S', 'M', 'L', 'XL']
Product.colors = [{ name: 'Red', hex: '#FF0000' }]
CartItem = productId + size + color
```

Không thể:

- Theo dõi tồn kho cho từng size + màu
- Đặt SKU khác nhau theo variant
- Gán giá riêng cho XL hoặc màu đặc biệt
- Disable một variant hết hàng
- Atomically reserve/decrement stock khi checkout

**Không migrate thẳng một lần.** Dùng compatibility window để FE chuyển dần sang `variantId`.

---

## 2. Target Data Model

### 2.1 ProductVariant entity

```typescript
// src/modules/product/product-variant.entity.ts
@Entity('product_variants')
@Unique(['productId', 'size', 'color'])
export class ProductVariant extends BaseEntity {
  @Column()
  productId: string;

  @ManyToOne(() => Product, (product) => product.variants, { onDelete: 'CASCADE' })
  product: Product;

  @Column({ unique: true })
  sku: string;

  @Column({ length: 50 })
  size: string;

  @Column({ length: 100 })
  color: string;

  @Column({ length: 20, nullable: true })
  colorHex: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  priceOverride: number | null;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ type: 'varchar', default: 'active' })
  status: 'active' | 'disabled';

  @Column({ type: 'int', default: 0 })
  reservedStock: number;
}
```

DB constraints:

```sql
CHECK (stock >= 0);
CHECK (reserved_stock >= 0 AND reserved_stock <= stock);
CHECK (status IN ('active', 'disabled'));
UNIQUE (product_id, size, color);
CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_product_variants_sku ON product_variants(sku);
```

### 2.2 CartItem và OrderItem

```typescript
// CartItem
@Column({ nullable: true })
variantId: string | null;

@ManyToOne(() => ProductVariant, { nullable: true, onDelete: 'RESTRICT' })
variant: ProductVariant | null;
```

```typescript
// OrderItem — snapshot bất biến
@Column({ nullable: true })
variantId: string | null;

@Column({ nullable: true })
variantSku: string | null;

@Column({ nullable: true })
variantLabel: string | null; // e.g. "M / Red"
```

Giữ `size` và `color` trên CartItem/OrderItem trong compatibility period và để đọc order cũ.

---

## 3. Migration Strategy

### Step 1 — Additive migration

Tạo `product_variants`, add nullable `variant_id` vào cart/order items. Không xóa columns cũ.

### Step 2 — Data backfill

Tạo một variant cho mỗi combination có thể có từ `Product.sizes × Product.colors`:

```text
Product P:
  sizes = [S, M, L]
  colors = [Red, Blue]

→ 6 ProductVariant records
```

Nếu product không có colors/sizes hợp lệ, ghi migration report và không tự tạo dữ liệu mơ hồ.

SKU generation phải deterministic nhưng vẫn kiểm tra collision:

```text
{product.sku}-{normalized-size}-{normalized-color}
```

### Step 3 — Dual read/write

- FE mới gửi `variantId`
- BE vẫn nhận `size + color` trong thời gian chuyển tiếp
- Nếu có `variantId`, verify variant thuộc product và active
- Nếu chỉ có size/color, resolve đúng một variant
- Nếu không resolve được, trả error code rõ ràng

### Step 4 — Enforce variantId

Sau khi FE và data đã migrate:

- `variant_id` trở thành NOT NULL cho cart items mới
- Xóa fallback size/color khỏi create DTO
- Giữ snapshot columns trên order items để backward compatibility

### Step 5 — Cleanup

Chỉ xóa `Product.sizes/colors` sau khi kiểm tra production data và FE không còn đọc chúng. Đây là breaking migration riêng, không gộp vào migration tạo variant.

---

## 4. DTO và API

### Admin

```text
POST  /api/admin/products/:productId/variants
GET   /api/admin/products/:productId/variants
PATCH /api/admin/products/:productId/variants/:variantId
DELETE /api/admin/products/:productId/variants/:variantId
POST  /api/admin/products/:productId/variants/bulk
```

### Public

`GET /api/products/:id` trả:

```json
{
  "data": {
    "id": "...",
    "name": "...",
    "price": 100,
    "variants": [
      {
        "id": "...",
        "size": "M",
        "color": "Red",
        "colorHex": "#ff0000",
        "price": 100,
        "stock": 3,
        "available": true
      }
    ]
  }
}
```

Public không trả `reservedStock`, internal audit fields hoặc cost data.

### Cart DTO

```typescript
export class AddToCartDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  @IsOptional()
  variantId?: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}
```

Nếu dùng nanoid thay UUID trong project, thay decorator bằng validator phù hợp hiện có; không đổi ID strategy chỉ vì feature này.

---

## 5. Stock Consistency

### 5.1 Add to cart

Không decrement stock khi add cart. Chỉ kiểm tra `availableStock >= requestedQuantity` để UX tốt hơn; checkout mới là source of truth.

### 5.2 Checkout locking

Trong transaction:

```sql
SELECT *
FROM product_variants
WHERE id IN (...)
FOR UPDATE;
```

Sau khi lock:

```typescript
if (variant.stock - variant.reservedStock < quantity) {
  throwAppError(EProductErrorCode.PRODUCT_VARIANT_OUT_OF_STOCK);
}

variant.stock -= quantity;
await manager.save(variant);
```

Nếu chọn reservation model, tách `availableStock = stock - reservedStock` và tạo expiration/release job. MVP nên decrement khi order tạo, hoàn stock khi cancel trước fulfillment.

### 5.3 State transitions

- `pending → cancelled`: restore stock trong transaction
- `pending → confirmed`: giữ stock đã decrement
- `shipping/completed`: không restore
- Chặn quantity âm và double cancellation

Bổ sung service method riêng `restoreStockForOrder()` để tái sử dụng khi cancel/return.

---

## 6. Size Guide theo Product

Bổ sung:

```text
Product.sizeGuideId nullable FK → size_guides.id
```

Public response ưu tiên:

1. Product-specific size guide
2. Category default size guide
3. Static fallback hiện tại

Không migrate static data sang DB nếu chưa cần admin chỉnh sửa; có thể tạo adapter để giữ backward compatibility.

---

## 7. Files Created/Changed

| File | Action |
|------|--------|
| `src/modules/product/product-variant.entity.ts` | New |
| `src/modules/product/product-variant.service.ts` | New |
| `src/modules/product/dtos/product-variant.dto.ts` | New |
| `src/modules/product/admin-product-variant.controller.ts` | New |
| `src/modules/product/product.entity.ts` | Add variants relation + sizeGuideId |
| `src/modules/cart/cart-item.entity.ts` | Add nullable variantId |
| `src/modules/cart/dtos/cart.dto.ts` | Add variantId |
| `src/modules/cart/cart.service.ts` | Resolve and validate variant |
| `src/modules/order/order-item.entity.ts` | Add variant snapshot |
| `src/modules/order/order.service.ts` | Lock/decrement/restore stock |
| `src/common/exceptions/error-codes.ts` | Add variant/stock errors |
| `src/migrations/*ProductVariants*.ts` | New schema + indexes |
| `src/migrations/*BackfillVariants*.ts` | New data migration |

---

## 8. Test Coverage Target

- Variant CRUD: duplicate combination, duplicate SKU, FK ownership
- Cart: variant belongs to product, disabled variant, insufficient stock
- Checkout: concurrent stock requests, rollback, cancel restore
- Migration: backfill count and deterministic SKU
- API: public response excludes internal stock fields

## 9. Dependencies

- Phase 0 tests are mandatory before schema migration
- Phase 3 checkout pricing refactor should land first or be merged carefully
- Phase 5 return/refund depends on stock restore logic from this phase
