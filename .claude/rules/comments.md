# Rule: comment code — ít, ngắn, đúng chỗ

Mặc định **không comment**. Tên rõ ràng và cấu trúc tốt thay cho comment.

## Chỉ comment khi người đọc không suy ra được từ code

- Lý do (vì sao), ràng buộc ẩn, bất biến, thứ tự khoá, workaround.
- Quy tắc nghiệp vụ không hiển nhiên.
- Một dòng tên pattern + vấn đề nó giải, tại chỗ định nghĩa pattern.

## Giới hạn

- **Một dòng** (~120 ký tự) là chuẩn. Ngoại lệ hiếm: tối đa 3 dòng cho một quy tắc nghiệp vụ khó.
- Không docblock nhiều đoạn; không `@param`/`@returns` lặp lại tên và kiểu; không nhắc lại tên hàm.
- Không ví dụ dài, không lịch sử thay đổi, không giải thích thiết kế: những thứ đó thuộc spec (`docs/specs/`) hoặc docs module.
- Không comment chia mục (`// ====`, `// ---`), không code bị comment out.
- `/** */` chỉ cho hàm/kiểu export dùng chung khi tên chưa đủ rõ, một dòng.
- Test: tên test mô tả hành vi nên không comment lại; chỉ chú thích con số hoặc mục đích không hiển nhiên.
- Tiếng Việt, ngắn, cùng giọng với code hiện có.

## Áp dụng

- Code mới theo rule này. Code cũ: khi chạm file thì tỉa comment dài ở đoạn mình sửa, không dọn hàng loạt.
- Review: comment dài hơn code nó giải thích là dấu hiệu phải rút gọn, đổi tên, hoặc chuyển nội dung sang spec.
