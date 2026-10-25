# Rule: phạm vi ảnh hưởng — xong là khi cả bên liên quan vẫn ổn

Áp dụng cho mọi việc chạm `src/`. Bổ sung `testing.md` và `feature-workflow.md` (bước ⑤). Thiết kế công cụ: `docs/specs/common/0014-change-impact-verification.md`.

## 1. Nguyên tắc

Một thay đổi **chưa xong** khi chỉ module vừa sửa chạy đúng. Phải chứng minh được ba điều:

1. **Module đã đổi** đúng: spec, code, test, docs.
2. **Bên liên quan** (module khác dùng nó hoặc nó dùng) **vẫn đúng**: test của họ chạy lại và xanh, docs của họ không nói sai.
3. **Lõi cửa hàng vẫn ổn**: luồng đặt hàng → thanh toán → huỷ/hoàn tiền/trả hàng, và phân quyền, không bị ảnh hưởng ngầm.

Cái giá của việc bỏ qua: lỗi lộ ra ở module khác, sau merge, khi khách hàng đang dùng.

## 2. "Bên liên quan" là ai — năm vòng

| Vòng | Là | Cách biết | Phải làm |
|---|---|---|---|
| 1. Module đổi | Module có file bị sửa | `git diff` | Spec + code + unit + flow + docs của module |
| 2. Phụ thuộc trực tiếp | Module **import** module đã đổi (service, entity, hàm dùng chung) | `yarn impact` (suy ra từ import thật) | Chạy lại unit + flow của họ; rà docs mục "Phụ thuộc" và hành vi bị ảnh hưởng |
| 3. Phụ thuộc gián tiếp | Module phụ thuộc vòng 2 | `yarn impact` | Chạy lại flow của họ (luồng đi qua) |
| 4. Hạ tầng chung | `src/common`, `src/core`, `main*`, `src/migrations`, `package.json`, cấu hình | Luôn là **mọi module** | Chạy toàn bộ unit + flow; cập nhật `docs/modules/common.md` |
| 5. Người dùng ngoài code | Hợp đồng API cho FE/admin; webhook/cron; dữ liệu đã có trong DB | Đọc spec mục 3.6 và migration | Cập nhật docs API; migration phải chạy được trên dữ liệu hiện có; thay đổi phá vỡ hợp đồng cần spec đầy đủ và người dùng duyệt |

Mặc định **admin cũng là bên liên quan**: mỗi thay đổi API khách hàng kiểm tra lại API admin cùng tài nguyên và ngược lại (cùng bảng, cùng trạng thái, cùng presenter).

## 3. Công cụ: `yarn impact`

```bash
yarn impact                       # so với main + thay đổi chưa commit
yarn impact --base HEAD~3         # so với một mốc khác
yarn impact --files a.ts,b.ts     # khai báo tay (dùng khi lên kế hoạch ở bước spec)
yarn impact --run unit            # chạy unit của module bị ảnh hưởng
yarn impact --run flows           # bật DB test và chạy flow bị ảnh hưởng
yarn impact --json                # cho máy đọc
```

Báo cáo gồm: module đã đổi, phụ thuộc trực tiếp (**bắt buộc kiểm lại**), phụ thuộc gián tiếp, docs phải cập nhật / cần rà, unit và flow cần chạy lại. Flow được gắn module theo URL nó gọi (`/api/admin/refunds` → `refund`); `access`, `rate-limit`, `health` là lưới toàn cục, chạy mỗi khi có thay đổi runtime.

`yarn impact` là **gợi ý nhanh cho vòng lặp phát triển**. Nó không thay cổng cuối: trước khi báo xong và trên CI luôn chạy **toàn bộ** `yarn test` và `yarn test:flows`.

## 4. Việc phải làm khi báo xong

1. Ở bước spec (mục 3.9 template): ghi module trực tiếp/ảnh hưởng (lấy từ `yarn impact --files …`) và bảng kiểm tra lại.
2. Ở bước code: chạy `yarn impact --run unit` rồi `--run flows` thường xuyên; trước khi báo xong chạy toàn bộ.
3. Với mỗi bên liên quan vòng 2–3: nếu **hành vi quan sát được** của họ có thể đổi, phải có test chứng minh nó không đổi (hoặc đổi đúng spec). Chưa có test thì thêm (flow cho luồng tiền/trạng thái).
4. Docs: sửa file module đã đổi; rà file của bên liên quan vòng 2 xem còn đúng không (ghi đúng thì thôi, sai thì sửa).
5. Báo cáo cuối có dòng **Phạm vi ảnh hưởng**: module đổi · bên liên quan đã kiểm lại · flow/unit đã chạy · việc không chạy được và vì sao.

Ngoại lệ (không đổi hành vi: đổi tên nội bộ, format, comment, test thuần): vẫn chạy toàn bộ kiểm tra tự động, nhưng không cần mục 3–4 ở trên; nói rõ trong báo cáo.

## 5. Các cụm liên quan thường gặp (định hướng; nguồn thật là `yarn impact`)

| Khi đổi… | Nhớ kiểm lại |
|---|---|
| `payment` (QR, webhook, xác nhận thủ công, giao dịch) | `order` (huỷ đơn gọi `PaymentAttemptService`; `applyOrderPaid` đổi trạng thái đơn), `refund` (đọc phiên/giao dịch), `return` (sinh khoản hoàn), `review` (đánh giá cần đơn đã nhận), `pending-count` (đếm giao dịch cần xử lý), admin payment; flow `checkout-and-pay`, `payment-*`, `cancel-and-refund`, `concurrency`, `lock-contract` |
| `order` (checkout, trạng thái, truy vấn) | `payment`, `refund`, `return`, `cart` (xoá giỏ sau checkout), `product` (giá), `shipping`/`currency` (phí, tỷ giá đã chốt), `review`, `pending-count`, admin order |
| `refund` / `return` | `order` (hoàn tiền khi huỷ), `payment`, `pending-count`, admin return/refund |
| `product` / `category` | `cart`, `wishlist`, `collection`, `review` (điểm trung bình), `order` (snapshot giá) |
| `site-config` / `currency` / `shipping` | Mọi API có tiền (cặp `Vnd`/`Usd`), báo giá checkout, hạn đổi trả |
| `auth` / `user` / `common/permissions` | Mọi route (guard, quyền); `test/flows/access` (snapshot route–quyền, ma trận 401/403) |
| `common/**`, `core/**`, migration | Mọi module (vòng 4) |

## 6. Ví dụ đầy đủ: thêm cổng thanh toán PayPal

Đây là thay đổi cỡ **spec đầy đủ**: module mới/cell mới, luồng tiền, env mới, có thể migration.

| Bước | Việc | Bằng chứng |
|---|---|---|
| Đọc | `docs/modules/payment.md`, `order.md`, `refund.md`; spec `payment/0001–0004`, `common/0006` (ranh giới ghi) | — |
| Spec | `docs/specs/payment/NNNN-paypal-gateway.md`: phương án (cell `payment/paypal/`; Strategy khi có 2 nhà cung cấp — `design-patterns.md` 4.1), SOLID, dữ liệu (cột `provider` đã có), luồng, **mục 3.9** | file spec |
| Impact | `yarn impact --files src/modules/payment/paypal/x.service.ts` → payment (đổi), order/refund/pending-count (trực tiếp), return/review (gián tiếp) | báo cáo |
| Code | Cell `paypal/`, tái dùng `assertOrderPayable`, `applyOrderPaid`; không sao chép logic; env mới → `core/env.validation.ts` + `test/support/test-env.ts` | `architecture.spec.ts` xanh |
| Test payment | Unit: parse/verify callback PayPal (hàm thuần), từng nhánh trạng thái. Flow: tạo phiên, callback khớp/sai tiền/trùng/trễ, idempotency | `test/flows/payment/…` |
| Test liên quan | Flow chạy lại và (nếu hành vi chạm) mở rộng: `checkout-and-pay`, `cancel-and-refund` (huỷ đơn đã trả bằng PayPal → hoàn tiền thế nào), `payment-refund-actions`, `return-admin` (trả hàng đã trả bằng PayPal), `order-status`, `pending-count`, `concurrency`/`lock-contract` (race callback ↔ huỷ đơn), `access` (route mới có quyền, snapshot cập nhật có chủ đích) | `yarn impact --run flows` rồi toàn bộ |
| Admin | Màn hình admin payment/refund hiển thị giao dịch PayPal đúng (presenter, lọc theo `provider`) | flow `payment-admin-*` |
| Docs | `payment.md` (API, dữ liệu, luồng, lỗi, env), rà `order.md`/`refund.md`/`pending-count.md`, `common.md` (env, migration), `docs/README.md` nếu đổi mô tả, `test/README.md` | `yarn check:docs` |
| Xong | Toàn bộ kiểm tra tự động xanh; spec Implemented; báo cáo có "Phạm vi ảnh hưởng" | CI xanh |

## 7. Checklist review phạm vi ảnh hưởng

- [ ] Đã chạy `yarn impact` (hoặc `--files` ở bước spec) và ghi kết quả vào spec 3.9 / báo cáo?
- [ ] Bên liên quan vòng 2–3 đã có test chạy lại; hành vi quan sát được của họ không đổi (hoặc đổi đúng spec)?
- [ ] Phía admin của cùng tài nguyên đã được kiểm?
- [ ] Docs của module đổi đã sửa, docs của bên liên quan đã rà?
- [ ] Hạ tầng chung/migration: chạy toàn bộ + `common.md` cập nhật?
- [ ] Việc không chạy được (Docker, dịch vụ ngoài) đã nói rõ, không tuyên bố xong phần đó?
