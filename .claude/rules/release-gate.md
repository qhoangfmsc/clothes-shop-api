# Rule: cổng trước khi lên `main` (production)

`main` là nhánh production: Render build và deploy từ đó. Rule này là quy trình + danh sách kiểm tra bắt buộc để **không thứ gì thiếu lọt lên production**. Thiết kế: `docs/specs/common/0015-release-gate.md`. Quy trình viết code: `feature-workflow.md`; phạm vi kiểm lại: `change-impact.md`.

## 1. Nguyên tắc

1. **Không commit thẳng lên `main`.** Mọi thay đổi vào bằng PR từ nhánh `<loại>/<slug>`.
2. **Máy kiểm trước, người duyệt sau.** PR chỉ được merge khi check **`CI gate`** xanh. Người duyệt xem thiết kế, không xem format.
3. **Cái gì sai ở production phải bị bắt ở đâu đó trước đó.** Mỗi tầng dưới đây có một loại lỗi nó chịu trách nhiệm.
4. **Không bỏ qua cổng.** `git commit --no-verify` / `git push --no-verify` chỉ cho trường hợp khẩn cấp có lý do; CI vẫn chặn merge nên không có đường vòng thật.

## 2. Các tầng cổng

| Tầng | Chạy khi | Bắt gì | Lệnh |
|---|---|---|---|
| `pre-commit` (husky + lint-staged) | mỗi commit | Format, lint, import trên file đổi (Biome, tự sửa được thì sửa) | tự chạy |
| `commit-msg` (husky) | mỗi commit | Tiêu đề không theo mẫu `<loại>(<module>): <mệnh đề>` | tự chạy |
| `pre-push` (husky) | mỗi lần đẩy | Type check, lint không cảnh báo, docs, unit (`yarn verify:quick`) | tự chạy |
| `yarn verify` | trước khi xin merge | **Toàn bộ**: tsc, lint, `check:docs --strict`, unit, build, flow test + ratchet độ phủ, smoke boot production | thủ công |
| CI job `check` | mỗi PR / push main | audit phụ thuộc (critical chặn), tsc, lint (Biome, cảnh báo = lỗi), `check:docs --strict`, build, unit | tự chạy |
| CI job `change` | mỗi PR | Đổi code mà không đổi test hoặc docs (trừ trailer miễn có lý do) | tự chạy |
| CI job `flows` | mỗi PR / push main | Flow test trên Postgres thật + ratchet độ phủ endpoint | tự chạy |
| CI job `boot` | mỗi PR / push main | Bản build **chạy được**: migrate từ DB trống, từ chối cấu hình production sai, `/health` ok, route admin 401 | tự chạy |
| Workflow `post-deploy` | mỗi push vào `main` (sau khi Render deploy) | Bản mới không lên, `/health` đỏ, DB mất kết nối, route công khai lỗi, route admin để hở | tự chạy (cần biến repo `PRODUCTION_URL`, xem 4.4) |
| CI job `gate` (`CI gate`) | cuối cùng | Tổng hợp 4 job trên; là check duy nhất cần đặt "required" | tự chạy |
| Bảo vệ nhánh `main` + Render | merge / deploy | Chỉ merge khi `CI gate` xanh; chỉ deploy khi CI qua | **cài tay**, xem mục 4 |

## 3. Từng kiểm tra: bắt gì, sửa thế nào

| Kiểm tra | Bắt | Cách sửa khi đỏ |
|---|---|---|
| `yarn lint` | Format, lint, import không dùng, cảnh báo | `yarn lint:fix`; còn lại sửa tay |
| `npx tsc --noEmit` | Lỗi kiểu | Sửa code |
| `yarn test` | Unit, **kiến trúc** (`architecture.spec.ts`), **convention** (`conventions.spec.ts`), guard DTO, công cụ (`tools/`) | Sửa code, không thêm vào allowlist; allowlist chưa giảm thì giảm |
| `yarn test:flows` | Luồng thật qua HTTP + Postgres thật; route–quyền; ratchet độ phủ | Sửa code/test; route mới phải kèm ca thành công + ca lỗi |
| `yarn check:docs` | **D1** module thiếu docs/dòng README · **D2** spec thiếu trong chỉ mục / sai trạng thái / số không liên tục / (strict) còn Draft-Approved · **D3** spec Implemented thiếu mục 6 · **D4** liên kết markdown hỏng · **D5** đường dẫn file được nhắc không tồn tại · **D6** route chưa có trong docs module · **D7** flow thiếu trong test matrix · **D8** migration thiếu trong `common.md` · **D9** rule mồ côi | Sửa **docs** cho khớp code (code là sự thật); đừng nới kiểm tra |
| `yarn check:change` | **C1** đổi code mà không đổi test · **C2** đổi module mà không đổi `docs/modules/<module>.md` · **C3** đổi `common`/`core`/migration mà không đổi `common.md` | Bổ sung test/docs, hoặc thay đổi thật sự không đổi hành vi thì thêm trailer ở một commit: `No-Test: <lý do>` / `No-Docs: <lý do>` (lý do ≥ 3 ký tự, có nghĩa) |
| `yarn build` | Biên dịch production (loại `test`, `tools`) | Sửa code |
| `yarn smoke:prod` | Migration từ DB trống hỏng; app build không khởi động; cấu hình production sai vẫn chạy; thiếu guard; log production không phải JSON hoặc lộ query; script kiểm tra sau deploy sai | Xem log in ra; chạy cục bộ cần Docker test DB đang chạy |
| `yarn audit` (job `check`) | Lỗ hổng **critical** ở phụ thuộc production | Nâng/ghim bản vá (xem `common.md` 4.13 về `resolutions`) |

`yarn check:docs --strict` khác bản thường ở một điểm: spec còn **Draft/Approved** là lỗi (trên `main` mọi spec phải Implemented hoặc Superseded). Khi đang làm dở trên nhánh, dùng bản thường.

## 4. Cài đặt GitHub và Render (làm tay, một lần)

Những thứ này nằm ngoài repo; không có chúng thì cổng chỉ là khuyến nghị. Cần quyền admin repo.

**4.1 Bảo vệ nhánh `main`** (Settings → Branches → Add rule `main`, hoặc dòng lệnh):

```bash
gh api -X PUT repos/qhoangfmsc/clothes-shop-api/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["CI gate"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

Ý nghĩa: bắt buộc qua PR; merge chỉ khi **CI gate** xanh và nhánh đã cập nhật theo `main` (`strict`); không force-push, không xoá `main`; áp cả cho admin. Nếu có người duyệt thứ hai, tăng `required_approving_review_count` lên 1.

**4.2 Render**: Service → Settings → Build & Deploy → **Auto-Deploy: After CI Checks Pass** (hoặc `autoDeployTrigger: checksPass` trong `render.yaml`). Nhờ vậy `main` có commit mà CI đỏ/chưa chạy xong thì không được deploy.

**4.3 Biến môi trường production** (Render → Environment): đặt đủ các biến bắt buộc mà `core/env.validation.ts` kiểm (`JWT_SECRET` ≥ 32 ký tự và không phải giá trị mặc định, `POSTGRES_*`, `GOOGLE_CLIENT_ID`, `SEPAY_WEBHOOK_SECRET`, `SEPAY_RECEIVING_ACCOUNT`, `CORS_ORIGINS` là URL http(s)). Thêm biến mới vào code ⇒ thêm trên Render **trước** khi merge, nếu không app từ chối khởi động (đúng thiết kế, nhưng deploy sẽ hỏng).

**4.4 Kiểm tra sau deploy** (GitHub → Settings → Secrets and variables → Actions → **Variables** → `PRODUCTION_URL` = URL gốc của dịch vụ trên Render, không có `/` cuối). Chưa đặt thì workflow `post-deploy.yml` chỉ in cảnh báo, không giả vờ đã kiểm. Có thể chạy tay: `bash scripts/post-deploy-check.sh https://<url> [commit]`.

**4.5 Redis cho rate limit (chỉ khi chạy nhiều instance)**: tạo Redis (Render Key Value) và đặt `REDIS_URL` (`redis://` hoặc `rediss://`). Không đặt thì mỗi instance đếm riêng như trước; Redis lỗi thì tự rơi về đếm in-memory, API không lỗi.

## 5. Quy trình từ nhánh đến production

1. Làm theo `feature-workflow.md` (Đọc → Spec → Code + Test → Docs) trên nhánh `<loại>/<slug>`.
2. `yarn impact` + kiểm lại bên liên quan (`change-impact.md`).
3. `yarn verify` xanh cục bộ (cần Docker).
4. Mở PR (template `.github/pull_request_template.md`: điền spec, docs, phạm vi ảnh hưởng, rủi ro production).
5. CI chạy; đỏ thì sửa trên nhánh, không merge. `CI gate` xanh mới merge (squash hoặc merge commit; giữ tiêu đề theo mẫu).
6. Render tự deploy (khi đã bật 4.2). Chạy `start:prod`: migration có khoá advisory (nhiều instance an toàn) rồi app.
7. **Sau deploy**: workflow `post-deploy.yml` tự chạy `scripts/post-deploy-check.sh` (cần đặt biến repo `PRODUCTION_URL`, xem 4.4): chờ `/health.commit` khớp commit vừa merge, kiểm `status: ok`, `db: connected`, route công khai 200, route admin 401; đỏ là deploy hỏng, GitHub thông báo. Thủ công thêm khi đụng thanh toán: xác nhận cấu hình SePay (webhook secret, tài khoản nhận) trước khi mở bán.
8. **Hỏng thì**: redeploy bản trước trên Render (nhanh nhất). Nếu migration mới đã chạy, đánh giá `down` (`yarn migration:revert`) cẩn thận với dữ liệu; migration phải có `down` đúng và idempotent khi có thể (xem `coding-conventions.md` mục 8).

## 6. Miễn trừ có dấu vết

| Trường hợp | Cách |
|---|---|
| Thay đổi thật sự không đổi hành vi (đổi tên nội bộ, format, comment) | Trailer `No-Test:` / `No-Docs:` kèm lý do ở một commit của PR; nêu rõ trong mô tả PR |
| Route không thể có ca lỗi | `exempt` trong `test/coverage-baseline.json` kèm lý do (xem `testing.md`) |
| Vi phạm kiến trúc cũ chưa sửa | Allowlist có lý do, chỉ co lại |
| Khẩn cấp (hotfix production) | Vẫn qua PR + CI; có thể rút gọn spec (cỡ rút gọn) nhưng không bỏ test của lỗi vừa sửa; bổ sung spec/docs ngay sau trong PR kế |

## 7. Cổng này KHÔNG bắt được (nói thẳng)

| Rủi ro | Hiện trạng / việc thủ công |
|---|---|
| Tích hợp thật với SePay, Google, Supabase | Flow test chạy offline, đầu vào ngoài được giả. Cần thử trên staging với khoá thật trước khi mở bán lần đầu |
| Lệch giữa entity TypeORM và schema do migration | Không kiểm tự động được: entity không mô tả FK/CHECK nên `migration:generate --check` báo nhiễu. Nguồn sự thật là migration; flow test chạy trên schema dựng từ migration nên lệch lộ ra khi chạy |
| Rate limit khi chạy nhiều instance mà chưa có Redis | Không đặt `REDIS_URL` thì mỗi instance đếm riêng (giới hạn thực tế nhân số instance); đặt `REDIS_URL` để dùng chung (4.5). Cửa sổ cố định: sát ranh giới có thể qua tối đa ~2× |
| Hiệu năng, tải | Không có kiểm tra |
| Quan sát vận hành | Có log JSON mỗi request và kiểm tra sống sau deploy; chưa có gom log, đo lường, cảnh báo theo ngưỡng lỗi (cần dịch vụ giám sát ngoài) |
| Chất lượng thiết kế, tên, phản ví dụ | Chỉ review người (checklist cuối các rule) |

## 8. Checklist trước khi merge

- [ ] `CI gate` xanh (4 job: check, change, flows, boot)
- [ ] Spec Implemented, mục 6 đã điền; docs và test matrix khớp
- [ ] Phạm vi ảnh hưởng đã kiểm lại; bên liên quan còn xanh
- [ ] Migration (nếu có) chạy được trên dữ liệu thật, có `down`
- [ ] Biến môi trường mới đã đặt trên Render
- [ ] Hợp đồng API đổi đã được duyệt và ghi docs
