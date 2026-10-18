# common & core (`src/common`, `src/core`, `src/main*.ts`, `src/migrations`)

> Cập nhật lần cuối: 2026-10-17

## 1. Tổng quan

Phần hạ tầng dùng chung cho mọi module: bootstrap ứng dụng, guard xác thực/phân quyền, quy ước phân trang–sort–search, hệ error code, hệ permission, entity gốc, cấu hình DB và migration.

| Mục | Giá trị |
|---|---|
| Thư mục | `src/common`, `src/core`, `src/main.ts`, `src/main.module.ts`, `src/main.controller.ts`, `src/migrations`, `data-source.ts` |
| Route prefix | `/` , `/health` (`MainController`), `/api-docs` (Swagger) |
| Bảng DB | `typeorm_migrations` (bảng theo dõi migration); các bảng nghiệp vụ thuộc module tương ứng |
| Path alias | `@common/*` → `src/common/*`, `@core/*` → `src/core/*`, `@/*` → `src/modules/*` |

## 2. Mục đích & nghiệp vụ phục vụ

- Khởi động server (CORS, helmet, giới hạn body, ValidationPipe, filter lỗi, Swagger).
- Bắt buộc mọi route phải có JWT trừ route `@Public()`, và mọi route không public phải khai báo `@Permissions(...)` (admin được bỏ qua kiểm tra).
- Một bộ chuẩn duy nhất cho API list (phân trang, sort, search, response) và cho lỗi nghiệp vụ (error code 4 chữ số).
- Cung cấp entity gốc (`BaseEntity`) với id nanoid 16 ký tự.
- Quản lý schema DB bằng migration (không dùng `synchronize`).

## 3. Submodule & chức năng

| Submodule | Vị trí | Chức năng |
|---|---|---|
| Bootstrap | `src/main.ts`, `src/main.module.ts` | Tạo app, middleware, pipe, filter, Swagger, đăng ký module và guard toàn cục |
| Health | `src/main.controller.ts` | `GET /` và `GET /health` (public) |
| CoreModule | `src/core/core.module.ts` | `ConfigModule` toàn cục + kết nối TypeORM + log thống kê bảng khi khởi động |
| Swagger | `src/core/swagger/swagger.config.ts` | Tài liệu API tại `/api-docs` |
| Guards | `src/common/guards` | `JwtAuthGuard`, `PermissionsGuard` |
| Decorators | `src/common/decorator` | `@Public`, `@Permissions`, `@CurrentUser`, `@SortField`, `@SearchField`, `@ApiEndpoint` |
| Base | `src/common/base` | `BaseEntity`, `pagination.util`, `sort.util`, `typeorm-list-query.util`, `base.interface` |
| DTO chung | `src/common/dto` | `PaginationQueryDto` + spec guard cho mọi query DTO |
| Exceptions | `src/common/exceptions` | `AppException`, `throwAppError`, `error-codes.ts` |
| Filter | `src/common/filter/exception.filter.ts` | `AllExceptionFilter` |
| Middleware | `src/common/middleware/request-id.middleware.ts` | Gắn `x-request-id` |
| Permissions | `src/common/permissions/permissions.constant.ts` | Enum `Permission`, `DEFAULT_USER_PERMISSIONS` |
| Constants | `src/common/constants/enum-values.constant.ts` | Enum dùng chung giữa DTO |
| Utils / Validator | `src/common/utils`, `src/common/validator` | Helper nhỏ, validator hỗ trợ filter operator |
| Migrations | `src/migrations`, `data-source.ts` | Lịch sử schema |

## 4. Chi tiết

### 4.1 Bootstrap (`src/main.ts`)

| Thành phần | Giá trị |
|---|---|
| Port | `process.env.PORT` hoặc `7001` |
| CORS | origin = `CORS_ORIGINS` (phân tách bằng dấu phẩy) hoặc `http://localhost:3000`; `credentials: true`; methods `GET, POST, PUT, PATCH, DELETE, OPTIONS`; headers `Content-Type, Authorization, X-Requested-With` |
| Bảo mật header | `helmet()` |
| Request id | `RequestIdMiddleware`: dùng `x-request-id` của request hoặc sinh `randomUUID()`, trả lại trong header response |
| Body | JSON và urlencoded giới hạn `5mb`. Parser JSON có `verify` giữ bytes gốc vào `req.rawBody` cho request có đường dẫn bắt đầu `/api/webhooks/` (webhook ký trên raw body; xem [payment](payment.md)) |
| ValidationPipe toàn cục | `transform: true`, `whitelist: true`, `forbidNonWhitelisted: true` (field lạ bị từ chối) |
| Exception filter | `AllExceptionFilter` |
| Shutdown hooks | bật |
| Swagger | `/api-docs`, title "Clothes Shop API", `persistAuthorization`, `docExpansion: none`; tag mô tả: Products, Categories, Collections, Reviews, Shipping, Size Guides |

`MainModule` import: `CoreModule`, `AuthModule`, `UserModule`, `ProductModule`, `CategoryModule`, `CollectionModule`, `ReviewModule`, `ShippingModule`, `SizeGuideModule`, `SiteConfigModule`, `MediaModule`, `AddressModule`, `WishlistModule`, `CartModule`, `OrderModule`, `PaymentModule`. Hai `APP_GUARD` theo thứ tự: `JwtAuthGuard` → `PermissionsGuard`.

`MainController` (`@Public`, ẩn khỏi Swagger):

| Method | Path | Response |
|---|---|---|
| GET | `/` | chuỗi `Clothes Shop API is running` |
| GET | `/health` | `{ status: 'ok', timestamp, uptime, db: 'connected' }`; lỗi DB: `{ status: 'error', timestamp, db: 'disconnected' }` (sau khi chạy `SELECT 1`) |

### 4.2 Cấu hình DB & CoreModule

- `CoreModule` (`@Global`): `ConfigModule.forRoot({ isGlobal: true })` và `TypeOrmModule.forRootAsync` với `type: 'postgres'`, `autoLoadEntities: true`, `synchronize: false`.
- Biến môi trường đọc ở đây: `POSTGRES_HOST` (mặc định `127.0.0.1`), `POSTGRES_PORT` (`5432`), `POSTGRES_USERNAME` (`pguser`), `POSTGRES_PASSWORD` (rỗng), `POSTGRES_DATABASE` (`clothes-shop`).
- `onModuleInit` log danh sách bảng schema `public` kèm số dòng; cảnh báo nếu chưa có bảng nào (chưa chạy migration).
- `data-source.ts` (cho TypeORM CLI): cùng biến POSTGRES_*, `entities: src/**/*.entity.ts`, `migrations: src/migrations/*.ts`, bảng theo dõi `typeorm_migrations`.
- `yarn start:prod` chạy `typeorm migration:run -d data-source.ts` rồi `node dist/src/main.js`.

### 4.3 Xác thực & phân quyền

**`JwtAuthGuard`** (global): route có `@Public()` (ở method hoặc class) → cho qua; còn lại dùng Passport strategy `jwt`.

**`PermissionsGuard`** (global, chạy sau JWT):

1. Route `@Public()` → cho qua.
2. `request.user.role === 'admin'` → cho qua mọi permission.
3. Lấy `@Permissions(...)` (method hoặc class). Không khai báo → ném `NO_PERMISSION_DEFINED (9002)`, HTTP 500, message yêu cầu thêm decorator.
4. User cần có **ít nhất một** permission trong danh sách (`user.permissions` là mảng số). Thiếu → `PERMISSION_DENIED (9001)`, HTTP 403.

Decorators:

| Decorator | Tác dụng |
|---|---|
| `@Public()` | Đặt metadata `isPublic` |
| `@Permissions(...codes)` | Đặt metadata `permissions` |
| `@CurrentUser(field?)` | Lấy `request.user` (entity `User` do `JwtStrategy.validate` trả về) hoặc 1 field của nó |
| `@ApiEndpoint(summary, { method, auth })` | Gộp `ApiOperation` + `ApiOk/CreatedResponse` (+ `ApiBearerAuth`); hiện chưa module nào dùng |

### 4.4 Permission (`Permission` enum)

Format `[MM][SS]`, nhóm theo module.

| Nhóm | Mã |
|---|---|
| Auth | `AUTH_ME 1000`, `AUTH_REFRESH 1001` |
| Cart | `CART_VIEW 2000`, `CART_ADD_ITEM 2001`, `CART_UPDATE_ITEM 2002`, `CART_REMOVE_ITEM 2003`, `CART_CLEAR 2004` |
| Order (khách) | `ORDER_VIEW_LIST 3000`, `ORDER_VIEW_DETAIL 3001`, `ORDER_CREATE 3002`, `ORDER_CANCEL 3003` |
| Address | `ADDRESS_VIEW 4000`, `ADDRESS_CREATE 4001`, `ADDRESS_UPDATE 4002`, `ADDRESS_DELETE 4003` |
| Wishlist | `WISHLIST_VIEW 5000`, `WISHLIST_ADD 5001`, `WISHLIST_REMOVE 5002`, `WISHLIST_CHECK 5003` |
| Product admin | `PRODUCT_CREATE 6000`, `PRODUCT_UPDATE 6001`, `PRODUCT_DELETE 6002`, `PRODUCT_VIEW 6003` |
| Category admin | `CATEGORY_CREATE 7000`, `CATEGORY_UPDATE 7001`, `CATEGORY_DELETE 7002`, `CATEGORY_VIEW 7003` |
| Collection admin | `COLLECTION_CREATE 8000`, `COLLECTION_UPDATE 8001`, `COLLECTION_DELETE 8002`, `COLLECTION_VIEW 8003` |
| Order admin | `ORDER_ADMIN_VIEW 9000`, `ORDER_ADMIN_UPDATE_STATUS 9001` |
| User admin | `USER_ADMIN_VIEW 10000`, `USER_ADMIN_UPDATE 10001` |
| Site config admin | `SITE_CONFIG_VIEW 11000`, `SITE_CONFIG_UPSERT 11001`, `SITE_CONFIG_DELETE 11002` |
| Media admin | `MEDIA_VIEW 12000`, `MEDIA_UPLOAD 12001`, `MEDIA_DELETE 12002` |
| Payment (khách) | `PAYMENT_CREATE 13000`, `PAYMENT_VIEW 13001` |
| Payment admin | `PAYMENT_ADMIN_VIEW 14000`, `PAYMENT_ADMIN_CONFIRM 14001`, `PAYMENT_ADMIN_REFUND 14002`, `PAYMENT_ADMIN_CREATE_QR 14003` |
| Return (khách) | `RETURN_CREATE 15000`, `RETURN_VIEW 15001` |
| Return admin | `RETURN_ADMIN_VIEW 16000`, `RETURN_ADMIN_PROCESS 16001` |
| Review (khách) | `REVIEW_CREATE 17000`, `REVIEW_VIEW 17001`, `REVIEW_VOTE 17002` |
| Review admin | `REVIEW_ADMIN_VIEW 18000`, `REVIEW_ADMIN_MODERATE 18001`, `REVIEW_ADMIN_REPLY 18002` |

`DEFAULT_USER_PERMISSIONS` (gán cho user mới đăng nhập lần đầu, role `user`): `AUTH_ME`, `AUTH_REFRESH`, toàn bộ nhóm Cart, Order (khách), Payment (khách), Return (khách), Review (khách), Address, Wishlist. Admin không cần khai báo.

### 4.5 Phân trang / sort / search / response chuẩn cho API list

| Thành phần | Vị trí | Hành vi |
|---|---|---|
| `PaginationQueryDto` | `@common/dto/pagination-query.dto` | `page` (int ≥ 1, mặc định 1), `limit` (int 1–200, mặc định 25); mọi query DTO của list đều extends |
| Hằng số | `@common/base/pagination.util` | `DEFAULT_PAGE = 1`, `DEFAULT_PAGE_SIZE = 25`, `MAX_PAGE_SIZE = 200` |
| `getPaging(query)` | `pagination.util` | Trả `{ page, limit }` đã áp mặc định |
| `paginated(data, total, page, limit)` | `pagination.util` | `{ data, total, page, limit, totalPages }` với `totalPages = ceil(total / limit)` |
| `@SortField(fields, defaultSort)` | `@common/decorator/sort-field.decorator` | Param `sort`: `IsString` + `IsIn(field, -field ...)`; `field` = ASC, `-field` = DESC |
| `parseSort(sort, fallback)` | `@common/base/sort.util` | `{ field, direction }`; không có `sort` thì dùng `fallback` |
| `parseQueryBoolean` | `@common/dto/query-boolean.transform` | `@Transform` cho filter boolean trong query (`needsAction`, `needsReview`): chỉ nhận `true`/`false`, giá trị khác giữ nguyên để `@IsBoolean()` từ chối (không dùng chuyển kiểu ngầm vì `Boolean('false') === true`) |
| `@SearchField(desc)` | `@common/decorator/search-field.decorator` | Param `search`: `IsString`, `MaxLength(255)`, optional |
| `typeormListQuery(qb, alias, props, options)` | `@common/base/typeorm-list-query.util` | Helper QueryBuilder: sort (mặc định `-createdAt`), filter theo operator (`lt gt lte gte ne eq in range`, giá trị thường = `eq`, mảng = overlap `&&`), search `ILIKE` trên `searchableColumns`, trả `Paging` (`items`, `total`, `page`, `limit`, `totalPages`). Hiện chỉ `MediaService` dùng |
| Spec guard | `src/common/dto/list-query.dto.spec.ts` | Tự quét mọi `*-query.dto.ts`: kiểm tra extends `PaginationQueryDto`, default 1/25, `limit ≤ 200`, từ chối `sorts`, whitelist sort, nhận `field`/`-field`; danh sách DTO không phải list nằm ở `NOT_LIST_DTO_FILES` |

Danh sách không phân trang (address, wishlist, site-config admin) trả `{ data, total }`.

Enum dùng chung (`@common/constants/enum-values.constant`):

| Hằng | Giá trị |
|---|---|
| `ACTIVE_STATUSES` | `active`, `disabled` |
| `USER_ROLES` | `user`, `admin` |
| `ORDER_PAYMENT_STATUSES` | `unpaid`, `paid`, `refunded` (`orders.payment_status`) |
| `PRODUCT_BADGES` | `new`, `sale`, `bestseller`, `sold_out`, `limited`, `custom_order` |
| `NON_ORDERABLE_BADGES` | `sold_out`, `custom_order` (không cho thêm vào giỏ / checkout) |

`ORDER_STATUSES` khai báo ở `src/modules/order/dtos/admin-order.dto.ts` (xem module order).

`base.interface.ts`: kiểu `DeepPartial`, `AsTypeSort`, `BaseListProps`, lớp `Paging<T>`, `BadRequestErrorResponse` (schema Swagger).

### 4.6 Error code & xử lý lỗi

Format `[MM][EE]` (4 chữ số). `throwAppError(errorCode, message?, statusCode = 400)` ném `AppException`, body: `{ statusCode, errorCode, message }`; không truyền message thì lấy từ `ErrorMessages[errorCode]`.

| Prefix | Module | Enum | Mã |
|---|---|---|---|
| 10xx | Product | `EProductErrorCode` | 1001–1005, 1009 |
| 11xx | Category | `ECategoryErrorCode` | 1101–1108 |
| 12xx | Collection | `ECollectionErrorCode` | 1201–1203 |
| 13xx | Order | `EOrderErrorCode` | 1301–1307 |
| 14xx | User | `EUserErrorCode` | 1401–1402 |
| 15xx | Site config | `ESiteConfigErrorCode` | 1501–1503 |
| 16xx | Media | `EMediaErrorCode` | 1601–1607 |
| 17xx | Payment | `EPaymentErrorCode` | 1701–1714 |
| 18xx | Return | `EReturnErrorCode` | 1801–1805 |
| 19xx | Review | `EReviewErrorCode` | 1901–1908 |
| 90xx | Permission | `EPermissionErrorCode` | 9001 `PERMISSION_DENIED`, 9002 `NO_PERMISSION_DEFINED` |

Chi tiết từng mã nằm ở mục Error code của module tương ứng.

`AllExceptionFilter` (`@Catch()` mọi lỗi):

- `HttpException` → giữ status, body = response của exception (string được bọc thành `{ statusCode, message }`).
- Lỗi khác → HTTP 500, body `{ statusCode: 500, message: 'Internal server error' }`; chi tiết chỉ ghi log (không lộ ra client). Mọi lỗi ≥ 500 đều được log.
- Lỗi validation của `ValidationPipe` giữ định dạng mặc định của Nest (`message` là mảng chuỗi).

### 4.7 Entity gốc & id

`BaseEntity` (abstract): `id` `varchar(16)` PK sinh bằng nanoid (bảng chữ `a-zA-Z0-9`, 16 ký tự) ở `@BeforeInsert` nếu chưa có; `created_at`, `updated_at` kiểu `timestamp with time zone`.

Entity **không** extends `BaseEntity` (tự khai báo id nanoid16): `Wishlist` (chỉ có `created_at`), `OrderItem` (chỉ có `created_at`).

### 4.8 Utils & validator

| File | Nội dung | Dùng ở |
|---|---|---|
| `utils/money.util.ts` | Tiền tệ gốc VND: `MAX_MONEY_VND` (1 tỷ), `vndToUsd(vnd, vndPerUsd)` (làm tròn 2 chữ số), `money(tên, vnd, tỷ giá)` → `{ <tên>Vnd, <tên>Usd }`, `moneyOrNull(...)` (`null` ở cả hai field khi vắng giá trị) | mọi module trả tiền (xem [currency](currency.md)) |
| `base/column-transformers.ts` | `bigintTransformer` (bigint → number, dùng cho mọi cột tiền VND), `numericTransformer` (numeric → number, dùng cho `orders.exchange_rate`) | entity product, order, order_item, payment_attempt, payment_transaction, refund |
| `utils/helper.ts` | `sleep(ms)`, `formatError(err)` (kèm `err.cause`) | chưa có chỗ gọi |
| `utils/transform.ts` | `transformJSON`, `transformArray`, `transformImageUrl` (nối `process.env.STORAGE_URL`) | chưa có chỗ gọi |
| `validator/BaseValidate.ts` | `BaseValidate` + `baseValidateEnum/String/Number/Date/Boolean`, hiểu operator `lt lte gt gte ne in range eq` | chưa có chỗ gọi |
| `types/baseType.ts` | `GConstructor` | chưa có chỗ gọi |

### 4.9 Migration

Đặt tên `{timestamp}-{PascalCaseName}.ts` (timestamp từ `Date.now()`), constraint theo prefix: `PK_`, `FK_`, `UQ_`, `CK_`, `IDX_`. Lệnh: `yarn migration:run`, `yarn migration:revert`, `yarn migration:generate`, `yarn migration:create`.

| Migration | Nội dung |
|---|---|
| `1783478828861-InitSchema` | users, products, categories, subcategories, collections, reviews + index/unique ban đầu |
| `1783478828862-SeedData` | Seed 4 category (kèm subcategory), 32 product, 7 collection, 6 review |
| `1783482031913-AddUserRole` | `users.role` |
| `1783485479708-AddWishlistCartOrderAddress` | addresses, wishlists, carts, cart_items, orders, order_items |
| `1784111460687-AddUserPermissions` | `users.permissions` JSONB |
| `1784190680744-AddForeignKeyConstraints` | products → category/subcategory FK (RESTRICT), reviews → products FK, bảng `collection_products` thay cột `product_ids` |
| `1784191427030-AddCheckConstraints` | CHECK cho products/users/orders/order_items, UNIQUE `(category_id, slug)` của subcategories, index |
| `1784193269892-FixOrderUserFKAndIndexes` | `orders.user_id` nullable + FK `SET NULL`; index `cart_items.product_id`, `order_items.product_id` |
| `1784195289156-AddProductArrayChecks` | CHECK mảng `sizes/colors/images` không rỗng |
| `1784196360326-FixRemainingConstraints` | UNIQUE cart_items, CHECK quantity ≤ 99, CHECK subcategories.count, CHECK order_items.price > 0, index còn thiếu, `products.subcategory_id` NOT NULL |
| `1784520030511-MigrateSubcategoryToNanoid` | `subcategories.id` từ serial → nanoid16, thêm `created_at/updated_at`, cập nhật FK ở products |
| `1790752616083-AddSiteConfig` | Bảng `site_configs` + seed 4 key |
| `1790756976936-AddCategoryHeroImage` | `categories.hero_image` |
| `1791559342991-AddMediaFiles` | Bảng `media_files` |
| `1791773424311-AddCategoryPriority` | `categories.priority` |
| `1791774171535-MakeCategoryPriorityUnique` | Đánh số lại 1..N, UNIQUE DEFERRABLE, CHECK ≥ 1 |
| `1791788759258-AddProductBadgeCheck` | CHECK badge (3 giá trị đầu) |
| `1791789223339-ExtendProductBadgeEnum` | Mở rộng badge sang 6 giá trị, đổi tên `CHK_` → `CK_` |
| `1791824744900-AddPayments` | `orders.payment_status`/`paid_at` (+ CHECK), bảng `payment_attempts`, `payment_transactions`, cấp `PAYMENT_CREATE`/`PAYMENT_VIEW` cho user hiện có `ORDER_CREATE`/`ORDER_VIEW_DETAIL`. Idempotent (`IF NOT EXISTS`, chuẩn hoá cột/constraint đã có): chạy được trên DB sạch, DB còn schema thanh toán cũ và khi chạy lại |
| `1791857616252-AddShippingConfig` | Mở rộng `CK_site_configs_type` thêm `SHIPPING`; seed dòng `SHIPPING_CONFIG` (phí ship/ngưỡng miễn phí hiện hành), idempotent |
| `1791861660340-AddPaymentConfirmation` | `payment_transactions.confirmed_by`/`confirmed_at`/`confirm_note` (FK users SET NULL), thêm `MANUALLY_CONFIRMED` vào CHECK `verification_status`, CHECK `confirmed_at` ↔ `MANUALLY_CONFIRMED`; idempotent |
| `1791865521461-PaymentTransactionUniquePerProvider` | `payment_transactions`: UNIQUE chuyển từ `provider_transaction_id` sang (`provider`, `provider_transaction_id`); bỏ tiền tố `manual:` ở giao dịch cũ; idempotent |
| `1791872292172-ConfirmPaidPendingOrders` | Đơn đã `paid` mà còn `pending` → `confirmed` (áp quy tắc tự xác nhận khi đã trả cho đơn cũ); idempotent |
| `1791879846109-AddRefunds` | `orders.payment_status` thêm `refunded` (CHECK, và `CK_orders_paid_at` tính cả `refunded`); bảng `refunds` (CHECK, FK RESTRICT/SET NULL, UNIQUE từng phần một yêu cầu đang chờ mỗi đơn và một `bank_reference`); idempotent, `down` đưa `refunded` về `paid` và bỏ bảng |
| `1791884003973-AddReturns` | `orders.delivered_at` (+ CHECK, điền `updated_at` cho đơn đã giao), bảng `return_requests`, `return_request_items`, `refunds.return_request_id` + lý do `RETURN` (CHECK), cấp `RETURN_CREATE`/`RETURN_VIEW` cho user hiện có `ORDER_CREATE`/`ORDER_VIEW_DETAIL`; idempotent, `down` từ chối nếu đã có khoản hoàn `RETURN` |
| `1791895935291-AddPaymentAttemptCreatedBy` | `payment_attempts.created_by` (FK users SET NULL, index): admin tạo mã QR cho đơn; idempotent |
| `1791966947507-AddReviewFeatures` | `reviews`: `order_item_id` (FK order_items SET NULL, UNIQUE), `size`, `color`, `fit`, `status`, `helpful_count`, `edited_at`, kiểm duyệt (`moderation_note`, `moderated_by/at`), phản hồi (`reply`, `replied_by/at`) + CHECK/FK/index; bảng `review_votes`; cấp `REVIEW_CREATE`/`REVIEW_VIEW`/`REVIEW_VOTE` cho user hiện có `ORDER_CREATE`; idempotent, `down` từ chối nếu đã có đánh giá của khách |
| `1792169276231-VndBaseCurrency` | Tiền gốc sang VND: `products.price/original_price`, `order_items.price`, `orders.subtotal/shipping_fee/total` từ decimal(10,2) sang bigint (làm tròn, giá tối thiểu 1, **không nhân tỷ giá**); `orders.exchange_rate` numeric(12,2) NOT NULL (`CK_orders_exchange_rate > 0`, điền tỷ giá seed cho đơn cũ); mở rộng `CK_site_configs_type` thêm `CURRENCY`, seed dòng `EXCHANGE_RATE` (tỷ giá cố định 25000, không đọc biến môi trường); đổi khoá `SHIPPING_CONFIG` thành `priceVnd`/`freeShippingThresholdVnd`; idempotent, `down` trả kiểu về decimal(10,2) (lỗi nếu giá trị VND quá 99.999.999) |
| `1792233304878-SetAllProductPricesTo2000Vnd` | Migration dữ liệu: đặt `products.price` = 2000 (VND) cho mọi sản phẩm, `products.original_price` = 2000 cho dòng đang có giá gốc (giữ `NULL` nếu không có); không đụng đơn, giỏ, `order_items`; idempotent; **không hoàn tác được** (giá cũ không được lưu, `down` không làm gì) |
| `1791968077807-AddReviewImagesAndProductRating` | `media_files.purpose` (`LIBRARY`/`REVIEW`, CHECK) + `uploaded_by` (FK users SET NULL, index); `reviews.images` (jsonb, CHECK mảng ≤ 5 phần tử); `products.rating_average`/`rating_count` (CHECK, index) điền lại từ đánh giá `PUBLISHED`; idempotent, `down` từ chối nếu đã có ảnh đánh giá |

### 4.10 Biến môi trường (chỉ tên)

| Biến | Nơi dùng |
|---|---|
| `PORT` | `main.ts` (mặc định 7001) |
| `CORS_ORIGINS` | `main.ts` |
| `POSTGRES_HOST/PORT/USERNAME/PASSWORD/DATABASE` | `core.module.ts`, `data-source.ts` |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | module auth |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | module auth |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | module media |
| `STORAGE_URL` | `utils/transform.ts` (`transformImageUrl`) |
| `SEPAY_RECEIVING_BANK_CODE`, `SEPAY_RECEIVING_BANK_NAME`, `SEPAY_RECEIVING_ACCOUNT`, `SEPAY_RECEIVING_ACCOUNT_NAME`, `SEPAY_WEBHOOK_SECRET`, `PAYMENT_TRANSFER_PREFIX` | module payment |

### 4.11 Lệnh

```bash
yarn dev                       # dev server (nest start --watch)
npx nest build                  # build
npx tsc --noEmit                # type check
npx biome check src/            # lint
yarn test                       # jest (rootDir src, regex *.spec.ts / *e2e-spec.ts)
yarn migration:run              # chạy migration
```

### 4.12 Test

- `src/common/dto/list-query.dto.spec.ts`: guard chuẩn list cho mọi `*-query.dto.ts` (xem 4.5).
- Test của từng module: xem file module tương ứng.

### 4.13 Lưu ý hiện trạng

- Port đọc từ `PORT` (không có biến `APP_PORT`); `APP_ENV` còn trong `.env` cục bộ nhưng code không đọc.
- `PermissionsGuard` trả HTTP 500 (`NO_PERMISSION_DEFINED`) cho route không public mà quên `@Permissions` (với user không phải admin); admin vẫn truy cập được route đó.
- Trong `JwtStrategy`, mỗi request đều đọc user từ DB nên role/permissions/status thay đổi có hiệu lực ngay, không cần chờ token hết hạn.
- Danh sách quyền của một user được lưu trong cột `users.permissions`; `DEFAULT_USER_PERMISSIONS` chỉ được áp khi tạo user mới, không tự cập nhật cho user đã tồn tại.
