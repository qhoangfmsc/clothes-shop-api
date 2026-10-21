# 0001 — Xoá code chết ở `common/`

> Module: `common` · Trạng thái: Implemented · Ngày: 2026-10-21 · Cỡ: rút gọn

## 1. Bối cảnh & vấn đề

`docs/modules/common.md` (4.13) ghi nhận vài file trong `src/common` không được dùng. Quét lại có hệ thống (mọi `export` trong `src/common`, `src/core` đối chiếu với toàn bộ `src/`, `test/`, `data-source.ts`) cho kết quả rộng hơn: `validator/BaseValidate.ts` (toàn bộ), `types/baseType.ts` (`GConstructor`), `utils/helper.ts` (`sleep`, `formatError`), `utils/transform.ts` (`transformJSON`, `transformArray`, `transformImageUrl`), trong `base/base.interface.ts` các kiểu `DeepPartial`, `AsTypeSort`, `BaseListProps`, `BadRequestErrorResponse`, và `IBaseEntity` ở `base.entity.ts`. Code chết làm người đọc tưởng đó là chuẩn của dự án (vd `BaseValidate` ~150 dòng không ai gọi).

Ngoại lệ phát hiện khi kiểm tra: `ApiEndpoint` (`decorator/api-endpoint.decorator.ts`) chưa module nào dùng nhưng skill `.agent/skills/nest-best-practices/rules/05-controller-convention.md` quy định dùng nó thay cho `@ApiOperation`; đó là quy ước đã ghi nên **giữ lại**.

## 2. Mục tiêu & ngoài phạm vi

- Xoá phần không được dùng ở trên; không đổi hành vi nào quan sát được.
- `Paging` (duy nhất còn dùng của `base.interface.ts`) chuyển sang `typeorm-list-query.util.ts`, nơi duy nhất dùng nó; xoá `base.interface.ts`.
- Ngoài phạm vi: máy ép "không có export thừa" (làm ở phần quy ước được máy ép), `ApiEndpoint`.

## 3. Thiết kế

### 3.3 Design pattern

Không dùng pattern. Áp dụng nguyên tắc "không để code chết" của `engineering-principles.md`; đặt kiểu cạnh nơi dùng duy nhất của nó (`Paging`).

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | `Paging` về cùng file với hàm trả về nó thay vì file kiểu "tạp hoá" |
| O / L / I / D | n.a. | Không đổi cấu trúc |

### 3.7 Hệ quả

`transformImageUrl` là chỗ duy nhất đọc `process.env.STORAGE_URL`; sau khi xoá, biến này không còn được code nào đọc (trước đó cũng chưa hàm nào gọi tới). Bỏ khỏi bảng biến môi trường trong docs và khỏi danh sách "dịch vụ ngoài luôn rỗng" của flow test.

## 4. Kế hoạch test

Không đổi hành vi nên không thêm test mới. Kiểm chứng: `tsc` (bắt import treo), 729 unit test, 28 flow test (kèm snapshot bảng route), `nest build`, và quét lại xác nhận không còn export chết ngoài `ApiEndpoint` và các kiểu nội bộ.

## 5. Rủi ro & rollback

Rủi ro: có nơi dùng bằng đường động mà quét theo tên bỏ sót. Giảm thiểu: quét cả `test/`, `data-source.ts`, docs/skills; build và toàn bộ test phải qua. Rollback: `git revert` commit.

## 6. Kết quả triển khai

- **Đã xoá:** `src/common/validator/BaseValidate.ts`, `src/common/types/baseType.ts`, `src/common/utils/helper.ts`, `src/common/utils/transform.ts`, `src/common/base/base.interface.ts` (hai thư mục `validator/`, `types/` hết file nên bỏ); `IBaseEntity` trong `base.entity.ts`. `Paging<T>` chuyển sang `typeorm-list-query.util.ts`.
- **Giữ:** `ApiEndpoint` (quy ước trong skill `.agent`). Các export còn "không ai import" sau khi quét lại là kiểu nội bộ dùng trong chính file định nghĩa (`SortDirection`, `TypeormListQueryProps/Options`, và `Paging` vì là kiểu trả về của hàm export, nên phải export khi `declaration: true`).
- **Khác thiết kế:** không có. Phát hiện thêm: biến `STORAGE_URL` không còn được code nào đọc; đã bỏ khỏi docs và khỏi danh sách rỗng của flow test (người dùng có thể dọn khỏi môi trường deploy nếu muốn).
- **Docs:** `docs/modules/common.md` (mục 3, 4.5, 4.8, 4.10, 4.13), `test/README.md`, `.claude/rules/testing.md`, roadmap.
- **Kiểm chứng:** `tsc` sạch, 729 unit test, 28 flow test (kèm snapshot bảng route), `nest build` qua.
