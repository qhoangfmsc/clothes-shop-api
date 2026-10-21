# 0003 — Cấu hình flow test ở file `.env.test` ngoài root

> Module: `testing` · Trạng thái: Implemented · Ngày: 2026-10-21 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

Giá trị cấu hình flow test (cổng/tài khoản Postgres, secret giả của JWT và SePay) nằm cứng trong `test/support/test-env.ts` và `docker-compose.test.yml`. Muốn đổi (vd cổng 55432 bị chiếm) phải sửa code ở hai nơi, dễ lệch nhau.

## 2. Mục tiêu & ngoài phạm vi

- Một file ở root, `.env.test`, là nơi duy nhất người dùng chỉnh; cả docker-compose và jest cùng đọc. Chỉ chứa phần khác môi trường thật và có thể cần chỉnh: kết nối Postgres test. Secret giả của JWT/SePay là hằng số trong code.
- Cấu hình sai bị phát hiện sớm với thông báo nêu rõ cần sửa gì ở đâu.
- Ngoài phạm vi: cấu hình dịch vụ ngoài (Supabase, Google, `STORAGE_URL`) — luôn rỗng và chặn mạng để test hermetic, không cho cấu hình.

## 3. Thiết kế

### 3.3 Design pattern

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Một nguồn cấu hình (single source of truth) + mặc định trong code | `.env.test` → `test-env.ts` (`TEST_ENV`) và `docker compose --env-file .env.test` | Hai nơi khai báo cùng giá trị dễ lệch | Thêm một file cần giữ trùng với `DEFAULTS` |
| Fail fast | `readPostgresOverrides`, `assertTestDatabase` | Cấu hình sai phát hiện ngay ở global-setup, không phải lỗi mơ hồ giữa chừng | — |

Thứ tự ưu tiên: `.env.test` (chỉ `POSTGRES_*`) > mặc định trong code; hằng số JWT/SePay cố định; dịch vụ ngoài luôn rỗng. Giá trị gán thẳng vào `process.env` nên thắng `.env` của app.

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | `test-env.ts` chỉ lo nạp và kiểm tra cấu hình test |
| O | ✔ | Thêm khoá cấu hình = thêm một dòng vào `DEFAULTS` và `.env.test` |
| L / I | n.a. | — |
| D | ✔ | Test và compose đều phụ thuộc file cấu hình, không phụ thuộc giá trị cứng |

### 3.8 Lỗi & trường hợp biên

| Tình huống | Hành vi |
|---|---|
| Khoá ngoài `POSTGRES_*` (kể cả `SUPABASE_*`, `GOOGLE_*`, `STORAGE_URL`) | Dừng ở global-setup, liệt kê khoá hợp lệ |
| `POSTGRES_DATABASE` không kết thúc `_test` | Dừng: "refuses to run on database" |
| Không kết nối được DB | Dừng, chỉ cách sửa `POSTGRES_*` và `yarn test:db:down && yarn test:db:up` |
| Không có file `.env.test` | Dùng mặc định trong code |

## 4. Kế hoạch test

Kiểm chứng thủ công (cấu hình là hạ tầng chạy trước jest, không viết được dưới dạng flow test): chạy mặc định; đổi cổng sang 55433 thì container và jest cùng đổi; khai báo `SUPABASE_URL`, tên DB không hợp lệ, khoá lạ, DB tắt — mỗi trường hợp báo đúng lỗi; khôi phục file. Hermetic vẫn được bảo vệ bởi `route-table.flow.ts` (env rỗng, `fetch` bị chặn).

## 5. Rủi ro & rollback

Đổi `POSTGRES_*` sau khi container đã tạo mà không `down` rồi `up` thì jest trỏ cổng/tài khoản khác container (lỗi kết nối, có hướng dẫn trong thông báo). Rollback: trả giá trị cứng vào `test-env.ts` và compose, bỏ `--env-file` khỏi script.

## 6. Kết quả triển khai

- **File:** tạo `.env.test`; sửa `test/support/test-env.ts`, `test/support/global-setup.ts` (thông báo lỗi), `docker-compose.test.yml` (đọc biến), `package.json` (`test:db:up/down` dùng `--env-file .env.test`; thêm `test:flows:run` = chỉ jest, không bật docker, dùng khi trỏ vào Postgres có sẵn).
- **Điều chỉnh sau:** ban đầu `.env.test` chứa cả secret giả JWT/SePay; rút gọn chỉ còn `POSTGRES_*` (phần thực sự khác môi trường thật), secret giả chuyển về hằng số trong `test-env.ts`.
- **Docs:** `docs/modules/common.md` (4.10–4.12), `test/README.md`, `.claude/rules/testing.md`, skill `module-test`, `docs/specs/README.md`.
- **Kiểm chứng:** 20 flow test xanh ở cả cổng mặc định và cổng 55433; 4 cấu hình sai đều báo đúng lỗi.
