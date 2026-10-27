# 0019 — Dọn `any` cũ và dùng helper `isUniqueViolation`

> Module: `common` (+ category, auth, payment) · Trạng thái: Implemented · Ngày: 2026-10-27 · Cỡ: rút gọn

## 1. Bối cảnh

Hai nợ nhỏ còn ghi ở `docs/modules/common.md` 4.13 và rule `coding-conventions.md`:
- `any` còn trong code ứng dụng (không tính spec): `category.service.ts` (4 chỗ `catch (err: any)`), `auth.service.ts` và `auth.module.ts` (`expiresIn as any`), `exception.filter.ts` (`responseBody: any`), `typeorm-list-query.util.ts` (`SelectQueryBuilder<any>`, `value: any`). Biome đang tắt `noExplicitAny` nên không ai chặn thêm.
- `SepayWebhookService` tự khai báo `UNIQUE_VIOLATION = '23505'` và đọc `(error as {code})` trong khi `common/base/db-error.util.ts` đã có `isUniqueViolation`.

## 2. Mục tiêu & ngoài phạm vi

**Mục tiêu**: bỏ các `any` trên bằng kiểu đúng; `SepayWebhookService` dùng `isUniqueViolation`; bật `noExplicitAny` ở mức `warn` (= lỗi vì `lint` có `--error-on-warnings`) cho `src/` không tính spec/test-utils, để `any` mới bị chặn bằng máy.
**Ngoài phạm vi**: đổi hành vi; `any` trong spec/test (cần cho giả lập).

## 3.3–3.4 Pattern & SOLID
Không dùng pattern. SOLID: D ✔ (một helper cho việc nhận diện lỗi unique, thay vì mã `23505` ở hai nơi), I ✔ (kiểu hẹp thay `any`).

## 3.9 Ảnh hưởng
Chỉ category (4 `catch`), auth (JWT `expiresIn`), payment (webhook idempotency), `common` (filter, list-query util): không đổi hành vi. Bên liên quan chạy lại: flow `category`, `auth`, `payment` (webhook trùng giao dịch), `access`, mọi API list dùng `typeormListQuery`.

## 4. Kế hoạch test
| Tầng | Case | Vị trí |
|---|---|---|
| Hiện có | unit và flow hiện có giữ nguyên (webhook trùng giao dịch → `DUPLICATE`, danh mục trùng slug → 1102/1103, đăng nhập/làm mới token) | giữ nguyên |
| Lint | thêm `any` vào file ứng dụng → `yarn lint` đỏ; spec/test vẫn được dùng `any` | thủ công |

## 6. Kết quả triển khai

- **File:** `category.service.ts` (4 `catch (err: any)` → `unknown`; mã `23503` qua `isDbError(err, PG_FOREIGN_KEY_VIOLATION)`), `auth.service.ts` và `auth.module.ts` (`JwtSignOptions['expiresIn']`), `exception.filter.ts` (`responseBody`), `typeorm-list-query.util.ts` (generic `<T extends ObjectLiteral>`, `unknown`), `order.entity.ts` (`shippingAddress: Record<string, unknown>`), `size-guide.controller.ts` (kiểu `SizeGuide`), `sepay-webhook.service.ts` (`isUniqueViolation`, bỏ hằng `23505`), `biome.json` (`noExplicitAny: warn` + `overrides` tắt cho spec/test-utils/`test/**`).
- **Khác thiết kế:** bật `noExplicitAny` lộ thêm hai `any` mà `grep` bỏ sót (`Record<string, any>` ở `order.entity.ts` và `size-guide.controller.ts`); đã xử lý trong lượt này.
- **Test:** không đổi hành vi nên không thêm test; unit và flow hiện có (category trùng slug / còn sản phẩm, webhook trùng giao dịch, đăng nhập) giữ xanh. Lint chặn `any` mới trong code ứng dụng.
- **Docs:** `docs/modules/common.md` (4.13), `coding-conventions.md` (mục 5, 12).
