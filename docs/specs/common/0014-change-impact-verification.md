# 0014 — Kiểm tra lại theo phạm vi ảnh hưởng của thay đổi

> Module: `common` (quy trình + công cụ) · Trạng thái: Implemented · Ngày: 2026-10-26

## 1. Bối cảnh & vấn đề

`testing.md` hiện chỉ nói "chạm luồng tiền thì mở rộng flow liên quan" và Definition of Done yêu cầu chạy **toàn bộ** `yarn test` + `yarn test:flows`. Hai chỗ hở:

1. Không có định nghĩa "bên liên quan" là ai. Ví dụ thêm cổng PayPal vào `payment`: người làm có thể chỉ test `payment`, quên rằng `order` (huỷ đơn gọi `PaymentAttemptService`), `refund` (đọc `PaymentAttempt`/`PaymentTransaction`), `return` (qua `RefundService`), `pending-count`, `review` (đọc `Order`) cùng nằm trong vòng ảnh hưởng.
2. Không có chỗ nào **ghi lại** việc đã kiểm tra lại những gì. Báo cáo cuối liệt kê file spec/docs/test nhưng không nói phạm vi ảnh hưởng.

Đồ thị phụ thuộc giữa module có thể đo từ import thật (đã thử: `order` import `payment` + `refund`; `refund` import `payment` + `order` + `return`; `return` import `order` + `refund`; `review` import `order` + `product` + `media`...), và flow test có thể gắn với module qua tiền tố route mà chúng gọi (`/api/admin/refunds` → `refund`). Vì suy ra từ code nên không lệch theo thời gian như một bảng viết tay.

## 2. Mục tiêu & ngoài phạm vi

**Mục tiêu**
- Rule `change-impact.md`: định nghĩa phạm vi ảnh hưởng (module đổi, module phụ thuộc trực tiếp / gián tiếp, hạ tầng chung, migration), việc phải làm với từng tầng, và điều kiện "xong".
- Công cụ `yarn impact`: từ `git diff` (so với `main` mặc định) in ra module bị đổi, module bị ảnh hưởng (theo độ sâu), file docs phải rà, unit spec và flow file phải chạy lại; `--run` chạy hộ phần unit/flow.
- Spec template có mục **3.9 Ảnh hưởng & kiểm tra lại**; báo cáo cuối có dòng "phạm vi ảnh hưởng".
- Ví dụ làm rõ trong rule: thêm cổng thanh toán thứ hai (PayPal).

**Ngoài phạm vi**
- Chạy test chọn lọc **thay** cho bộ đầy đủ: CI và cổng cuối luôn chạy toàn bộ. `yarn impact --run` chỉ để vòng lặp phát triển nhanh và để có bằng chứng đã kiểm tra bên liên quan.
- Phân tích tĩnh mức hàm. Độ chi tiết là module.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Công cụ suy ra từ code: đồ thị import giữa module + gắn flow với module qua tiền tố route; rule nêu quy trình | Không lệch; chạy được ngay; có bằng chứng | Độ chính xác ở mức module; đồ thị rộng ở module lõi (product, order) |
| B. Bảng "module → bên liên quan" viết tay trong docs | Đơn giản | Lệch ngay khi code đổi; không ai kiểm |
| C. Chỉ rule bằng chữ ("nhớ test bên liên quan") | Không cần code | Không kiểm chứng được; đã là tình trạng hiện tại |

**Chọn A**; bảng tay (B) không dùng. Độ rộng của đồ thị chấp nhận: thà dư một flow còn hơn sót bên liên quan.

### 3.2 Kiến trúc & ranh giới

```
tools/                      (TypeScript, chạy bằng ts-node; không thuộc bundle production)
├── lib/source-graph.ts     quét src/modules: import → cạnh module→module; @Controller → tiền tố route; flow → module
├── lib/impact.ts           thuần: (file đổi, đồ thị, flow map) → báo cáo ảnh hưởng
├── impact.ts               CLI: git diff → báo cáo / --run
└── impact.spec.ts          unit (jest roots mở thêm `tools/`)
```

Luật suy ra:

| File đổi | Ảnh hưởng |
|---|---|
| `src/modules/<m>/**` (không phải spec/test-utils) | module `m` + phụ thuộc **trực tiếp** ngược (module import `m`, độ sâu 1) + **gián tiếp** (đóng bao bắc cầu, độ sâu ≥ 2) |
| `src/common/**`, `src/core/**`, `src/main*.ts` | tất cả module |
| `src/migrations/**`, `data-source.ts` | tất cả module (schema) + `common.md` |
| `test/support/**`, `test/jest.flows.config.js` | tất cả flow |
| `*.spec.ts`, `*.test-utils.ts` | chỉ module chứa nó |
| `docs/**`, `.claude/**`, `tools/**` | không ảnh hưởng runtime; vẫn chạy `check:docs` |

Flow luôn chạy: thư mục `access/` (bảng route–quyền, ma trận 401/403) và `rate-limit/`, vì mọi thay đổi route/quyền đều lộ ở đó.

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Hàm thuần tách I/O (functional core, imperative shell) | `lib/impact.ts` thuần, `impact.ts` chỉ chạy git/jest | Test được logic suy ra mà không cần git/DB | Thêm một lớp mỏng |
| Dữ liệu suy ra thay vì khai báo | đồ thị từ import, flow map từ route | Bảng tay sẽ lệch | Phụ thuộc cách viết import (`@/…` và đường dẫn tương đối; có test chặn gãy) |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | quét nguồn / suy luận / CLI tách file |
| O | ✔ | thêm module hay flow mới tự được nhận, không sửa công cụ |
| L, I | n.a. / ✔ | `impact()` nhận kiểu hẹp (`ModuleGraph`, `FlowMap`) |
| D | ✔ | CLI tiêm git/jest ở biên; logic không gọi tiến trình |

### 3.5–3.8 Dữ liệu, API, lỗi

Không đổi DB/API. Lỗi biên: file đổi không thuộc module nào (vd `package.json`) → "không phân loại được, chạy toàn bộ"; `git` không có `main` → báo rõ và dùng `HEAD~1`.

### 3.9 Ảnh hưởng & kiểm tra lại (mục mới của template)

Mỗi spec đầy đủ điền: module trực tiếp, module ảnh hưởng (lấy từ `yarn impact`), bảng "tầng · việc kiểm tra lại · file". Cỡ rút gọn: một dòng.

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Unit | đồ thị khớp kỳ vọng đã biết (`order → payment, refund`, `refund → return`); đổi `payment` kéo `order`, `refund`, `return`, `pending-count`; đổi `common` kéo mọi module; migration kéo mọi module; spec/test-utils chỉ module mình; flow map gắn đúng (`/api/admin/refunds` → `refund`); flow `access` luôn có mặt | `tools/impact.spec.ts` |
| Chống gãy | mọi module có ≥ 1 flow (trực tiếp hoặc qua route); mọi flow file thuộc ≥ 1 module hoặc nhóm toàn cục | `tools/impact.spec.ts` |
| Thủ công | `yarn impact --base HEAD~3` trên nhánh này cho ra danh sách hợp lý | báo cáo |

## 5. Rủi ro & rollback

Rủi ro: đồ thị rộng → danh sách dài (chấp nhận, vì đúng bản chất cửa hàng: product/order là lõi). Công cụ sai thì chỉ gợi ý sai, không chặn merge (cổng cuối chạy toàn bộ). Rollback: xoá `tools/impact*`.

## 6. Kết quả triển khai

- **File:** `tools/impact.ts` (CLI), `tools/lib/{fs,source-graph,impact,format-impact}.ts`, `tools/impact.spec.ts` (21 test); `package.json` (script `impact`, jest `roots` thêm `tools/`); `biome.json` (lint `tools/**`); `tsconfig.build.json` (loại `tools` khỏi bản build); rule mới `.claude/rules/change-impact.md`; cập nhật `feature-workflow.md` (bước ⑤, DoD mục 6–7), `testing.md`, `engineering-principles.md`, skills `tech-spec` (template mục 3.9), `feature-workflow`, `CLAUDE.md`.
- **Khác thiết kế:** (1) thêm `GLOBAL_FLOW_DIRS` (`access`, `rate-limit`, `health`): flow `route-table` nhắc `/api/admin/media` nên bị gắn nhầm vào `media`, và `rate-limit` gọi 7 module; các flow quét toàn hệ thống nên là lưới toàn cục. (2) spec/test-utils trong `src/common` chỉ chạy lại unit `src/common`, không kéo mọi module. (3) Module không có controller (`currency`) không bắt buộc có flow riêng; được phủ qua `shipping`, `site-config`.
- **Thử phá:** làm hỏng nhánh import tương đối của đồ thị → 3 test đỏ; vô hiệu nhánh `unitOnly` → 1 test đỏ. (Bài học: thử phá phải làm sau khi commit, vì file mới chưa được git theo dõi nên `git checkout` không khôi phục; đã khôi phục tay.)
- **Kết quả thật trên repo:** đổi `payment` kéo `order`, `pending-count`, `refund` (trực tiếp), `return`, `review` (gián tiếp), 26/39 flow; đổi `size-guide` chỉ 4/39 flow; đổi `common`/migration → 39/39.
- **Docs/test:** `docs/modules/common.md` (4.12), `test/README.md`, `docs/specs/README.md`.
