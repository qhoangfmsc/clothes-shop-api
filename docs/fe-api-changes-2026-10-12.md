# Thay đổi API cần FE recheck — 2026-10-12

Tài liệu cho FE (client + admin). Mục nào đánh dấu **BREAKING** sẽ làm request cũ trả 400 hoặc đổi kết quả mà không báo lỗi.

## 1. Chuẩn chung cho mọi API list

| | Trước | Sau |
|---|---|---|
| Tham số sort | `sort` (đa số), `sorts` (chỉ media) | **`sort`** ở mọi API |
| Cú pháp | mỗi module một kiểu (`newest`, `price_asc`, `name_desc`, `-field`...) | `sort=field` = tăng dần, `sort=-field` = giảm dần, **một field** |
| `limit` tối đa | public 100, admin không giới hạn, media 100 | **200 ở mọi API list** (>200 → 400) |
| `limit` mặc định | public 24, admin 25, media 24 | **25 ở mọi API** (**BREAKING nhẹ**: public và media từ 24 → 25) |
| Response | admin list thiếu `totalPages` | mọi list: `{ data, total, page, limit, totalPages }` (chỉ thêm field) |

Giá trị `sort` ngoài whitelist trả **400**. Do bật `forbidNonWhitelisted`, gửi tham số lạ (ví dụ `sorts`) cũng trả **400**.

## 2. Public API — đổi giá trị `sort` (BREAKING)

| API | Cũ → Mới |
|---|---|
| `GET /api/categories` | `title_asc` → `title` · `title_desc` → `-title` · `newest` → `-createdAt` |
| `GET /api/collections` | `name_asc` → `name` · `name_desc` → `-name` · `newest` → `-createdAt` |
| `GET /api/products` | `price_asc` → `price` · `price_desc` → `-price` · `name_asc` → `name` · `name_desc` → `-name` · `newest` → `-createdAt` |
| `GET /api/orders` | `newest` → `-createdAt` · `oldest` → `createdAt` |
| `GET /api/reviews/:productId` | `newest` → `-createdAt` · `rating_desc` → `-rating` · `rating_asc` → `rating` |

Field được phép sort:
- categories: `priority`, `title`, `createdAt` (mặc định `priority`)
- collections: `name`, `createdAt` (mặc định `-createdAt`)
- products: `price`, `name`, `createdAt` (mặc định `-createdAt`)
- orders: `createdAt` (mặc định `-createdAt`)
- reviews: `rating`, `createdAt` (mặc định `-createdAt`)

**Mặc định của `GET /api/categories` đổi:** trước là mới nhất trước (`-createdAt`), giờ là `priority` (1 = hiển thị đầu). Muốn giữ kiểu cũ thì gửi `sort=-createdAt`.

## 3. Admin API — chiều sort bị ĐẢO (BREAKING, không báo lỗi)

Trước đây ở admin: `field` = giảm dần, `-field` = tăng dần. **Giờ ngược lại** cho khớp chuẩn chung.

| Muốn | Trước | Sau |
|---|---|---|
| Mới nhất trước | `sort=createdAt` | `sort=-createdAt` |
| Cũ nhất trước | `sort=-createdAt` | `sort=createdAt` |
| Giá cao → thấp | `sort=price` | `sort=-price` |
| Tên A → Z | `sort=-name` | `sort=name` |

Áp dụng cho: `GET /api/admin/categories`, `/collections`, `/products`, `/orders`, `/users`. Cần rà mọi nơi FE admin gọi các API này kèm `sort`, và mọi nút sort trên bảng.

Field được phép sort (mặc định khi không gửi `sort`):
- admin categories: `priority`, `title`, `createdAt` (mặc định **`priority`**, trước là `-createdAt` theo quy ước cũ)
- admin collections: `name`, `createdAt` (`-createdAt`)
- admin products: `price`, `createdAt`, `name` (`-createdAt`)
- admin orders: `createdAt`, `total` (`-createdAt`)
- admin users: `name`, `email`, `createdAt` (`-createdAt`)

## 4. Media (`GET /api/admin/media`) — BREAKING

- `sorts` → **`sort`**. Chỉ một field: `createdAt`, `name`, `size` (`-` cho giảm dần). Không còn sort nhiều field bằng dấu phẩy.
- `limit` tối đa 100 → 200. Mặc định 24 → **25**. `search` tối đa 255 ký tự.
- Response không đổi: `{ data, total, page, limit, totalPages }`.

## 5. Category: `priority` (tính năng mới + BREAKING nhỏ)

`priority` là thứ hạng **duy nhất**, 1 = ưu tiên cao nhất, không có 0 hay số âm, không trùng.

- Mọi response category (public + admin) có thêm field `priority`.
- **Tạo mới** (`POST /api/admin/categories`): **không được gửi `priority`** (gửi sẽ 400). Server tự xếp cuối (`max + 1`).
- **Cập nhật** (`PATCH /api/admin/categories/:id`): `priority` tuỳ chọn, số nguyên `>= 1`. Category được chuyển tới vị trí đó, các category còn lại tự dịch chỗ. Ngoài khoảng `1..N` → lỗi `1108`.
- **Xoá**: các category phía sau tự dồn lên 1 bậc.
- **Reorder** (mới): `PATCH /api/admin/categories/reorder`, body `{ "ids": ["id1", "id2", ...] }`, vị trí trong mảng là priority 1..N. Phải gửi đủ mọi category đúng một lần (FE gọi `limit=200` để lấy đủ). Response `{ data: [{ id, priority }] }`. Permission `CATEGORY_UPDATE`.
- Hiển thị danh sách kéo thả phải dùng `sort=priority` thì thứ tự mới khớp.
- Dữ liệu cũ đã được migration đánh số lại 1..N (giữ thứ tự hiển thị cũ).

## 6. Error code mới

| Code | HTTP | Khi nào |
|---|---|---|
| 1106 `CATEGORY_REORDER_DUPLICATE_ID` | 400 | `ids` của reorder có id trùng |
| 1107 `CATEGORY_REORDER_INCOMPLETE` | 400 | `ids` không đủ mọi category |
| 1108 `CATEGORY_PRIORITY_OUT_OF_RANGE` | 400 | `priority` ngoài `1..N` |
| 1606 `MEDIA_FILE_TOO_LARGE` | 413 | Storage từ chối vì file quá lớn (trước đây là 502 `1605` "upload failed") |

Reorder với id không tồn tại trả `1101 CATEGORY_NOT_FOUND`. FE nên map `errorCode 1606` sang thông báo "File quá lớn".

## 6b. Product `badge` là enum cố định (BREAKING)

`badge` chỉ nhận **`new`**, **`sale`**, **`bestseller`**, **`sold_out`** (hết hàng), **`limited`**, **`custom_order`** (đặt thiết kế) hoặc `null` (không gắn badge). Xem bảng đầy đủ ở [fe-enums.md](fe-enums.md).

- `POST /api/admin/products`, `PATCH /api/admin/products/:id`: gửi badge khác (vd `hot`, `Mới`) → **400**. Form admin cần chuyển ô nhập tự do thành select 3 giá trị + "Không có".
- `GET /api/admin/products?badge=...`: giá trị ngoài enum → **400** (trước đây nhận chuỗi bất kỳ). Public `GET /api/products?badge=...` vốn đã giới hạn như vậy.
- DB có thêm CHECK `CHK_products_badge`. Migration sẽ dừng và báo giá trị sai nếu còn product có badge ngoài enum (seed data chỉ dùng `new`, `sale`, `bestseller`).

## 7. Checklist cho FE

- [ ] Public: đổi mọi `sort=newest|oldest|*_asc|*_desc|rating_*` sang cú pháp `field` / `-field`.
- [ ] Admin: rà mọi `sort=` (chiều đã đảo), kể cả nút sort theo cột và sort mặc định.
- [ ] Media: `sorts` → `sort`.
- [ ] Category admin: bỏ `priority` khỏi body tạo mới; thêm UI kéo thả gọi `reorder`; list dùng `sort=priority&limit=200`.
- [ ] Category public: nếu cần thứ tự cũ thì gửi `sort=-createdAt`.
- [ ] Bắt `errorCode 1606` cho upload media.
- [ ] Admin product: badge là select `new | sale | bestseller | sold_out | limited | custom_order | null`; filter badge cũng chỉ nhận 6 giá trị này.
- [ ] Không gửi `limit` > 200.
- [ ] Không còn dựa vào mặc định 24: public (categories, collections, products, orders, reviews) và media giờ mặc định 25. Lưới đang chia theo 24 (chia hết 2, 3, 4, 6) cần gửi `limit=24` tường minh hoặc đổi layout.

## 8. Việc chạy ở BE trước khi FE test

```bash
npx typeorm migration:run -d data-source.ts   # 4 migration: AddCategoryPriority, MakeCategoryPriorityUnique, AddProductBadgeCheck, ExtendProductBadgeEnum
```
