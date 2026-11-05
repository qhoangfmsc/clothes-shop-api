# 0013 — Tách quy tắc kỹ thuật thành 4 rule chi tiết

> Module: `common` (quy ước) · Trạng thái: Implemented · Ngày: 2026-10-26

## 1. Bối cảnh & vấn đề

`.claude/rules/engineering-principles.md` (75 dòng) gộp kiến trúc, design pattern, SOLID và coding convention vào một file. Mỗi phần chỉ có một bảng ngắn: nói "dùng gì" nhưng chưa giải thích **là gì, áp dụng thế nào trong repo này, pattern nào đang dùng / khi nào mới dùng / vì sao không dùng, cái gì đã được máy ép**. Người mới (và Claude ở phiên sau) khó code đồng nhất; skill `design-principles` có giáo trình nhưng không phải luật và một số chỗ đã cũ (tên service trước khi chia cell).

## 2. Mục tiêu & ngoài phạm vi

**Mục tiêu**
- Bốn rule riêng, mỗi rule đủ để người chưa biết khái niệm vẫn áp dụng đúng: định nghĩa → vì sao với dự án → luật cụ thể (phải / cấm) → ví dụ **đã đối chiếu với code** → ai ép (test/lint hay chỉ review) → checklist review.
- Phân biệt rõ ba nhóm pattern: **đang dùng** (có file làm mẫu), **sẽ dùng khi có điều kiện kích hoạt** (kèm điều kiện), **không dùng** (kèm lý do).
- `engineering-principles.md` còn lại là mục lục + nguyên tắc nền, trỏ sang bốn rule.
- Convention nào máy kiểm được thì có test (`src/common/architecture/conventions.spec.ts`): tên file `kebab-case` + hậu tố vai trò, class đặt theo tên file, DTO trong `dtos/`, controller không chạm DB, không exception HTTP thô, không `console.*`. Luật chưa ép được thì rule nói thẳng "chỉ review".

**Ngoài phạm vi**
- Đổi hành vi `src/`. Chỉ sửa hai cảnh báo Biome đang tồn tại ở `auth` (không đổi hành vi) để lint sạch, phục vụ cổng ở spec 0015, và thêm test kiến trúc/convention (vi phạm cũ còn lại nằm trong allowlist có lý do, chỉ co lại).
- Thêm pattern mới vào code (vd Strategy cho cổng thanh toán): chỉ ghi điều kiện kích hoạt.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Bốn rule riêng (`architecture`, `design-patterns`, `solid`, `coding-conventions`) + `engineering-principles` làm mục lục | Mỗi file một chủ đề, tìm nhanh; mỗi file mô tả được kỹ | Nhiều file; phải giữ chéo tham chiếu đúng |
| B. Giữ một file, viết dài ra | Một chỗ | File hàng trăm dòng, rule bị đọc lướt; khó trỏ tới một phần |
| C. Chuyển toàn bộ sang skill | Skill nạp theo nhu cầu | Skill không phải luật bắt buộc; mất tính "luôn áp dụng" |

**Chọn A**. Skill `design-principles` giữ vai trò giáo trình ngắn và trỏ sang rule, không lặp nội dung.

### 3.2 Kiến trúc & ranh giới

Tài liệu, test, và hai dòng code:
- `.claude/rules/architecture.md`, `design-patterns.md`, `solid.md`, `coding-conventions.md` (mới).
- `.claude/rules/engineering-principles.md` rút thành mục lục.
- `CLAUDE.md`, `feature-workflow.md`, `testing.md`, skills `design-principles`, `tech-spec`, `feature-workflow` trỏ đúng rule.
- `src/modules/auth/google-auth.service.ts`, `jwt.strategy.ts`: `!a || !a.b` → optional chain (hai cảnh báo Biome).

Nguyên tắc viết: mọi ví dụ "trong repo" phải mở được file ở đường dẫn ghi; mô tả hiện trạng lệch chuẩn thẳng thắn (không tô hồng).

### 3.3 Design pattern áp dụng

Không dùng pattern cho phần này. Rule `design-patterns.md` là nơi **ghi** pattern của cả dự án.

### 3.4 Kiểm tra SOLID

n.a. (tài liệu). Hai dòng optional chain không đổi cấu trúc.

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Không đổi.

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Unit | Bảy test convention: tên file, tên class, DTO, controller không chạm DB, exception thô, `console.*`, `process.env` trong module; mỗi test được thử phá bằng file vi phạm cố ý | `src/common/architecture/conventions.spec.ts` |
| Unit | Test quét tài liệu (spec 0015): mọi đường dẫn file được nhắc trong `.claude/rules` còn tồn tại, mọi liên kết nội bộ đúng | `tools/check-docs.spec.ts` |
| Hành vi | Không đổi hành vi `auth`: `auth.service.spec.ts`, flow `auth` giữ nguyên xanh | có sẵn |

## 5. Rủi ro & rollback

Rủi ro: rule dài bị đọc lướt; giảm bằng bảng tóm tắt đầu file và checklist cuối file. Rollback: `git revert`.

## 6. Kết quả triển khai

- **File:** `.claude/rules/architecture.md`, `design-patterns.md`, `solid.md`, `coding-conventions.md` (mới); `engineering-principles.md` thành mục lục + nguyên tắc nền + bảng "đang được máy ép"; `CLAUDE.md` mục nguyên tắc kỹ thuật trỏ bốn rule; skill `design-principles` viết lại gọn (bỏ phần trùng và đã cũ); `src/common/architecture/conventions.spec.ts` (7 test) + ba allowlist mới trong `architecture-allowlist.test-utils.ts`; `compareToAllowlist` chuyển sang `source-scan.test-utils.ts` để dùng chung; `google-auth.service.ts`, `jwt.strategy.ts` (optional chain, lint sạch).
- **Khác thiết kế:** thêm test `process.env` trong module (phát hiện khi viết rule vì `process.env` chỉ còn ở `core/`, `common/`, `main.ts`). Test quét tài liệu thuộc spec 0015 (`check:docs`).
- **Phát hiện khi đối chiếu:** `SepayWebhookService` tự khai báo mã `23505` thay vì dùng `isUniqueViolation`; còn vài `any` cũ (`category.service.ts`, JWT `expiresIn`, helper list-query); `.agent/skills/nest-best-practices` là mẫu chung không khớp dự án (đã ghi vào rule: rule trong `.claude/rules/` thắng). Không sửa trong lượt này (ngoài phạm vi).
- **Mỗi test mới đã thử phá:** thêm file sai tên/hậu tố/vị trí DTO/tên class, controller inject DataSource, ném `BadRequestException`, `console.log`, `process.env` → test đỏ đúng thông báo; xoá file thử.
- **Docs:** `docs/modules/common.md` (4.12), `test/README.md`, `docs/specs/README.md`.
