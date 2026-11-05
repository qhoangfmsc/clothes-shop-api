# 0002 — Tách logic thuần của ảnh khỏi `MediaService`

> Module: `media` · Trạng thái: Implemented · Ngày: 2026-10-24 · Cỡ: rút gọn (không đổi hành vi)

## 1. Bối cảnh & vấn đề

`MediaService` (333 dòng theo cách đếm của `architecture.spec.ts`) còn trong `OVERSIZED_SERVICES`. Đã đọc code và `media.service.spec.ts`. Service trộn hai thứ: điều phối I/O (Supabase Storage REST, bảng `media_files`) và ba hàm thuần không đụng I/O: nhận dạng định dạng ảnh theo magic bytes (`sniffImageMime`), dựng tên storage key an toàn (`sanitizeName`) và tên hiển thị (`displayName`). Luật `engineering-principles.md` mục 1: logic thuần tách khỏi I/O vào `*.util.ts` có unit test.

## 2. Mục tiêu & ngoài phạm vi

- Ba hàm thuần chuyển sang `media-file.util.ts` (nguyên văn), có unit test trực tiếp; `MediaService` xuống dưới 300 dòng; bỏ mục `media.service.ts` khỏi allowlist.
- **Không đổi hành vi** (cùng route, response, mã lỗi, tên key).
- Ngoài phạm vi: bọc Supabase thành adapter riêng (`SupabaseStorageClient`). Hiện test dùng `fetch` giả và chỉ có một nhà cung cấp, nên chưa đủ lý do (rule of three); nếu thêm nhà cung cấp thứ hai thì làm spec riêng.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| A. Tách ba hàm thuần ra util | Đúng nguyên tắc "thuần tách khỏi I/O", dễ test trực tiếp, thay đổi nhỏ | `MediaService` vẫn gánh phần gọi Storage |
| B. Tách adapter `SupabaseStorageClient` | Đúng nguyên tắc D (biên ngoài) | Thay đổi lớn hơn nhiều (cấu hình, lỗi, 7 hàm), chưa có nhà cung cấp thứ hai |

**Chọn A**.

### 3.2 Kiến trúc & ranh giới

`media/media-file.util.ts` xuất `sniffImageMime(buf)`, `sanitizeStorageName(originalName, mimeType)`, `displayName(originalName)`; `MediaService` gọi trực tiếp, không còn ba phương thức private tương ứng.

### 3.3 Design pattern áp dụng

Không dùng pattern (hàm thuần tách khỏi I/O). Cái giá: một file nhỏ.

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Nhận dạng/đặt tên file tách khỏi điều phối I/O |
| I | ✔ | Hàm nhận `Buffer`/`string`, không nhận cả service hay file multer |
| O / L / D | n.a. | Không đổi |

### 3.5–3.8 Dữ liệu, API, luồng, lỗi

Không đổi (không migration).

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Unit (mới) | Magic bytes JPEG/PNG/GIF87a/GIF89a/WebP/AVIF → đúng mime; buffer ngắn, HTML, rỗng → `null`; tên key bỏ dấu tiếng Việt/ký tự lạ, đúng đuôi theo mime, rỗng → `image`, cắt 80 ký tự; tên hiển thị bỏ path và ký tự điều khiển, cắt 255 | `media-file.util.spec.ts` |
| Unit/Flow có sẵn | upload, delete, resolve ảnh review | không sửa |
| Kiến trúc | Bỏ mục `media.service.ts` | `architecture.spec.ts` |

## 5. Rủi ro & rollback

Rủi ro thấp (di chuyển nguyên văn). Rollback: `git revert`.

## 6. Kết quả triển khai

- **File mới:** `media-file.util.ts` (3 hàm, nguyên văn), `media-file.util.spec.ts` (12 ca). **Sửa:** `media.service.ts` (332 → 289 dòng), allowlist kiến trúc (bỏ mục `media.service.ts`).
- **Khác thiết kế:** không có.
- **Kiểm chứng:** 841 unit (829 + 12 ca mới) và 883 flow đều xanh, độ phủ route 98/98 và 82/82. Phá thử: bỏ `avis` khỏi danh sách AVIF → 1 unit đỏ.
- **Docs:** `media.md` (4.7, 4.9), `common.md` (4.13), `test/README.md`.
