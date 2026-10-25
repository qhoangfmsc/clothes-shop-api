# 0015 — Cổng trước khi lên `main` (production)

> Module: `common` (CI + quy trình) · Trạng thái: Draft · Ngày: 2026-10-26

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
.husky/pre-push          yarn verify:quick
.github/workflows/ci.yml thêm job docs, job change (PR), job boot; lint thêm --error-on-warnings
.github/pull_request_template.md
```

**`check:docs`** (mỗi mục là một quy ước đã ghi ở rule, nay có máy kiểm):

| # | Kiểm | Vì sao |
|---|---|---|
| D1 | Mỗi `src/modules/<m>` có `docs/modules/<m>.md` và dòng trong `docs/README.md`; mỗi docs module (trừ `common`) có thư mục thật | module mới phải có docs |
| D2 | Mọi spec `docs/specs/<m>/NNNN-*.md`: có trong `docs/specs/README.md`, số duy nhất trong module, header có trạng thái hợp lệ, **không ở Draft/Approved trên `main`** (chế độ `--strict`, CI nhánh `main`/PR vào `main`) | "chưa đủ 5 bước = chưa xong" |
| D3 | Spec Implemented có mục `## 6.` không còn placeholder `(điền sau khi xong)` | spec không bỏ lửng |
| D4 | Liên kết markdown tương đối trỏ đúng file | docs không chết link |
| D5 | Đường dẫn file trong `` ` `` bắt đầu bằng `src/`, `test/`, `docs/`, `tools/`, `.claude/` phải tồn tại (bỏ qua dòng ghi "đã xoá/cũ" và spec đã Implemented, vì spec là lịch sử) | docs khớp cây thư mục |
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
| C3 | Đổi `src/migrations/**` thì phải đổi `docs/modules/common.md` | `No-Docs` |
| C4 | Thêm spec mới thì phải có dòng trong `docs/specs/README.md` (đã có D2) | — |
| C5 | Đổi hạ tầng test (`test/support/**`) hoặc route mới thì `test/README.md` đổi | `No-Docs` |

Trailer miễn là cách ghi nhận ngoại lệ (đổi tên nội bộ, format…) có dấu vết, đúng tinh thần ngoại lệ trong `feature-workflow.md`.

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
PR / push main ─┬─ check  (audit, tsc, lint --error-on-warnings, build, unit)
                ├─ docs   (yarn check:docs --strict)
                ├─ change (chỉ PR: yarn check:change --base origin/main)
                ├─ flows  (Postgres, flow test + ratchet độ phủ)
                └─ boot   (Postgres trống: migrate → node dist → /health)
Bảo vệ nhánh main: bắt buộc cả 5 job xanh + PR + branch up-to-date (cài tay, xem rule release-gate.md)
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

_(điền sau khi xong)_
