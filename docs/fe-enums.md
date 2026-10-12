# Bảng giá trị enum cho FE

Giá trị gửi/nhận qua API là cột **Value** (đúng chữ, phân biệt hoa thường). Cột **Gợi ý hiển thị** chỉ là đề xuất cho UI.

## Product

| Field | Value | Gợi ý hiển thị |
|---|---|---|
| `badge` (có thể `null` = không gắn) | `new` | Mới |
| | `sale` | Giảm giá |
| | `bestseller` | Bán chạy |
| | `sold_out` | Hết hàng |
| | `limited` | Limited |
| | `custom_order` | Đặt thiết kế |
| `status` | `active` | Đang bán |
| | `disabled` | Ẩn |

`badge` mới: `sold_out`, `limited`, `custom_order` (3 giá trị đầu giữ nguyên). Gửi giá trị ngoài danh sách → 400. Dùng cho: tạo/sửa product, filter `?badge=` ở public và admin.
BE chỉ lưu và trả badge; **không** tự chặn đặt hàng với `sold_out`. FE hiển thị nhãn và quyết định có cho thêm vào giỏ hay không.

## User

| Field | Value |
|---|---|
| `role` | `user`, `admin` |
| `status` | `active`, `disabled` |

## Order

| Field | Value | Chuyển tiếp được tới |
|---|---|---|
| `status` | `pending` | `confirmed`, `cancelled` |
| | `confirmed` | `shipping`, `cancelled` |
| | `shipping` | `delivered` |
| | `delivered` | `completed` |
| | `completed` | (kết thúc) |
| | `cancelled` | (kết thúc) |

## Site config

| Field | Value |
|---|---|
| `key` | `SHOP_HERO_BANNERS`, `NEW_IN_HERO_BANNERS`, `COLLECTIONS_HERO_BANNERS`, `NAV_MENU_BANNERS` |
| `type` (BE tự suy ra từ key) | `BANNER`, `TEXT` (hiện cả 4 key đều là `BANNER`) |

## Sort (mọi API list): `field` = tăng dần, `-field` = giảm dần

| API | Field được sort | Mặc định |
|---|---|---|
| categories (public + admin) | `priority`, `title`, `createdAt` | `priority` |
| collections (public + admin) | `name`, `createdAt` | `-createdAt` |
| products (public + admin) | `price`, `name`, `createdAt` | `-createdAt` |
| orders public | `createdAt` | `-createdAt` |
| orders admin | `createdAt`, `total` | `-createdAt` |
| reviews | `rating`, `createdAt` | `-createdAt` |
| users admin | `name`, `email`, `createdAt` | `-createdAt` |
| media admin | `createdAt`, `name`, `size` | `-createdAt` |

## Phân trang (mọi API list)

`page` mặc định 1, `limit` mặc định **25**, tối đa **200**.
