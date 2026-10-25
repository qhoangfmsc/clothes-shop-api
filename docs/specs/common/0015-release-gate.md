# 0015 — Cổng trước khi lên `main` (production)

> Module: `common` (CI + quy trình) · Trạng thái: Implemented · Ngày: 2026-10-26

## 1. Bối cảnh & vấn đề

CI hiện có (`.github/workflows/ci.yml`): audit, `tsc`, `lint`, `build`, `test`, `test:flows:run`, `test:coverage`. Các hở đã đo được:

| Hở | Hiện trạng |
|---|---|
| Hook commit không chạy | `package.json` có `lint-staged` và `husky` (`prepare`) nhưng thư mục `.husky/` chỉ có `_` (do husky sinh), **không có `pre-commit`** → lint-staged chưa từng chạy |
| Cảnh báo lint không chặn | `yarn lint` thoát 0 khi chỉ có warning (đang có 2 warning) |
| Docs không được kiểm | Không gì chặn: docs lệch code, spec kẹt Draft, đường dẫn file chết, route mới không có trong docs, flow không có trong test matrix, migration không ghi `common.md` |
| Quy trình không ép | Đổi `src/modules/x` mà không đụng docs hay test vẫn merge được |
| Build qua ≠ chạy được | `yarn build` chỉ biên dịch; chưa có kiểm tra "app đã build khởi động được ở production với migration từ DB trống" |
| Không chặn merge | Repo không có PR template; bảo vệ nhánh là cài đặt GitHub (không nằm trong repo) |

## 2. Mục tiêu & ngoài phạm vi

**Mục tiêu**: không thứ gì thiếu đủ 5 bước của workflow (code đúng, test, docs, spec, build chạy được) lọt lên `main`:
1. Cổng máy kiểm (CI, bắt buộc xanh): format+lint **không warning**, type check, build, unit, flow + ratchet độ phủ, **kiểm tra docs** (`yarn check:docs`), **kiểm tra kỷ luật thay đổi** trên PR (`yarn check:change`), **smoke boot production** (migrate từ trống → chạy bản build → `/health`).
2. Hook cục bộ: `pre-commit` (Biome trên file đổi), `pre-push` (`yarn verify:quick`).
3. `yarn verify` = chuỗi đầy đủ cục bộ (giống CI), `verify:quick` bỏ flow/smoke.
4. PR template (checklist) + rule `release-gate.md` mô tả quy trình và **cài đặt bảo vệ nhánh `main` bằng tay** (không thể làm từ repo).

**Ngoài phạm vi**
- Tự bật bảo vệ nhánh / cấu hình Render (cần quyền người dùng; chỉ hướng dẫn).
- Deploy tự động, canary, rollback tự động, observability.
- Phát hiện lệch giữa entity và migration (`migration:generate --check`): sẽ thử; nếu nhiễu (CHECK/DEFERRABLE không mô hình hoá trong entity) thì ghi vào rule như điểm chưa ép.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Script TypeScript tự viết (`tools/check-docs.ts`, `tools/check-change.ts`) nối vào CI + hook | Kiểm đúng quy ước riêng của repo; chạy cục bộ = chạy CI; có unit test | Phải bảo trì script |
| B. Dùng tool ngoài (markdownlint, lychee link-check) | Có sẵn | Không biết quy ước riêng (spec Implemented, route ↔ docs); thêm phụ thuộc |
| C. Chỉ dựa review người | Không code | Chính là tình trạng hiện tại |

**Chọn A** cho kiểm quy ước riêng. Format markdown không ép (không có giá trị tương xứng).

### 3.2 Kiến trúc & ranh giới

```
tools/check-docs.ts      yarn check:docs     đối chiếu docs/spec/test matrix ↔ code (không DB)
tools/check-change.ts    yarn check:change   PR: đổi src → phải có test + docs (hoặc trailer miễn có lý do)
scripts/smoke-prod.sh    yarn smoke:prod     migrate từ trống → chạy dist ở NODE_ENV=production → GET /health

.husky/pre-commit        lint-staged (Biome --fix trên file đổi)
.husky/commit-msg        tiêu đề theo mẫu <loại>(<module>): <mệnh đề>
.husky/pre-push          yarn verify:quick
.github/workflows/ci.yml thêm job change (PR), boot, gate; check:docs nằm trong job check; lint coi cảnh báo là lỗi
.github/pull_request_template.md
```

**`check:docs`** (mỗi mục là một quy ước đã ghi ở rule, nay có máy kiểm):

| # | Kiểm | Vì sao |
|---|---|---|
| D1 | Mỗi `src/modules/<m>` có `docs/modules/<m>.md` và dòng trong `docs/README.md`; mỗi docs module (trừ `common`) có thư mục thật | module mới phải có docs |
| D2 | Mọi spec `docs/specs/<m>/NNNN-*.md`: có trong `docs/specs/README.md`, số duy nhất trong module, header có trạng thái hợp lệ, **không ở Draft/Approved trên `main`** (chế độ `--strict`, CI nhánh `main`/PR vào `main`) | "chưa đủ 5 bước = chưa xong" |
| D3 | Spec Implemented có mục `## 6.` không còn placeholder `(điền sau khi xong)` | spec không bỏ lửng |
| D4 | Liên kết markdown tương đối trỏ đúng file | docs không chết link |
| D5 | Đường dẫn file trong `` ` `` bắt đầu bằng `src/`, `test/`, `docs/`, `tools/`, `.claude/` phải tồn tại (chỉ docs module, README, test/README, CLAUDE.md, rule, skill; spec không kiểm vì là lịch sử quyết định) | docs khớp cây thư mục |
| D6 | Mỗi route (method + path đầy đủ) của controller có mặt trong `docs/modules/<module sở hữu>.md` | docs API không thiếu endpoint |
| D7 | Mỗi file `test/flows/**/*.flow.ts` có trong `test/README.md` | test matrix không thiếu |
| D8 | Mỗi migration có trong bảng migration của `docs/modules/common.md` | `module-docs.md` yêu cầu |
| D9 | Mỗi file `.claude/rules/*.md` nhắc tới được liệt kê trong `CLAUDE.md` hoặc rule mục lục | rule không mồ côi |

Các mục không đạt trên hiện trạng: sửa **docs** (docs lệch code thì code là sự thật), không nới kiểm tra; nếu một mục cần miễn trừ thì có danh sách miễn trừ kèm lý do trong chính `check-docs.ts`, chỉ co lại.

**`check:change`** (chỉ PR, so `origin/main...HEAD`):

| # | Luật | Miễn |
|---|---|---|
| C1 | Đổi `src/modules/**`, `src/common/**`, `src/core/**` (không tính spec/test-utils) thì phải đổi ít nhất một file test (`*.spec.ts` hoặc `test/flows/**`) | Trailer `No-Test: <lý do>` ở một commit của PR |
| C2 | Đổi `src/modules/<m>/**` thì phải đổi `docs/modules/<m>.md` | Trailer `No-Docs: <lý do>` |
| C3 | Đổi `src/migrations/**` hoặc `src/common`, `src/core` thì phải đổi `docs/modules/common.md` | `No-Docs` |

C4/C5 trong bản nháp (spec mới có dòng chỉ mục, flow mới có dòng test matrix) đã được `check:docs` D2/D7 phủ nên không lặp ở đây. Trailer miễn là cách ghi nhận ngoại lệ (đổi tên nội bộ, format…) có dấu vết, đúng tinh thần ngoại lệ trong `feature-workflow.md`.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Quality gate / pipeline of checks | CI + `verify` | Lỗi vặt lọt lên production | Mỗi check thêm thời gian CI |
| Hàm thuần + I/O ở biên | `check-docs`, `check-change`: hàm nhận cây file / danh sách file đổi, trả danh sách vi phạm | Unit test không cần git/FS thật | Thêm lớp đọc FS mỏng |
| Ratchet (đã dùng cho độ phủ, allowlist) | danh sách miễn trừ chỉ co | Nợ cũ không phình | Phải dọn khi giảm |
| Fail-fast | smoke boot production dùng `validateEnv` thật | Sai cấu hình phát hiện lúc deploy | Cần env giả hợp lệ trong CI |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | mỗi kiểm tra một hàm; CLI tách khỏi logic |
| O | ✔ | thêm kiểm tra = thêm hàm vào danh sách, không sửa chỗ khác |
| L | n.a. | |
| I | ✔ | hàm nhận kiểu hẹp (`RepoSnapshot`, `string[]` file đổi) |
| D | ✔ | FS/git tiêm ở biên |

### 3.5–3.6 Dữ liệu, API

Không đổi. Smoke chỉ gọi `GET /health`.

### 3.7 Luồng CI

```
PR / push main ─┬─ check  (audit, tsc, lint (cảnh báo = lỗi), check:docs --strict, build, unit)
                ├─ change (chỉ PR: yarn check:change --base origin/<base>)
                ├─ flows  (Postgres, flow test + ratchet độ phủ)
                ├─ boot   (Postgres trống: migrate → node dist → /health)
                └─ gate   (tổng hợp 4 job; "CI gate" là check required duy nhất)
Bảo vệ nhánh main: bắt buộc PR + CI gate xanh + branch up-to-date (cài tay, xem rule release-gate.md)
```

### 3.8 Lỗi & biên

| Tình huống | Hành vi |
|---|---|
| Commit trực tiếp lên `main` | CI vẫn chạy trên push (đã có); chặn thật cần bảo vệ nhánh (cài tay) |
| Không có `origin/main` (clone nông) | `check:change` báo thiếu ref, thoát 2 (CI dùng `fetch-depth: 0`) |
| Trailer miễn thiếu lý do | Không tính |

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Unit | từng mục D1–D9 và C1–C5: ca đúng + ca vi phạm trên cây file giả; trailer miễn; trailer rỗng không tính | `tools/check-docs.spec.ts`, `tools/check-change.spec.ts` |
| Chạy thật | `yarn check:docs --strict` xanh trên repo; thử phá từng loại (xoá dòng index spec, đổi tên file được nhắc, thêm route không docs) → đỏ đúng mục | báo cáo |
| Smoke | `scripts/smoke-prod.sh` chạy local với Postgres test → 200 `/health`; thử thiếu `JWT_SECRET` → app từ chối khởi động | báo cáo |
| CI | chạy trong GitHub Actions khi người dùng đẩy nhánh (chưa thể chạy cục bộ; nói rõ trong báo cáo) | — |

## 5. Rủi ro & rollback

Rủi ro: `check:docs` quá chặt gây nhiễu → mọi mục có danh sách miễn trừ kèm lý do; `check:change` chặn nhầm việc nhỏ → trailer miễn. Hook chậm → `pre-push` chỉ chạy `verify:quick`. Rollback: bỏ job khỏi CI, `git revert`.

## 6. Kết quả triển khai

- **File:** `tools/check-docs.ts`, `tools/lib/docs-checks.ts`, `tools/check-docs.spec.ts` (D1–D9); `tools/check-change.ts`, `tools/lib/change-checks.ts`, `tools/check-change.spec.ts` (C1–C3); `scripts/smoke-prod.sh`; `.husky/pre-commit`, `commit-msg`, `pre-push`; `.github/workflows/ci.yml` (job `change`, `boot`, `gate`; `check` thêm `check:docs --strict`); `.github/pull_request_template.md`; `package.json` (`lint` coi cảnh báo là lỗi và quét `tools`; script `check:docs`, `check:change`, `smoke:prod`, `verify:quick`, `verify`); rule mới `.claude/rules/release-gate.md`; `README.md` (bỏ liên kết tương đối tới repo FE khiến D4 đỏ).
- **Khác thiết kế:**
  1. Bỏ C4 và C5: đã được D2 (spec ↔ chỉ mục) và D7 (flow ↔ test matrix) phủ chính xác hơn.
  2. Thêm hook `commit-msg` (mẫu tiêu đề) và job `gate` tổng hợp để branch protection chỉ cần một check bắt buộc.
  3. D5 hiểu đường dẫn tương đối theo thư mục module (docs module viết `shared/order.constant.ts`) bằng khớp hậu tố, và tham chiếu spec theo số (`docs/specs/payment/0003`).
  4. Kiểm lệch entity ↔ migration: thử `migration:generate --check`, báo nhiễu toàn bộ FK/CHECK (entity không mô tả) nên **không bật**, ghi ở `release-gate.md` mục 7 và `common.md` 4.13.
  5. Không sửa `render.yaml` / không đặt bảo vệ nhánh: là cài đặt production ngoài repo, đưa lệnh cụ thể ở `release-gate.md` mục 4 để người dùng tự bật.
- **Phát hiện:** `lint-staged` đã cấu hình nhưng thiếu file `.husky/pre-commit` nên chưa từng chạy; `README.md` có liên kết hỏng tới `../clothes-shop`. Đã sửa cả hai.
- **Thử phá (trên bản commit, rồi khôi phục):** bỏ dòng chỉ mục spec, đổi tên file được docs nhắc, thêm route không có trong docs, đổi tên flow trong test matrix, thêm migration không ghi docs, thêm liên kết hỏng, thêm module không docs → `check:docs` đỏ đúng mục D2/D5/D6/D7/D8/D4/D1. Vô hiệu hoá validate production → smoke boot đỏ. Hook: commit tiêu đề sai bị chặn; file có lỗi lint không tự sửa được bị chặn, file chỉ sai format được tự sửa rồi commit.
- **Chưa chạy được ở đây:** các job GitHub Actions (chưa đẩy lên); sẽ chạy lần đầu khi người dùng đẩy nhánh/mở PR. Mọi bước của chúng đã chạy cục bộ: `tsc`, `lint`, `check:docs --strict`, `build`, `test`, `test:flows`, `smoke:prod`.
- **Docs/test:** `docs/modules/common.md` (4.11, 4.12, 4.13), `test/README.md`, `docs/specs/README.md`, `CLAUDE.md`.
