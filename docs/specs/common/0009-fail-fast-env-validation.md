# 0009 — Từ chối khởi động khi cấu hình production sai

> Module: `common` (core) · Trạng thái: Approved · Ngày: 2026-10-24 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Cấu hình hiện đọc rải rác bằng `configService.get(key, default)` và không được kiểm tra khi khởi động (`ConfigModule.forRoot({ isGlobal: true })` không có `validate`). Hệ quả đo được:

- Thiếu `JWT_SECRET` → dùng `DEFAULT_JWT_SECRET = 'dev-secret-change-me'` (hằng số có trong mã nguồn): ai đọc repo đều ký được access token của mọi user, kể cả admin.
- Thiếu `CORS_ORIGINS` → mặc định `http://localhost:3000`; thiếu `POSTGRES_*` → mặc định `127.0.0.1`/`pguser`; thiếu `SEPAY_WEBHOOK_SECRET` → webhook thanh toán không xác thực được. Tất cả chỉ lộ ra khi có request thật.

Cách làm phổ biến (12-factor, `@nestjs/config`): kiểm tra toàn bộ env ngay lúc boot và **từ chối chạy** khi sai, kèm danh sách mọi lỗi.

## 2. Mục tiêu & ngoài phạm vi

- Khi `NODE_ENV=production`: thiếu hoặc yếu một biến bắt buộc → app không khởi động, thông báo nêu **tên biến và lý do, không in giá trị**, liệt kê hết mọi lỗi một lần.
- Môi trường khác (development, test): không đổi hành vi (giữ giá trị mặc định cho tiện dev).
- Mọi môi trường: giá trị sai định dạng (cổng không phải số 1–65535) bị từ chối.
- Ngoài phạm vi: schema hoá toàn bộ cấu hình thành object có kiểu; kiểm tra kết nối thật tới dịch vụ ngoài; đổi nơi các service đọc env.

## 3. Thiết kế

### Phương án
| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Hàm thuần `validateEnv` truyền vào `ConfigModule.forRoot({ validate })`** | Một chỗ, chạy trước mọi provider, test được không cần Nest | Phải liệt kê biến bắt buộc bằng tay |
| B. Joi schema (`validationSchema`) | Khai báo gọn | Thêm dependency `joi` cho việc đơn giản; thông báo lỗi khó kiểm soát để không lộ giá trị |
| C. Kiểm tra trong từng service khi dùng | Gần chỗ dùng | Lộ lỗi muộn (khi có request), rải rác |

**Chọn A.**

### Quy tắc (chỉ production)
| Biến | Yêu cầu |
|---|---|
| `JWT_SECRET` | có, ≥ 32 ký tự, khác `DEFAULT_JWT_SECRET` |
| `POSTGRES_HOST`, `POSTGRES_USERNAME`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE` | có (không rỗng) |
| `CORS_ORIGINS` | có, mọi origin là URL `http(s)://…` hợp lệ |
| `GOOGLE_CLIENT_ID` | có (đăng nhập duy nhất của hệ thống) |
| `SEPAY_WEBHOOK_SECRET`, `SEPAY_RECEIVING_ACCOUNT` | có (webhook phải xác thực được và biết tài khoản nhận) |

Không bắt buộc (tính năng tự báo 503 khi thiếu, đã có test): `SUPABASE_*`, `GOOGLE_CLIENT_SECRET`, `PAYMENT_TRANSFER_PREFIX`, `SEPAY_RECEIVING_BANK_*`.

Mọi môi trường: `PORT`, `POSTGRES_PORT` nếu có phải là số nguyên 1–65535.

### Pattern / SOLID
Hàm thuần tách khỏi I/O (đúng `engineering-principles.md` mục 1); không pattern mới. S ✔ (một việc: kiểm tra env), O ✔ (thêm quy tắc = thêm một dòng).

### Lỗi & biên
| Tình huống | Hành vi |
|---|---|
| production, `JWT_SECRET` ngắn/mặc định/thiếu | không khởi động; thông báo "JWT_SECRET: …" không chứa giá trị |
| production, nhiều biến sai | một thông báo liệt kê tất cả |
| development/test | khởi động như cũ |
| `PORT=abc` ở mọi môi trường | không khởi động |

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Unit | từng quy tắc, nhiều lỗi cùng lúc, không in giá trị bí mật, development/test bỏ qua, cổng sai | `src/core/env.validation.spec.ts` |
| Flow | `MainModule` thật với `NODE_ENV=production` và `JWT_SECRET` yếu → `compile()` bị từ chối, nêu `JWT_SECRET`; với cấu hình đủ thì dựng được | `test/flows/bootstrap/env-validation.flow.ts` |
| Phá thử | bỏ `validate` khỏi `ConfigModule` → flow đỏ | thủ công |

## 5. Rủi ro & rollback

Rủi ro: deploy production hiện tại thiếu biến bắt buộc sẽ **không khởi động** sau thay đổi này (đó là mục đích, nhưng cần kiểm `render.yaml`/dashboard trước khi deploy). Rollback: `git revert`.

## 6. Kết quả triển khai

_Điền sau khi làm xong._
