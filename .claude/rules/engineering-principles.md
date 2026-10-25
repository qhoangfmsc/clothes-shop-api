# Rule: nguyên tắc kỹ thuật — Design pattern · Kiến trúc · Convention · SOLID

Luật bắt buộc khi **thiết kế (spec) và viết code** trong `src/`. Mục tiêu: dự án **ổn định** (đổi một chỗ không vỡ chỗ khác) và **tường minh** (người đọc biết vì sao code có hình dạng này, và học được từ đó).

Kiến thức, ví dụ và checklist chi tiết: skill `design-principles` (`.claude/skills/design-principles/SKILL.md`). Rule này là phần luật, không phải giáo trình.

## 0. Nguyên tắc nền

1. **Pattern là công cụ, không phải mục tiêu.** Chỉ dùng khi gọi tên được vấn đề cụ thể nó giải. "Không dùng pattern nào" là kết luận hợp lệ cho code đơn giản. Cấm thêm abstraction "để sau này".
2. **Rule of three.** Lần 1 viết thẳng, lần 2 chấp nhận lặp, lần 3 gom thành helper/pattern dùng chung (ở `common/`).
3. **Tường minh hơn khéo léo.** Ưu tiên code đọc là hiểu; một pattern làm code khó đọc hơn vấn đề nó giải thì bỏ.
4. **Có lý do, có cái giá.** Mỗi pattern/ranh giới được chọn phải nói được: giải vấn đề gì, cái giá là gì. Ghi ở spec (mục 3.3, 3.4) và một dòng comment ở chỗ định nghĩa (tên pattern + vì sao).
5. **Code mới theo chuẩn; code cũ sửa khi chạm tới.** Không refactor hàng loạt ngoài phạm vi việc đang làm. Chỗ cũ còn lệch chuẩn ghi ở `docs/modules/common.md` mục 4.13 như sự thật trung tính.

## 1. Kiến trúc

| Quy tắc | Chi tiết |
|---|---|
| Cell (module nhiều nhóm chức năng) | Mỗi nhóm chức năng là một thư mục `<module>/<cell>/` (controller, service, dto, util, spec của nhóm); entity, hằng, presenter dùng chung ở `<module>/shared/`. Cell chỉ import chính nó và `shared/`; `shared/` không import cell. Thực thể độc lập (có vòng đời, bảng, route riêng và không cell nào khác dùng) tách thành module cấp cao. Module nhỏ (một nhóm chức năng, dưới ~8 file) không cần chia. Máy ép: `architecture.spec.ts`. Spec: `docs/specs/common/0011`. |
| Phân lớp trong module | `Controller` (HTTP, không logic nghiệp vụ) → `Service` (use case) → Repository/`EntityManager`. `Presenter` map entity → response. |
| Hướng phụ thuộc | Một chiều, không vòng, không `forwardRef`. `common/` không import `modules/`. Module này dùng module khác qua **service được export**, không với tay vào bảng của module kia khi đã có service chủ; nếu chưa có thì thêm method vào service chủ. |
| Kích thước service | Quá ~300 dòng hoặc quá ~5 dependency là tín hiệu **dừng lại và cân nhắc tách** theo use case (vd `XCheckoutService`) hoặc tách phần đọc/lọc admin (`XQueryService`). Ghi quyết định ở spec. |
| Logic thuần tách khỏi I/O | Tính tiền, parse payload, kiểm tra điều kiện, bảng chuyển trạng thái là hàm thuần (`*.util.ts`) có unit test; service chỉ điều phối. |
| Transaction | Ranh giới ở service use case. Mọi thao tác ghi liên quan tiền/trạng thái trong **một** transaction; gọi service module khác thì truyền `EntityManager`. Thứ tự khoá cố định (vd order → attempt) và ghi trong comment. |
| Eventual consistency | Chỉ cho phản ứng phụ chấp nhận được (thông báo, cache). Không dùng event cho bước cần nguyên tử với dữ liệu tiền. |
| Tích hợp ngoài | Bọc ở biên (adapter/util). Service nghiệp vụ không biết định dạng của SePay, Supabase, Google. |

## 2. Design pattern — vấn đề nào, dùng gì

| Vấn đề | Dùng | Ví dụ trong repo |
|---|---|---|
| Entity → response, ẩn cột thô | **Presenter** (`presentX`) — bắt buộc cho mọi entity trả ra API | `order.presenter.ts`, `product.presenter.ts` |
| Hành vi ngang (auth, quyền, lỗi, validate) | **Guard / Decorator / Filter / Pipe** của Nest | `@Public()`, `@Permissions()`, `AllExceptionFilter` |
| Gộp nhiều decorator thành một | **Decorator composition** (`applyDecorators`) | `@SortField`, `@SearchField` |
| Vòng đời trạng thái (order, return, refund, payment attempt) | **State machine**: bảng chuyển `Record<Status, readonly Status[]>` kiểu chặt + một hàm kiểm tra | `VALID_TRANSITIONS` (order), `assertStatus` (return) |
| Đoạn lặp giống hệt giữa các khung transaction (vd literal khoá dòng) | **Hàm tiện ích một điểm đổi** (`findLocked`) — gom phần giống thật khi lặp lần thứ 3; không gom cả khung khi chúng khác nhau (lỗi, sở hữu, thứ tự) | `findLocked` (`common/base/lock.util.ts`) |
| Thay thuật toán / nhà cung cấp lúc chạy (cổng thanh toán, tính phí) | **Strategy** qua interface + provider token, chỉ khi có ≥ 2 implementation thật hoặc spec nêu rõ | chưa dùng (SePay là cổng duy nhất) |
| Bọc dịch vụ ngoài | **Adapter** + hàm thuần parse/verify có unit test | `sepay-payload.util.ts`, `sepay-signature.util.ts` |
| Retry/webhook trùng | **Idempotency**: UNIQUE ở DB + bắt lỗi `23505` | `payment_transactions.provider_transaction_id` |
| Nhiều thao tác ghi phải cùng thành công | **Unit of Work** (`dataSource.transaction`) | `OrderCheckoutService.checkout`, `OrderStatusService.cancelLocked` |
| Hiệu ứng phụ dùng chung nhiều luồng | Hàm thuần có tên, một chỗ duy nhất | `applyOrderPaid` |
| Dữ liệu test | **Test Data Builder** | `test/support/builders.ts` |

**Cấm:** Singleton tự viết (dùng DI của Nest), service "làm tất cả" (God service), Factory/Abstract Factory chỉ để cho đẹp, generic repository tự chế bọc TypeORM, kế thừa để tái dùng logic nghiệp vụ (dùng composition).

## 3. SOLID — áp vào dự án này

| | Quy tắc kiểm tra | Dấu hiệu vi phạm |
|---|---|---|
| **S** | Một class/file có **một lý do để đổi**. Service gom các use case cùng lý do; logic thuần, presenter, parser, scheduler, config tách riêng. | Service vừa ghi nghiệp vụ, vừa dựng query admin, vừa map response; test phải mock > 5 thứ |
| **O** | Thêm giá trị (status, sort field, shipping method, permission) bằng cách **thêm dữ liệu** vào bảng/map/constant, không thêm nhánh `if/switch` ở nhiều nơi. | Thêm một giá trị mà phải sửa logic ở ≥ 2 file |
| **L** | Kế thừa chỉ để dùng chung cột/DTO (`BaseEntity`, `PaginationQueryDto`), lớp con không đổi nghĩa của lớp cha. | Lớp con ném lỗi "not supported" hoặc bị kiểm tra `instanceof` |
| **I** | Hàm/class nhận **kiểu hẹp đúng nhu cầu**, không nhận cả entity khi chỉ cần vài field; interface nhỏ. | Hàm nhận `Order` đầy đủ chỉ để đọc `total`; mock phải dựng cả đống field |
| **D** | Ở **biên ngoài** (cổng thanh toán, storage, email) service phụ thuộc interface/token để thay và fake được. Trong cùng module, dùng class cụ thể qua DI là đủ. | `new SomeSdk()` trong service; import thẳng SDK ở logic nghiệp vụ |

Mỗi spec phải điền bảng SOLID (mục 3.4). Mục ✘ phải có lý do chấp nhận hoặc cách xử lý.

## 4. Coding convention

Chuẩn đã có ở `CLAUDE.md` (validation 3 tầng, list API, tiền, error code, migration) vẫn là gốc; bổ sung:

- **Lỗi:** luôn `throwAppError(code, message?, status?)` với error code `[MM][EE]`. Code mới không ném `BadRequestException`/`NotFoundException` thô.
- **Trạng thái/enum:** khai báo `as const` + type union trong file constant, cột entity dùng đúng type union đó (không `string` kèm comment liệt kê); DTO và entity cùng import một nguồn.
- **Tên:** file `kebab-case` theo vai trò (`x.service.ts`, `x.entity.ts`, `x.presenter.ts`, `x-query.dto.ts`, `x.util.ts`); class `PascalCase`; hàm bắt đầu bằng động từ; hằng `UPPER_SNAKE_CASE`. Không viết tắt khó hiểu.
- **Hàm:** ưu tiên ≤ ~50 dòng, dùng early return, không magic number/string (đưa vào constant có tên).
- **Comment:** ít và ngắn, đúng luật `.claude/rules/comments.md` (mặc định không comment; một dòng cho lý do/bất biến/thứ tự khoá).
- **Import:** alias `@common/*`, `@core/*`, `@/*` cho thứ ở ngoài module; đường dẫn tương đối trong cùng module.
- **Không để code chết:** xoá thay vì để lại "phòng khi cần".
- **Máy kiểm tra, không phải trí nhớ:** Biome là nguồn sự thật format/lint (`yarn lint` không được thêm cảnh báo mới). Quy ước quan trọng phải được ép bằng test hoặc lint (mẫu: `list-query.dto.spec.ts`). Các luật kiến trúc ở mục 1 và 4 (hướng phụ thuộc, không vòng module, không export thừa, `throwAppError`, service ≤ 300 dòng / ≤ 5 dependency) đã được ép bởi `src/common/architecture/architecture.spec.ts`; vi phạm cũ nằm trong allowlist chỉ được co lại, không thêm mục để "qua" test.

## 5. Giải thích cho người đọc / người học

- Spec ghi pattern và SOLID đã áp dụng cùng lý do (mục 3.3, 3.4).
- Chỗ định nghĩa pattern có 1 dòng comment: tên pattern + vấn đề nó giải (phần giải thích dài nằm ở spec).
- Báo cáo cuối nêu **1–3 dòng**: pattern/nguyên lý đã dùng ở đâu và vì sao (hoặc vì sao cố ý không dùng).
