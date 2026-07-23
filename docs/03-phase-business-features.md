# 💼 Phase 3: Core Business Features

> **Thời gian:** 2-3 tuần
> **Priority:** 🔴 HIGH — Các capability trực tiếp tạo doanh thu
> **Mục tiêu:** Hoàn thiện checkout thực tế với guest order, email, promo và image upload

---

## 1. Scope và thứ tự triển khai

Triển khai theo thứ tự sau để tránh làm lại:

1. **Email infrastructure** — dùng chung cho order confirmation, password/account events và notification
2. **Guest Checkout** — mở rộng order flow đang có
3. **Discount/Promo Engine** — tính discount trong cùng transaction checkout
4. **Cloudinary Image Upload** — giảm phụ thuộc vào URL raw trong admin

Không triển khai payment gateway trong phase này nếu chưa chốt provider, webhook contract và quy trình đối soát. Có thể thêm payment adapter sau khi order/discount model ổn định.

---

## 2. Email Infrastructure

### 🔵 Tạo Notification module

```
src/modules/notification/
├── notification.module.ts
├── notification.service.ts
├── mailer.service.ts
├── templates/
│   ├── order-confirmation.template.ts
│   ├── order-status.template.ts
│   └── welcome.template.ts
└── dto/
```

```bash
yarn add @nestjs-modules/mailer nodemailer handlebars
```

```typescript
// src/modules/notification/mailer.service.ts
@Injectable()
export class MailerService {
  async sendOrderConfirmation(order: Order, recipient: string) {
    return this.mailer.sendMail({
      to: recipient,
      subject: `Order ${order.id} confirmed`,
      template: 'order-confirmation',
      context: { order },
    });
  }
}
```

**Nguyên tắc:** Email gửi sau khi transaction checkout commit thành công. Không để lỗi SMTP làm rollback đơn hàng; dùng outbox hoặc queue ở phase production nếu cần retry đáng tin cậy.

### 🟢 Notification events

Tạo event contract nội bộ:

```typescript
export const NOTIFICATION_EVENTS = {
  ORDER_CREATED: 'order.created',
  ORDER_STATUS_CHANGED: 'order.status-changed',
  USER_CREATED: 'user.created',
} as const;
```

`OrderService` phát event sau checkout và sau update status. `NotificationService` subscribe để gửi email.

---

## 3. Guest Checkout

### 3.1 Data model

`Order.userId` hiện đã nullable. Bổ sung các trường cần thiết:

```typescript
// Order entity
@Column({ nullable: true })
userId: string | null;

@Column({ nullable: true })
guestEmail: string | null;

@Column({ nullable: true, unique: true })
trackingToken: string | null;
```

Tạo migration:

- `guest_email` nullable + index
- `tracking_token` nullable + unique index
- CHECK: guest order phải có `guest_email` nếu `user_id IS NULL`

### 3.2 DTO và endpoint

```typescript
// src/modules/order/dtos/create-guest-order.dto.ts
export class CreateGuestOrderDto extends CreateOrderDto {
  @IsEmail()
  guestEmail: string;

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;
}
```

```typescript
@Post('api/guest-orders')
@Public()
async guestCheckout(@Body() dto: CreateGuestOrderDto) {
  return this.orderService.guestCheckout(dto);
}
```

Guest checkout phải nhận **shipping address trực tiếp**, không yêu cầu Address entity thuộc user. Địa chỉ được snapshot vào Order như flow hiện tại.

### 3.3 Security rules

- `trackingToken` là random opaque token, không dùng order ID làm secret
- Guest chỉ được xem order qua token + email hoặc token đủ entropy
- Không cho guest update/cancel order sau khi đã confirmed
- Rate limit riêng cho guest checkout
- Không expose thông tin cá nhân trong lỗi “order not found”

### 3.4 Account conversion

Sau khi order thành công, trả về:

```typescript
{
  data: order,
  guest: true,
  trackingToken,
  account: { canCreate: true }
}
```

Tạo endpoint riêng ở phase sau để convert guest order vào tài khoản; không tự động tạo account nếu chưa có consent.

---

## 4. Discount / Promo Engine

### 4.1 Entities

```
src/modules/promotion/
├── promotion.entity.ts
├── promotion.service.ts
├── promotion.controller.ts
├── promotion.module.ts
├── dtos/
│   ├── create-promotion.dto.ts
│   ├── update-promotion.dto.ts
│   └── validate-promotion.dto.ts
└── admin-promotion.controller.ts
```

```typescript
export type PromotionType = 'percentage' | 'fixed';

@Entity('promotions')
export class Promotion extends BaseEntity {
  @Column({ unique: true }) code: string;
  @Column({ type: 'varchar' }) type: PromotionType;
  @Column({ type: 'numeric', precision: 12, scale: 2 }) value: number;
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 }) minOrderValue: number;
  @Column({ type: 'timestamptz' }) startsAt: Date;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @Column({ default: true }) isActive: boolean;
  @Column({ type: 'int', nullable: true }) usageLimit: number | null;
  @Column({ type: 'int', default: 0 }) usageCount: number;
}
```

Nếu cần giới hạn một lần/user, tạo `promotion_usages` với unique `(promotion_id, user_id)`.

### 4.2 Business rules

`PromotionService.validateAndCalculate()` phải kiểm tra trong transaction:

- Code tồn tại, active, nằm trong thời gian hiệu lực
- Subtotal đạt minimum order
- Chưa vượt usage limit
- Percentage trong khoảng 1-100
- Fixed discount không vượt subtotal
- Không áp dụng promotion đã dùng bởi cùng user nếu rule yêu cầu

```typescript
const discount = promotion.type === 'percentage'
  ? Math.floor(subtotal * promotion.value / 100)
  : promotion.value;

return Math.min(discount, subtotal);
```

Tại checkout, lock row promotion (`FOR UPDATE`) trước khi tăng `usageCount` để tránh race condition.

### 4.3 API

```text
GET  /api/promotions/validate?code=...
POST /api/admin/promotions
GET  /api/admin/promotions
PATCH /api/admin/promotions/:id
DELETE /api/admin/promotions/:id
```

Public validate chỉ trả kết quả cần cho checkout, không trả usage internals.

---

## 5. Image Upload — Cloudinary

### 5.1 Upload abstraction

```typescript
// src/modules/media/media.service.ts
export interface MediaStorage {
  upload(buffer: Buffer, options?: UploadOptions): Promise<UploadedMedia>;
  delete(publicId: string): Promise<void>;
}
```

Tạo `CloudinaryStorageService` implement interface. Không để controller phụ thuộc trực tiếp vào SDK để sau này thay provider không ảnh hưởng business code.

### 5.2 API

```text
POST   /api/admin/media/images       multipart/form-data
DELETE /api/admin/media/:publicId
```

Validation:

- MIME: jpeg, png, webp, avif
- File size tối đa: 10 MB
- Tối đa số file mỗi request
- Resize/transform theo preset server-side
- Không tin extension do client gửi

```typescript
@Post('images')
@Permissions(Permission.PRODUCT_UPDATE)
@UseInterceptors(FileInterceptor('file', {
  limits: { fileSize: 10 * 1024 * 1024 },
}))
async upload(@UploadedFile(new ImageFileValidationPipe()) file: Express.Multer.File) {
  return this.mediaService.upload(file.buffer);
}
```

### 5.3 Storage policy

- Product image: `products/{productId}/...`
- Không lưu binary trong PostgreSQL
- DB chỉ lưu secure URL + provider public ID nếu cần delete
- Khi xóa product, quyết định rõ: giữ ảnh để audit hay xóa ảnh sau retention period

---

## 6. Order Checkout Changes

Refactor `OrderService.checkout()` thành các bước riêng:

```typescript
async checkout(userId: string, dto: CreateOrderDto) {
  return this.dataSource.transaction(async (manager) => {
    const cart = await this.loadAndValidateCart(manager, userId);
    const pricing = await this.pricingService.calculate(cart, dto.promotionCode, manager);
    const order = await this.createOrder(manager, userId, dto, pricing);
    await this.createOrderItems(manager, order, cart);
    await this.clearCart(manager, cart.id);
    await this.promotionService.consume(pricing.promotion, manager);
    return this.loadOrder(manager, order.id);
  });
}
```

Bắt buộc lưu snapshot:

- subtotal
- discount amount
- shipping fee
- total
- promotion code
- giá từng order item

Không tính lại giá order cũ từ Product hiện tại.

---

## 7. Files Created/Changed

| File | Action |
|------|--------|
| `src/modules/notification/` | New module |
| `src/modules/order/order.entity.ts` | Add guest fields + pricing fields |
| `src/modules/order/order.service.ts` | Refactor checkout + guest checkout |
| `src/modules/order/order.controller.ts` | Add guest endpoint |
| `src/modules/promotion/` | New module + entities + DTOs |
| `src/modules/media/` | New upload module |
| `src/migrations/*GuestOrder*.ts` | New migration |
| `src/migrations/*Promotion*.ts` | New migration |
| `src/migrations/*OrderPricing*.ts` | New migration |
| `src/core/core.module.ts` | Register mailer/config |
| `.env.example` | Add SMTP + Cloudinary variables |

---

## 8. Dependencies

- Phase 0: test checkout transaction trước khi refactor
- Phase 1: dùng response pagination/validation conventions
- Phase 2: rate limit guest endpoint và upload endpoint

## 9. Test Coverage Target

- Guest checkout: happy path, invalid email, invalid address, token access, rate limit
- Promotion: percentage, fixed, expired, usage limit, concurrent usage
- Checkout pricing: free shipping + discount + total snapshot
- Mailer: event được phát sau commit; mail failure không làm mất order
- Upload: MIME invalid, size exceeded, provider failure
