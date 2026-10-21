---
name: test-campaign
description: Quy trình test toàn diện cho BE clothes-shop-api theo từng lượt nhỏ (1 batch tối đa 5 route), có tự đong đếm và nối lại được giữa các phiên — ca thành công, ca lỗi, có/không auth, có/không quyền cho cả 98 route. Dùng khi người dùng nói "làm batch tiếp", "test toàn diện", "tiếp tục chiến dịch test", hoặc khi mở test/PROGRESS.md.
---

# test-campaign — test toàn diện, từng lượt nhỏ, nối lại được

Mục tiêu: mọi route của BE có test cho **ca đúng**, **ca lỗi nghiệp vụ**, **không/hỏng credential**, **thiếu/đủ quyền**. Làm trọn vẹn, chính xác, chấp nhận chậm. Chống tràn ngữ cảnh bằng ba thứ: **một lượt = một batch**, **mọi trạng thái nằm trong file** (không trong trí nhớ), **dừng sau mỗi batch**.

Luật liên quan: `.claude/rules/testing.md`, `.claude/rules/feature-workflow.md`, `.claude/rules/engineering-principles.md`. Công cụ: skill `module-test`. Kế hoạch + nhật ký: `test/PROGRESS.md`. Thiết kế hạ tầng: `docs/specs/testing/0001-*.md`, `0002-*.md`.

## Ba nguồn sự thật

| Nguồn | Chứa | Ai ghi |
|---|---|---|
| `test/PROGRESS.md` | Kế hoạch (P0 + 25 batch), trạng thái từng batch, nhật ký, phát hiện cần quyết định | Bạn, cuối mỗi lượt |
| Báo cáo độ phủ + `test/coverage-baseline.json` (có sau bước P0-3) | Route nào còn thiếu ca thành công / ca lỗi — **số do máy đo** | Máy (`yarn test:flows`) |
| `test/README.md` | Test matrix theo luồng/module | Bạn, khi thêm/đổi test |

Trước P0-3 chưa có số máy đo: đếm bằng danh sách route trong batch và tên test (`jest --verbose`), ghi rõ cách đếm trong nhật ký.

## Giao thức một lượt

**Bước 0 — Nối lại (luôn làm đầu tiên)**
1. Đọc `test/PROGRESS.md`. Có batch/bước `Đang làm` → tiếp tục đúng cái đó (chạy `git status` xem dở dang gì). Không có → lấy mục `Chưa làm` đầu tiên (P0 trước, rồi batch theo số).
2. Đổi trạng thái thành `Đang làm` ngay (checkpoint đầu tiên, trước khi làm gì khác).
3. Chạy `yarn test:flows` để biết trạng thái hiện tại (xanh/đỏ) — nếu đã đỏ từ trước, dừng và báo, đừng chồng thêm việc lên nền đỏ.

**Bước 1 — Đọc (chỉ đúng phạm vi batch)**
- `docs/modules/<module>.md` (mục API, dữ liệu, validation, luồng, error code, test), controller + service + DTO + entity của đúng các route trong batch, các `error-codes` liên quan, migration có CHECK/UNIQUE/FK của bảng đó.
- Không đọc module khác, trừ phụ thuộc trực tiếp cần để dựng dữ liệu. Docs lệch code → code là sự thật.

**Bước 2 — Lập danh mục ca** (viết thành bảng ngắn trong ghi chú của batch ở PROGRESS.md hoặc trong scratchpad). Mỗi route lấy ca từ "Danh mục ca" bên dưới; mỗi ca có **kết quả mong đợi đọc từ code** (status, `errorCode`, thay đổi DB). Mỗi route phải có ít nhất 1 ca thành công và 1 ca lỗi nghiệp vụ.

**Bước 3 — Dữ liệu**: thêm builder/step còn thiếu (`test/support/builders.ts`, `steps.ts`); builder phải thoả CHECK thật của DB. Không INSERT tay trong test.

**Bước 4 — Viết test**: mở rộng flow có sẵn của module hoặc tạo `test/flows/<module>/<luồng>.flow.ts` (một file một luồng nghiệp vụ). Tên test nêu hành vi và mã lỗi. Assert: status, `errorCode`, các field chính của response (tiền luôn kiểm cặp `...Vnd`/`...Usd`), và trạng thái DB cuối (kể cả "không đổi gì" ở ca lỗi).

**Bước 5 — Chạy và kiểm chứng**
1. Flow của batch xanh.
2. **Mutation sanity check** cho ít nhất 1–2 ca trọng yếu của batch (bắt buộc với luồng tiền/trạng thái): phá một dòng logic, thấy test đỏ, khôi phục (xác nhận `git diff` không còn dấu vết). Chỉ phá file không có thay đổi dở của người dùng; nếu file đó đang có chỉnh sửa dở thì sao lưu vào scratchpad trước và khôi phục từ bản sao, không dùng `git checkout`.
3. `yarn test:flows` đầy đủ xanh; lặp ≥ 3 lần liên tiếp nếu batch có thao tác thời gian/đồng thời (phát hiện flaky).
4. `npx tsc --noEmit`, `yarn lint` (không thêm cảnh báo), `yarn test`.

**Bước 6 — Tự đong đếm** (ghi số vào nhật ký)
- Số route trong batch đạt ✔ thành công và ✔ lỗi (phải là N/N; ngoại lệ chỉ khi route không thể có lỗi nghiệp vụ, vd `GET /health` → ghi `exempt` kèm lý do).
- Số test thêm (so với trước lượt), tổng flow test sau lượt.
- Sau P0-3: độ phủ toàn cục trước → sau (báo cáo tự in), baseline đã co lại đúng bằng số route vừa phủ (`--update-baseline`).

**Bước 7 — Phát hiện lỗi thật**: test đỏ vì **code có vẻ sai** (không phải test sai) → ghi vào mục "Phát hiện cần người dùng quyết định" trong PROGRESS.md (route, quan sát, mong đợi + nguồn) và đánh batch `Chặn` hoặc bỏ ca đó ra kèm ghi chú. **Không sửa code production lặng lẽ** (đổi hành vi cần spec riêng) và không viết test khẳng định hành vi nghi là lỗi như thể nó đúng.

**Bước 8 — Docs (khớp code vừa kiểm)**
- Mục 4.7 Test của module trong `docs/modules/<module>.md`, và dòng của module trong `test/README.md`.
- Spec của chiến dịch theo module: tạo `docs/specs/<module>/NNNN-flow-test-plan.md` (cỡ rút gọn) ở batch đầu của module, điền mục 6 và chuyển Implemented ở batch cuối của module. Test thuần không đổi code chạy nên không cần cập nhật các mục khác của docs module.
- Nếu phát hiện docs lệch code trong lúc đọc → sửa docs (code là sự thật) và ghi vào nhật ký.

**Bước 9 — Checkpoint cuối và dừng**
1. `test/PROGRESS.md`: batch → `Xong` (hoặc `Chặn` + lý do), thêm dòng nhật ký.
2. Báo cáo cho người dùng, **tối đa ~12 dòng**: batch nào, route nào, số test thêm, số liệu đong đếm (trước → sau), phát hiện cần quyết định, việc chưa chạy được (nói thẳng), file đã tạo/sửa, batch gợi ý kế tiếp.
3. **Dừng.** Không tự làm batch kế tiếp trừ khi người dùng bảo ("làm tiếp N batch" thì làm đúng N, mỗi batch đủ bước 0–9, có checkpoint giữa các batch).

## Danh mục ca (chọn theo loại route; không bỏ ca nào áp dụng được)

| Loại route | Ca thành công | Ca lỗi nghiệp vụ / biên |
|---|---|---|
| **GET list** | Rỗng; có dữ liệu; từng filter; `sort=field` và `sort=-field`; `search`; phân trang (trang đầu/cuối, `limit` mặc định 25) | `sort` ngoài whitelist, `sorts` bị từ chối, `limit` > 200 hoặc ≤ 0, `page` ≤ 0, filter sai kiểu/enum → 400; route theo user: không thấy dữ liệu của người khác |
| **GET detail** | Đúng shape, tiền có cặp Vnd/Usd, quan hệ nạp đủ | Id không tồn tại → 404 (mã lỗi); tài nguyên của người khác → 404/mã sở hữu |
| **POST create** | Hợp lệ → 201 + hàng DB đúng giá trị | Thiếu field bắt buộc, sai kiểu, vượt `MaxLength`/biên số, field lạ (`forbidNonWhitelisted`), FK không tồn tại, trùng UNIQUE (slug/SKU/email), vi phạm cross-field (`originalPrice < price`...), vi phạm rule nghiệp vụ; mỗi lỗi: DB không đổi |
| **PATCH/PUT update** | Sửa một phần; sửa không đổi gì (idempotent) | Id lạ → 404; của người khác; chuyển trạng thái sai (state machine); dữ liệu sai → 400; cập nhật làm trùng UNIQUE |
| **DELETE** | Xoá → DB đổi, hiệu ứng phụ (cascade/dọn dẹp) đúng | Id lạ → 404; bị FK RESTRICT chặn → mã lỗi đẹp (không 500); của người khác |
| **POST hành động** (approve, cancel, complete, confirm...) | Chuyển trạng thái đúng + hiệu ứng phụ (tiền, trạng thái đơn liên quan, tạo bản ghi con) | Sai trạng thái → mã invalid-state; gọi lần hai; thiếu điều kiện; số tiền vượt/lệch; mã tham chiếu trùng |
| **Tiền** | Cặp `Vnd`/`Usd`; USD theo tỷ giá (đơn dùng tỷ giá chốt) | Số âm, lẻ, vượt `MAX_MONEY_VND` |
| **Upload** | File hợp lệ (nhận diện theo magic bytes) | Rỗng, sai loại, quá lớn; dịch vụ lưu trữ giả bằng `jest.spyOn(globalThis, 'fetch')` |
| **Webhook** | Chữ ký đúng, khớp → hiệu ứng | Sai chữ ký, payload sai, trùng id, sai số tiền/tài khoản |
| **Route public** | Truy cập được không token | Input sai → 400; không rò dữ liệu riêng tư |
| **Auth/quyền** | Do ma trận P0-2 phủ cho mọi route (401 các kiểu, 403, đủ quyền, admin) | Batch chỉ thêm ca quyền khi có **quy tắc sở hữu/vai trò ngoài `@Permissions`** (vd chỉ chủ đơn mới xem) |

## Quy tắc chính xác

- Giá trị mong đợi (status, `errorCode`, số tiền, trạng thái) **đọc từ code/migration/docs**, không từ trí nhớ hay suy đoán.
- Ca lỗi luôn assert `errorCode` (và status), rồi assert DB không đổi.
- Test độc lập, không phụ thuộc thứ tự; không hardcode id; dữ liệu bằng builder.
- Không ra mạng thật; dịch vụ ngoài giả ở biên (`sepayWebhook`, `fetch` spy).
- Không thêm pattern/abstraction mới trong test khi chưa lặp lần thứ ba (rule of three); khi lặp thì gom vào `steps.ts`/`builders.ts`.
- Mỗi lượt giữ diff nhỏ và tập trung: chỉ file của batch + builder/step cần thiết + docs/PROGRESS.

## Định nghĩa xong

**Một batch xong** khi: mọi route trong batch có ✔ thành công và ✔ lỗi (hoặc `exempt` có lý do); test xanh ổn định; mutation check đã làm; tsc/lint/`yarn test` qua; docs 4.7 + `test/README.md` + PROGRESS.md đã cập nhật; số đong đếm đã ghi; báo cáo đã gửi.

**Chiến dịch xong** khi: báo cáo độ phủ cho 98/98 route có ca thành công và ca lỗi (trừ `exempt`), `coverage-baseline.json` rỗng, ma trận auth/quyền xanh, mọi module có spec kế hoạch test ở trạng thái Implemented, `docs/modules/*.md` mục 4.7 khớp thực tế, mọi mục "Phát hiện" đã được người dùng quyết định.
