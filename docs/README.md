# Clothes Shop API — Tài liệu BE theo module

Thư mục này là tài liệu thực tế của backend: mỗi module một file, chỉ mô tả những gì **đang có** trong code. Không chứa tài liệu cho FE, roadmap hay kế hoạch.

Quy tắc viết: `.claude/rules/module-docs.md` · Quy trình: skill `module-docs` · Template: `.claude/skills/module-docs/TEMPLATE.md`.

Cập nhật lần cuối: 2026-10-12

## Hệ thống

NestJS 11 + TypeORM 0.3 + PostgreSQL, xác thực JWT (Passport) với đăng nhập Google, Swagger tại `/api-docs`. Cửa hàng thời trang (thương hiệu DOOVAN): catalog sản phẩm, danh mục, bộ sưu tập, giỏ hàng, đặt hàng, quản trị, upload ảnh qua Supabase Storage.

Toàn bộ module được khai báo trong `src/main.module.ts`. Hai guard toàn cục (`JwtAuthGuard`, `PermissionsGuard`) áp cho mọi route; route công khai đánh dấu `@Public()`.

## Danh sách module

| Module | Thư mục | Route prefix | Loại | Mô tả ngắn |
|---|---|---|---|---|
| [common & core](modules/common.md) | `src/common`, `src/core`, `src/migrations` | `/`, `/health`, `/api-docs` | Hạ tầng | Guard, phân trang/sort/search, error code, permission, bootstrap, migration |
| [auth](modules/auth.md) | `src/modules/auth` | `/api/auth` | DB (qua `users`) | Đăng nhập Google, JWT access/refresh, thông tin phiên |
| [user](modules/user.md) | `src/modules/user` | `/api/admin/users` | DB | Entity người dùng, quản trị role/status/permissions |
| [product](modules/product.md) | `src/modules/product` | `/api/products`, `/api/admin/products` | DB | Sản phẩm: list/detail/autocomplete, CRUD admin |
| [category](modules/category.md) | `src/modules/category` | `/api/categories`, `/api/admin/categories` | DB | Danh mục + subcategory, thứ hạng `priority` |
| [collection](modules/collection.md) | `src/modules/collection` | `/api/collections`, `/api/admin/collections` | DB | Bộ sưu tập gom sản phẩm |
| [review](modules/review.md) | `src/modules/review` | `/api/reviews` | DB | Đánh giá sản phẩm (chỉ đọc) |
| [wishlist](modules/wishlist.md) | `src/modules/wishlist` | `/api/wishlist` | DB | Sản phẩm yêu thích của user |
| [cart](modules/cart.md) | `src/modules/cart` | `/api/cart` | DB | Giỏ hàng của user |
| [address](modules/address.md) | `src/modules/address` | `/api/addresses` | DB | Sổ địa chỉ giao hàng |
| [order](modules/order.md) | `src/modules/order` | `/api/orders`, `/api/admin/orders` | DB | Checkout từ giỏ, lịch sử đơn, quản trị trạng thái đơn |
| [media](modules/media.md) | `src/modules/media` | `/api/admin/media` | DB + Supabase Storage | Upload/list/xoá ảnh |
| [site-config](modules/site-config.md) | `src/modules/site-config` | `/api/site-config`, `/api/admin/site-config` | DB | Cấu hình nội dung trang (banner) theo key |
| [shipping](modules/shipping.md) | `src/modules/shipping` | `/api/shipping` | Dữ liệu tĩnh | Phương thức vận chuyển, chính sách đổi trả |
| [size-guide](modules/size-guide.md) | `src/modules/size-guide` | `/api/size-guides` | Dữ liệu tĩnh | Bảng size theo danh mục |

## Quan hệ giữa các module

```
auth ──► user (users)
product ──► category (categories, subcategories)
collection ──► product (collection_products)
review ──► product, user
wishlist ──► product, user
cart ──► product, user
address ──► user
order ──► cart, address, product, user   (checkout đọc Cart/CartItem/Address qua EntityManager)
media ──► Supabase Storage (độc lập, ảnh được tham chiếu bằng URL chuỗi ở product/collection/category/site-config)
```
