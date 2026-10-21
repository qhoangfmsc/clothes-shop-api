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
- Mỗi test độc lập, không phụ thuộc thứ tự; `createTestApp` dọn DB đầu mỗi file và test dọn sau mỗi test (`truncateAll`) — file không dọn thì file chạy sau có thể đụng UNIQUE. Không hardcode id.
- Assert cả mã lỗi (`errorCode`) cho nhánh lỗi, không chỉ status HTTP.
- Luồng tiền mới: thử **phá một dòng** logic (mutation sanity check) để chắc test bắt được, rồi khôi phục.

## An toàn

- Flow test chỉ chạy trên DB có tên kết thúc `_test` (chốt chặn trong `test/support/test-env.ts`); không đổi chốt chặn này.
- Không đưa secret thật vào test. `.env.test` (root, được commit) chỉ chứa phần khác môi trường thật mà người dùng có thể cần chỉnh: kết nối Postgres test. Hằng số giả khác (JWT, SePay) ở `test/support/test-env.ts`; không thêm vào `.env.test` trừ khi người dùng cần chỉnh. Cần người dùng chỉnh gì thì chỉ vào `.env.test` và nói rõ trong báo cáo.
- Flow test hermetic: không ra mạng. Biến dịch vụ ngoài (`SUPABASE_*`, `GOOGLE_*`, `STORAGE_URL`) bị đặt rỗng và `fetch` bị chặn; cần giả dịch vụ ngoài thì `jest.spyOn(globalThis, 'fetch')` trong chính test đó. Thêm biến môi trường dịch vụ ngoài mới vào code → thêm vào `test-env.ts` (giá trị rỗng).
- Không chạy hai lần `yarn test:flows` đồng thời (khoá advisory sẽ chặn lần thứ hai).

## Độ phủ endpoint (ratchet)

`yarn test:flows` đo route nào đã có ca thành công và ca lỗi nghiệp vụ (`test/coverage-baseline.json`). Route mới phải kèm cả hai loại test trong cùng lượt, nếu không `yarn test:flows` đỏ. Phủ thêm route cũ thì chạy `yarn test:coverage:update` để gỡ khỏi baseline. Không thêm mục vào baseline để "qua" ratchet; chỉ miễn trừ (`exempt`) khi route không thể có ca đó, kèm lý do.

## Chiến dịch test toàn diện

Phủ ca đúng + ca lỗi + auth/quyền cho **mọi route** được làm theo từng lượt nhỏ (1 batch ≤ 5 route/lượt), có đong đếm và nối lại được giữa các phiên: skill `test-campaign`, tiến độ ở `test/PROGRESS.md`. Làm việc test lớn thì mở PROGRESS.md trước, không làm ngoài batch đang đến lượt.

## Test matrix

Mỗi flow/unit đáng kể phải có dòng trong `test/README.md` (module · luồng · tầng · file). Thêm flow mới hoặc đổi phạm vi test → cập nhật bảng cùng lượt. Luồng chính chưa có test ghi rõ "chưa có" để thấy khoảng trống.

## Chạy trước khi báo xong

`npx tsc --noEmit` · `yarn lint` · `yarn test` · `yarn test:flows` (cần Docker). Nếu không chạy được flow vì môi trường, **nói rõ trong báo cáo** và không tuyên bố đã xong phần đó.
