# 0018 — Log có cấu trúc và kiểm tra sau deploy

> Module: `common` (+ `scripts/`, `.github/workflows`) · Trạng thái: Implemented · Ngày: 2026-10-27

## 1. Bối cảnh & vấn đề

Hiện trạng quan sát được ở production:
- Log là text tự do của `ConsoleLogger` (`main.ts` bật mọi mức, gồm `debug`/`verbose`). Không có log mỗi request nên không biết ai gọi gì, bao lâu, trả mã nào; chỉ có lỗi 500 từ `AllExceptionFilter`.
- `RequestIdMiddleware` đã gắn `x-request-id` cho mỗi request nhưng **không log nào dùng nó** → không nối được một lỗi 500 với request gây ra nó.
- Sau deploy chỉ có kiểm tay (`release-gate.md` mục 5 bước 7). Deploy hỏng (app không lên, DB mất kết nối, bản cũ vẫn chạy do build lỗi) không ai báo.
- `/health` không cho biết đang chạy commit nào, nên không phân biệt "đã lên bản mới" với "bản cũ vẫn chạy".

## 2. Mục tiêu & ngoài phạm vi

**Mục tiêu**
- Production: log một dòng JSON mỗi sự kiện (stdout, nền tảng thu thập), mức `log/warn/error`; dev vẫn text dễ đọc.
- Mỗi request ghi một dòng khi xong: `requestId`, `method`, `path` (không query), `status`, `durationMs`, `ip`, `userId` (nếu đã xác thực). Không ghi body, header Authorization hay query (có thể chứa token/PII). Bỏ qua `GET /` và `GET /health`.
- Lỗi 5xx và vi phạm ràng buộc có `requestId` để nối với dòng request.
- `/health` trả thêm `commit` (từ `RENDER_GIT_COMMIT`, `null` nếu không có).
- Script kiểm tra sau deploy `scripts/post-deploy-check.sh` + workflow GitHub chạy sau mỗi push vào `main`: chờ bản mới (`commit` khớp), kiểm `/health` và một route công khai; thất bại → workflow đỏ → GitHub thông báo. Script được dùng cả trong `smoke:prod`.

**Ngoài phạm vi**
- Gửi log tới dịch vụ ngoài (Datadog, Sentry), metric, tracing, dashboard.
- Cảnh báo theo ngưỡng lỗi (cần dịch vụ giám sát).
- Đổi nội dung `AllExceptionFilter` response (chỉ thêm `requestId` vào log, không vào body).

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. `ConsoleLogger({ json: true })` có sẵn của Nest 11 + `RequestLogMiddleware` tự viết + workflow kiểm tra sau deploy** | Không thêm phụ thuộc; log JSON chuẩn; kiểm tra sau deploy chạy ngoài app nên báo được cả khi app chết | Trường log tự định nghĩa; không gom/lọc (nền tảng log lo) |
| B. `pino` (+ `nestjs-pino`) | Nhanh, hệ sinh thái lớn, tự log request | Thêm 2–3 phụ thuộc, thay logger toàn app, đổi cách dùng `Logger` ở mọi service |
| C. Dịch vụ giám sát (Sentry/Datadog) | Cảnh báo thật, gom lỗi | Tài khoản/chi phí/secret ngoài repo; không thuộc phạm vi refactor |
| D. Không làm | Không đổi gì | Giữ nguyên các hở ở mục 1 |

**Chọn A**. Pattern: **Structured logging** (một sự kiện = một đối tượng JSON, trường cố định) và **Middleware** của Nest cho hành vi ngang.

### 3.2 Kiến trúc & ranh giới
```
main.ts                                  logger = production ? ConsoleLogger({ json:true, logLevels:[log,warn,error] }) : mọi mức, text
common/middleware/request-log.middleware.ts   ghi 1 dòng khi response 'finish'; dùng hàm thuần buildRequestLog()
common/filter/exception.filter.ts        log 5xx / integrity kèm requestId (lấy từ header x-request-id của request)
main.controller.ts                       /health thêm commit
scripts/post-deploy-check.sh             poll /health (commit khớp, status ok, db connected) + GET /api/products?limit=1 → 200
.github/workflows/post-deploy.yml        on push main: chờ CI, rồi chạy script với PRODUCTION_URL (repo variable); bỏ qua nếu chưa đặt
scripts/smoke-prod.sh                    gọi post-deploy-check.sh với bản vừa chạy
```
`common/` không import `modules/`; `userId` lấy từ `req.user` (do `JwtAuthGuard` gắn) bằng kiểu hẹp `{ id?: string }`, không import entity.

### 3.3 Design pattern áp dụng
| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Structured logging | `buildRequestLog`, `ConsoleLogger json` | Log text không lọc/nối được | Phải giữ trường ổn định |
| Middleware (Chain of Responsibility của Nest) | `RequestLogMiddleware` | Log mọi request ở một chỗ | Chạy trước guard nên `userId` chỉ có khi log lúc `finish` |
| Hàm thuần tách I/O | `buildRequestLog(req, res, ms)` | Test được trường log, đặc biệt "không lộ query/body" | Thêm một hàm |
| Probe ngoài app | `post-deploy-check.sh` | Phát hiện cả lúc app chết | Cần biến repo `PRODUCTION_URL` |

### 3.4 Kiểm tra SOLID
| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | middleware chỉ log request; filter chỉ định dạng lỗi; script chỉ kiểm deploy |
| O | ✔ | thêm trường log = thêm vào hàm thuần |
| L, I | n.a. / ✔ | `buildRequestLog` nhận kiểu hẹp (`method`, `originalUrl`, `ip`, `user?`) |
| D | ✔ | logger tiêm qua `app.useLogger`; middleware nhận nơi ghi qua `Logger` của Nest |

### 3.5–3.6 Dữ liệu, API
Không đổi DB. `GET /health` thêm trường `commit: string | null` (cộng thêm, không phá hợp đồng). Biến đọc (không bắt buộc): `RENDER_GIT_COMMIT` (Render tự đặt).

### 3.7 Luồng
Request → `RequestIdMiddleware` → `RequestLogMiddleware` (đăng ký `res.on('finish')`) → guard/controller → response → dòng log `{"level":"log","context":"HTTP","message":"request","requestId":"…","method":"GET","path":"/api/orders","status":200,"durationMs":12,"ip":"…","userId":"…"}`. Lỗi 5xx: filter log `{"level":"error",…,"requestId":"…"}` trước, middleware log dòng request sau.
Sau deploy: workflow `post-deploy` (khi push vào `main`) → gọi script tới `PRODUCTION_URL` mỗi 15 giây tối đa 15 phút cho tới khi `/health.commit` = `github.sha`, rồi kiểm `status ok`, `db connected`, `GET /api/products?limit=1` = 200.

### 3.8 Lỗi & biên
| Tình huống | Hành vi |
|---|---|
| URL có query chứa token | `path` bỏ query; query không được ghi |
| Path có id (`/api/orders/abc123`) | ghi nguyên path (id không bí mật); nếu có route pattern (`req.route.path`) thì ghi thêm `route` để gom nhóm |
| Request bị huỷ giữa chừng (client ngắt) | Express vẫn phát `close` không `finish` → không log (chấp nhận) |
| `RENDER_GIT_COMMIT` không có | `commit: null`; script bỏ bước chờ commit (chỉ kiểm sống) |
| `PRODUCTION_URL` chưa đặt | workflow kết thúc xanh với ghi chú "chưa cấu hình", không giả vờ đã kiểm |
| Deploy hỏng (health đỏ / commit không đổi sau 15 phút) | workflow đỏ, GitHub gửi thông báo |

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Unit | `buildRequestLog`: đủ trường; bỏ query; có `userId` khi `req.user.id`; có `route` khi có pattern; middleware: ghi một dòng khi `finish`, mức theo status (5xx error, 4xx warn, còn lại log), bỏ qua `/` và `/health`; filter: 5xx có `requestId` | `src/common/middleware/request-log.middleware.spec.ts`, `src/common/filter/exception.filter.spec.ts` |
| Flow | `GET /health` có `commit` (null khi chưa đặt biến, giá trị khi đặt) | `test/flows/health/health.flow.ts` |
| Smoke | `yarn smoke:prod` gọi `post-deploy-check.sh` với bản build; đầu ra production là JSON (parse được từng dòng) | `scripts/smoke-prod.sh` |
| Phá thử | log cả query → unit đỏ; bỏ bỏ-qua `/health` → unit đỏ; `commit` sai → script đỏ | thủ công |
| CI | `post-deploy.yml` chỉ chạy được trên GitHub sau khi người dùng đặt `PRODUCTION_URL` | — |

## 5. Rủi ro & rollback
- Log JSON làm công cụ xem log quen thuộc khó đọc: chỉ áp ở `NODE_ENV=production`.
- Lộ thông tin trong log: kiểm bằng test "không ghi query/body/header"; `ip` là dữ liệu cá nhân nhưng cần cho điều tra lạm dụng (nền tảng đã giữ IP ở log truy cập).
- Khối lượng log tăng (một dòng/request): chấp nhận; có thể tắt bằng cách bỏ middleware.
- Rollback: `git revert`; xoá workflow `post-deploy.yml`.

## 6. Kết quả triển khai

- **File:** `src/common/middleware/request-log.middleware.ts` (+ spec, 14 test), `src/main.ts` (logger JSON ở production, đăng ký middleware), `src/common/filter/exception.filter.ts` (+ spec: `requestId` trong log 5xx và lỗi ràng buộc, bỏ log 5xx trùng lặp), `src/main.controller.ts` (`commit` ở `/health`), `test/flows/health/health.flow.ts`, `scripts/post-deploy-check.sh`, `.github/workflows/post-deploy.yml`, `scripts/smoke-prod.sh` (kiểm tra sau deploy cả ca đúng và ca sai commit; log là JSON, có `requestId`, không lộ query, không ghi probe `/health`; thoát sớm nếu cổng bị tiến trình cũ chiếm).
- **Khác thiết kế:** (1) log 5xx trước đây ghi hai lần (một ở nhánh lỗi lạ, một ở khối `>= 500`); nay một lần, kèm `requestId`. (2) `smoke-prod.sh` kiểm cổng bận vì một app cũ còn sót làm smoke treo (phát hiện khi chạy lần đầu); nguyên nhân gốc là hàm `prod_env` chạy nền trong subshell nên `kill` không giết tiến trình node (app mồ côi chiếm cổng, lỗi có từ spec 0015); đã sửa bằng `exec` trong hàm và kiểm lại không còn tiến trình sót.
- **Chưa chạy được ở đây:** workflow `post-deploy.yml` trên GitHub; cần người dùng đặt biến repo `PRODUCTION_URL`. Script bên trong đã chạy thật qua `smoke:prod`.
- **Docs/test:** `docs/modules/common.md` (4.1, 4.10, 4.12), `release-gate.md` (mục 2, 4.4, 5, 7), `coding-conventions.md` (mục 6), `design-patterns.md` (Structured logging), `test/README.md`, `CLAUDE.md`.
