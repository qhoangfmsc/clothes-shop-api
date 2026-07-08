# Database Migration

## Nguyên tắc chung

- **KHÔNG BAO GIỜ** tự tạo file migration bằng tay hoặc để AI sinh file migration với timestamp ngẫu nhiên.
- Mọi migration mới **PHẢI** được tạo thông qua lệnh CLI để đảm bảo timestamp chính xác và nhất quán.

## Tạo migration mới

### Khi thay đổi entity (auto-generate từ schema diff)

```bash
yarn migration:generate <TênAction>
```

Ví dụ:

```bash
yarn migration:generate AddCategorySlugColumn
yarn migration:generate CreateOrderTable
yarn migration:generate RemoveDeprecatedFields
```

Lệnh này sẽ so sánh entity hiện tại với database schema và tự động sinh file migration tại `src/migrations/<timestamp>-<TênAction>.ts`.

### Khi cần migration thủ công (seed data, raw SQL)

```bash
yarn migration:create <TênAction>
```

Lệnh này tạo file migration rỗng để viết logic tùy chỉnh (seed data, index, trigger...).

## Quy tắc đặt tên

- Dùng **PascalCase** cho tên action: `AddPostScheduleColumns`, `CreateUserTable`, `UpdateProductPricing`
- Tên action phải **mô tả rõ ràng** hành động của migration
- Prefix gợi ý: `Add`, `Create`, `Remove`, `Update`, `Drop`, `Rename`, `Alter`

## Các lệnh migration thường dùng

| Lệnh | Mô tả |
|---|---|
| `yarn migration:generate <name>` | Sinh migration từ diff giữa entity và DB |
| `yarn migration:create <name>` | Tạo file migration rỗng |
| `yarn migration:run` | Chạy tất cả pending migration |
| `yarn migration:revert` | Revert migration gần nhất |

## Lưu ý quan trọng

- Migration file nằm tại `src/migrations/` và được auto-register qua `data-source.ts`
- Luôn dùng `IF NOT EXISTS` / `IF EXISTS` trong raw SQL để đảm bảo **idempotent**
- Luôn implement cả method `up()` và `down()` để có thể rollback
- **Không** sửa migration đã chạy trên production — tạo migration mới để fix
- Khi dev chạy `yarn dev`, migration sẽ tự động chạy trước khi start server
