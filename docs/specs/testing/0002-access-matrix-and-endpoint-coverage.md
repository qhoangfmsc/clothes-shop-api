# 0002 — Ma trận auth/quyền tự phát hiện và đo độ phủ endpoint

> Module: `testing` (hạ tầng test, dùng chung) · Trạng thái: Approved · Ngày: 2026-10-21

## 1. Bối cảnh & vấn đề

Spec 0001 đã có flow test trên Postgres thật, nhưng mới phủ ~10 trong 98 route (15 public, 83 cần đăng nhập). Phần auth mới có 2 ca (không token → 401, thiếu quyền → 403) trên `GET /api/orders`. Hệ quả:

- Gắn nhầm hoặc bỏ sót `@Permissions` ở một route bất kỳ không có test nào bắt được.
- Không có con số nào cho biết "toàn diện" đến đâu; route mới có thể vào mà không có test.
- Test hiện chạy với `.env` của máy dev, nên route gọi Supabase/Google có thể ra mạng thật.

Hiện trạng đã đọc: `JwtAuthGuard` (401 do Passport, không có `errorCode`), `PermissionsGuard` (403 + `errorCode` 9001; admin bỏ qua; route không public mà thiếu `@Permissions` → 500/9002), `JwtStrategy.validate` (chỉ nhận `type: 'access'`, đọc user từ DB mỗi request, user `disabled` hoặc không tồn tại → 401). Quyền của user nằm ở `users.permissions`, `DEFAULT_USER_PERMISSIONS` không chứa quyền admin nào.

## 2. Mục tiêu & ngoài phạm vi

**Mục tiêu**
- Một test **tự phát hiện route** từ metadata của Nest và kiểm xác thực/phân quyền cho **mọi** route, kể cả route thêm sau này.
- **Snapshot bảng route–quyền** được commit: đổi quyền của route nào thì diff hiện ngay khi review.
- **Đo độ phủ endpoint bằng máy**: ghi lại request lúc chạy flow, báo route nào chưa có ca thành công / ca lỗi nghiệp vụ; cơ chế ratchet buộc route mới phải kèm test.
- Test **hermetic**: không ra mạng, không đọc cấu hình dịch vụ ngoài từ `.env` của dev.

**Ngoài phạm vi** (làm ở các task theo module sau)
- Ca thành công và ca lỗi nghiệp vụ chi tiết của từng module (task riêng cho từng module).
- Test đồng thời (race) giữa nhiều request.
- Đăng nhập Google thật.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Quét metadata (`DiscoveryService` + `Reflector`) sinh ca kiểm cho từng route + snapshot | Không thể sót route; route mới tự được kiểm; đổi quyền lộ ra trong diff | Phải gọi handler thật với input rỗng (an toàn vì validation chặn trước, và đã chặn mạng) |
| B. Viết tay ca 401/403 trong flow từng module | Dễ đọc | Dễ sót route, trùng lặp ~80 lần, quyền gắn nhầm vẫn lọt |
| C. Chỉ test `PermissionsGuard` bằng unit | Nhanh | Không chứng minh route thật được gắn đúng metadata |

**Chọn A**. Độ phủ: ghi request ở middleware của test app (không đổi code production) thay vì nhập tay danh sách.

### 3.2 Kiến trúc & ranh giới

```
test/support/routes.ts           discoverRoutes(app): [{method, path, isPublic, permissions}], routeKey, concretePath
test/support/coverage.ts         recorder (middleware) + ghi/đọc test/.coverage/*.jsonl|json, hàm tính độ phủ
test/support/coverage-report.ts  script chạy sau jest: in bảng, áp ratchet theo baseline
test/support/test-app.ts         gắn recorder trước app.init(); ghi routes.json mỗi lần boot
test/support/auth.ts             bearer(t, user, options): ký token đúng hoặc cố ý hỏng (sai secret, hết hạn, refresh)
test/flows/access/access-matrix.flow.ts   ma trận auth/quyền + invariants + snapshot
test/coverage-baseline.json      route hiện chưa có ca thành công / ca lỗi (chỉ được thu nhỏ)
```

Phụ thuộc một chiều `test/` → `src/`; không sửa code production. Request của ma trận mang header `x-test-probe` nên recorder bỏ qua (không tính vào độ phủ nghiệp vụ).

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Giải quyết vấn đề gì | Cái giá |
|---|---|---|---|
| Table-driven test (data-driven) | `access-matrix.flow.ts` | Một bộ ca áp cho ~98 route sinh từ dữ liệu, không copy tay | Thông báo lỗi phải gom và nêu rõ route + ca |
| Golden master / snapshot | `toMatchSnapshot` bảng route–quyền | Mọi thay đổi quyền thành diff phải duyệt | Phải cập nhật snapshot (`-u`) khi chủ ý đổi |
| Ratchet (allowlist chỉ co lại) | `coverage-baseline.json` | Độ phủ chỉ tăng; route mới bắt buộc có test | Thêm một file cần giữ đồng bộ |
| Middleware ghi nhận (Observer nhẹ) | recorder trong test app | Đo độ phủ mà không đụng code production | Chỉ đo được route đi qua HTTP |
| Test Data Builder (từ 0001) | `b.user({ permissions, status, role })` | Dựng user với tập quyền tuỳ ý | — |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | `routes.ts` chỉ phát hiện route; `coverage.ts` chỉ đo; `coverage-report.ts` chỉ báo cáo/áp ratchet; ma trận chỉ kiểm quyền |
| O | ✔ | Thêm route/quyền mới không phải sửa test (tự phát hiện); thêm loại ca mới = thêm một hàm ca |
| L | n.a. | Không có kế thừa |
| I | ✔ | Helper nhỏ, mỗi test import đúng cái cần |
| D | ✔ | Test dùng `DiscoveryService` của Nest qua DI, không đọc file controller bằng regex |

### 3.5 Dữ liệu

Không đổi schema. Thư mục `test/.coverage/` (gitignore) chứa `requests.jsonl` và `routes.json`, được xoá ở đầu mỗi lần chạy.

### 3.6 API / contract

Không đổi API. Lệnh: `yarn test:flows` chạy jest rồi `coverage-report.ts` (báo cáo + ratchet); chạy lọc `-t` bằng lệnh jest trực tiếp thì không báo cáo.

### 3.7 Luồng xử lý

**Ma trận** — với mỗi route, các ca (user dựng bằng builder, token ký bằng `JwtService`):

| Ca | Route public | Route cần đăng nhập |
|---|---|---|
| Không token / token rác | Không bị guard chặn | 401 (guard, không có `errorCode`) |
| Token sai secret / hết hạn / loại `refresh` | — | 401 |
| Token hợp lệ nhưng user không tồn tại / `disabled` | — | 401 |
| User thường, `permissions = []` | — | 403 + `errorCode` 9001 |
| User thường, mọi quyền **trừ** quyền route cần | — | 403 + 9001 |
| User thường, đúng một trong các quyền route cần | — | Không bị guard chặn |
| Admin (`permissions = []`) | — | Không bị guard chặn |
| User mặc định (`DEFAULT_USER_PERMISSIONS`) trên route `/api/admin/**` | — | 403 + 9001 |

"Không bị guard chặn" nghĩa là không phải (401 không `errorCode`) và không phải (403 + 9001); mọi status khác (200, 400, 404, 503...) đều chấp nhận vì đây là ma trận quyền, không phải test nghiệp vụ.

**Invariants** (mỗi cái một test): route không public đều khai báo ≥ 1 quyền; mọi route `/api/admin/**` không public và quyền của nó không nằm trong `DEFAULT_USER_PERMISSIONS`; mọi mã quyền được dùng đều tồn tại trong enum `Permission`.

**Độ phủ**: recorder ghi `{method, routePattern, status}` cho request không mang `x-test-probe`. Route "có ca thành công" = có status 2xx/3xx; "có ca lỗi" = có status ≥ 400 (với route cần đăng nhập thì loại 401/403, vì đó là kết quả của guard; hệ quả: lỗi nghiệp vụ 401/403 hiếm gặp ở route cần đăng nhập không được tính). `GET /` và `GET /health` được miễn ca lỗi (không có input). Ratchet: thất bại nếu route **không có trong baseline** mà thiếu ca; hoặc route **có trong baseline** nhưng nay đã đủ ca (phải gỡ khỏi baseline); hoặc baseline chứa route không còn tồn tại. Baseline lần đầu được sinh từ trạng thái hiện tại; `--update-baseline` chỉ gỡ mục đã đủ, thêm mục phải sửa tay (có chủ đích).

**Hermetic**: `test-env.ts` đặt rỗng `SUPABASE_*`, `GOOGLE_*`, `STORAGE_URL`; `env.ts` thay `fetch` toàn cục bằng hàm ném lỗi "Outbound network is disabled in flow tests" (test cần giả dịch vụ ngoài thì `jest.spyOn(globalThis, 'fetch')`).

### 3.8 Lỗi & trường hợp biên

| Tình huống | Hành vi mong đợi |
|---|---|
| Route mới thêm không có `@Permissions` | Invariant đỏ; thực tế sẽ trả 500/9002 cho user thường |
| Đổi quyền của một route | Snapshot đỏ, diff nêu rõ route nào |
| Route mới không có test thành công/lỗi | `yarn test:flows` đỏ ở bước ratchet |
| Handler cố gọi mạng khi được ma trận gọi với input rỗng | Bị `fetch` giả chặn; chỉ gây lỗi 5xx cục bộ, không ra ngoài |
| Chạy một phần (`-t`) | Không báo cáo độ phủ (dữ liệu không đủ) |

## 4. Kế hoạch test

| Tầng | Case | Vị trí file |
|---|---|---|
| Flow (ma trận) | 401 do thiếu/hỏng credential cho mọi route cần đăng nhập | `test/flows/access/access-matrix.flow.ts` |
| Flow (ma trận) | 403 khi không có quyền cần; qua guard khi có đúng một quyền; admin qua guard | cùng file |
| Flow (ma trận) | Route public truy cập được khi không token và token rác | cùng file |
| Flow (invariants) | Mọi route cần đăng nhập có quyền; admin route không dùng quyền mặc định; mã quyền hợp lệ | cùng file |
| Flow (snapshot) | Bảng route–quyền | cùng file |
| Công cụ | Ratchet độ phủ (chạy trong `yarn test:flows`) | `test/support/coverage-report.ts` |

## 5. Rủi ro & rollback

- Ma trận gọi handler thật với input rỗng: đã giảm rủi ro bằng validation chặn trước, DB test tách biệt, và chặn mạng. Nếu một route phát sinh hiệu ứng phụ không mong muốn, thêm vào danh sách bỏ qua có lý do trong file ma trận.
- Snapshot có thể đỏ ồn khi nhiều route đổi cùng lúc; cập nhật bằng `-u` sau khi xem diff.
- Rollback: xoá `test/flows/access/`, `test/support/{routes,coverage,coverage-report}.ts`, `test/coverage-baseline.json`, bỏ bước report khỏi script.

## 6. Kết quả triển khai

<Điền sau khi làm xong.>
