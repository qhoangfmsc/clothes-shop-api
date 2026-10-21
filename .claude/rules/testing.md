# Rule: test — unit cạnh code, flow test ở `test/flows/`

Mọi thay đổi hành vi trong `src/` phải đi kèm test **trong cùng lượt**. Quy trình thao tác: skill `module-test`. Bảng quản lý test: `test/README.md` (test matrix).

## Hai tầng test

| Tầng | Vị trí | Chạy trên | Dùng để | Lệnh |
|---|---|---|---|---|
| **Unit** | `src/**/<tên>.spec.ts`, cạnh code | Mock (không DB) | Logic thuần, nhánh nghiệp vụ, DTO validation, presenter, util | `yarn test` |
| **Flow** | `test/flows/<module>/<luồng>.flow.ts` | Postgres thật (docker, DB `*_test`) + HTTP thật (guard, pipe, filter, controller, service) | Luồng chính end-to-end, transaction/khoá, CHECK/FK/UNIQUE, tương tác giữa module | `yarn test:flows` |

Hạ tầng flow test (spec): `docs/specs/testing/0001-flow-test-infrastructure.md`.

## Khi nào bắt buộc

| Thay đổi | Phải có |
|---|---|
| Module mới | Unit cho logic + **ít nhất 1 flow** cho luồng chính (happy path) và các nhánh lỗi/biên quan trọng |
| Chạm luồng tiền, trạng thái đơn, thanh toán, hoàn tiền, trả hàng, auth/phân quyền | Cập nhật/ mở rộng **flow** liên quan, kể cả khi chỉ sửa nhỏ |
| Migration thêm CHECK/FK/UNIQUE | Flow hoặc unit chứng minh ràng buộc bị vi phạm thì lỗi như mong đợi |
| Sửa bug | Test **tái hiện bug trước**, rồi mới sửa |
| API list | Chạy `yarn test` (guard `list-query.dto.spec.ts` tự quét) |
| Thay đổi không đổi hành vi (đổi tên nội bộ, format, comment) | Không cần test mới; nói rõ trong báo cáo |

## Cách viết flow test

- Một file = một luồng nghiệp vụ (`checkout-and-pay.flow.ts`). Đặt tên `<luồng>.flow.ts`; mô tả `describe('Flow: ...')`.
- Dựng dữ liệu đầu vào bằng **builder** (`test/support/builders.ts`: `b.user()`, `b.product()`, `b.cart()`...) — thêm builder mới khi cần, đừng `INSERT` tay rải rác trong test.
- Các bước lặp lại của một luồng gom vào `steps.ts` cạnh file flow (`placeOrder`, `createQr`...).
- **Hành vi cần kiểm đi qua HTTP** với token thật (`bearer(t, user)`); dùng DB chỉ để dựng dữ liệu và xác nhận kết quả cuối.
- Không mock service nội bộ. Chỉ giả **đầu vào từ bên ngoài** (vd webhook SePay ký đúng chuẩn qua `sepayWebhook`).
- Mỗi test độc lập, không phụ thuộc thứ tự; DB tự dọn sau mỗi test (`truncateAll`). Không hardcode id.
- Assert cả mã lỗi (`errorCode`) cho nhánh lỗi, không chỉ status HTTP.
- Luồng tiền mới: thử **phá một dòng** logic (mutation sanity check) để chắc test bắt được, rồi khôi phục.

## An toàn

- Flow test chỉ chạy trên DB có tên kết thúc `_test` (chốt chặn trong `test/support/test-env.ts`); không đổi chốt chặn này.
- Không đưa secret thật vào test; giá trị test nằm ở `test/support/test-env.ts`.
- Không chạy hai lần `yarn test:flows` đồng thời (khoá advisory sẽ chặn lần thứ hai).

## Chiến dịch test toàn diện

Phủ ca đúng + ca lỗi + auth/quyền cho **mọi route** được làm theo từng lượt nhỏ (1 batch ≤ 5 route/lượt), có đong đếm và nối lại được giữa các phiên: skill `test-campaign`, tiến độ ở `test/PROGRESS.md`. Làm việc test lớn thì mở PROGRESS.md trước, không làm ngoài batch đang đến lượt.

## Test matrix

Mỗi flow/unit đáng kể phải có dòng trong `test/README.md` (module · luồng · tầng · file). Thêm flow mới hoặc đổi phạm vi test → cập nhật bảng cùng lượt. Luồng chính chưa có test ghi rõ "chưa có" để thấy khoảng trống.

## Chạy trước khi báo xong

`npx tsc --noEmit` · `yarn lint` · `yarn test` · `yarn test:flows` (cần Docker). Nếu không chạy được flow vì môi trường, **nói rõ trong báo cáo** và không tuyên bố đã xong phần đó.
