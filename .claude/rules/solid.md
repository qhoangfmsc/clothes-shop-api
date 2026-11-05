# Rule: SOLID — năm câu hỏi kiểm thiết kế, áp vào NestJS của dự án này

Luật bắt buộc khi thiết kế (spec mục 3.4) và review code. Mục lục: `engineering-principles.md`. Pattern đi kèm: `design-patterns.md`. Giáo trình mở rộng: skill `design-principles`.

## 1. SOLID là gì và dùng để làm gì

SOLID là năm nguyên lý thiết kế hướng đối tượng, mục tiêu chung: **đổi một chỗ không vỡ chỗ khác** và **viết test mà không phải dựng cả thế giới**. Dự án dùng SOLID như **bộ câu hỏi tự kiểm**, không phải khẩu hiệu: mỗi nguyên lý có một câu hỏi, một dấu hiệu vi phạm, và một con số/cách đo nếu đo được.

| | Nguyên lý | Câu hỏi tự kiểm | Cách đo nhanh |
|---|---|---|---|
| **S** | Single Responsibility | "Class/file này có mấy **lý do để đổi**?" | Số dependency của constructor; số mock cần cho một unit test; số dòng |
| **O** | Open/Closed | "Thêm một giá trị mới có phải sửa logic cũ?" | Thêm một status/sort/permission phải đụng bao nhiêu file |
| **L** | Liskov Substitution | "Lớp con thay lớp cha có vỡ không?" | Lớp con có ném "not supported" hoặc bị `instanceof` không |
| **I** | Interface Segregation | "Hàm có bị ép nhận thứ nó không dùng?" | Mock/builder phải dựng bao nhiêu field thừa |
| **D** | Dependency Inversion | "Logic nghiệp vụ biết tên chi tiết cụ thể nào?" | Có `new Sdk()`/import SDK/`fetch` trong service nghiệp vụ không |

Mỗi spec đầy đủ điền bảng 5 dòng ✔/✘/n.a. ở mục 3.4; ✘ phải có lý do chấp nhận hoặc kế hoạch xử lý trong chính spec.

## 2. S — Single Responsibility: một lý do để đổi

**Là gì.** Mỗi class/file/hàm phục vụ một nhóm thay đổi. Hai thứ hay đổi vì hai lý do khác nhau thì không ở chung.

**Áp vào dự án.**
- **Phân lớp:** controller (HTTP) · service (use case) · util (tính toán thuần) · presenter (map response) · scheduler · adapter ngoài mỗi thứ một file. Xem `architecture.md` mục 3.
- **Service theo use case, không theo bảng:** `OrderCheckoutService` (đặt hàng), `OrderStatusService` (đổi trạng thái/huỷ), `OrderQueryService` (đọc). Ghi và đọc admin tách nhau (CQS).
- **Trần cứng (máy ép):** service ≤ 300 dòng và ≤ 5 dependency (`architecture.spec.ts`; hai allowlist đang rỗng). Chạm trần là tín hiệu dừng và tách theo use case, ghi quyết định ở spec.

**Tốt trong repo.** `payment/sepay/sepay-signature.util.ts` chỉ lo chữ ký; `PaymentExpiryScheduler` chỉ lo lịch; `order.presenter.ts` chỉ lo map. `PaymentService` cũ (QR + xác nhận + truy vấn) đã tách thành `PaymentAttemptService`, `PaymentConfirmService`, `PaymentTransactionQueryService`.

**Dấu hiệu vi phạm.** Service vừa ghi nghiệp vụ, vừa dựng query admin, vừa map response; unit test phải mock > 5 thứ; phải sửa cùng một file cho hai loại yêu cầu không liên quan.

**Đừng làm quá.** Tách chỉ vì file dài mà cùng một lý do đổi là sai (xem `architecture.md` mục 11). Hàm 120 dòng một mạch nghiệp vụ liền hay hơn 6 hàm 20 dòng phải nhảy qua lại, miễn còn đọc được (ưu tiên ≤ ~50 dòng/hàm).

## 3. O — Open/Closed: thêm dữ liệu, đừng thêm nhánh

**Là gì.** Mở để mở rộng, đóng để sửa: thêm hành vi mới bằng cách **thêm** (dòng vào bảng, phần tử vào mảng, class mới), không sửa logic đã chạy ở nhiều nơi.

**Áp vào dự án.**
- Trạng thái/enum là `as const` + type union dùng chung DTO ↔ entity. Thêm giá trị = thêm vào mảng, kiểu tự cập nhật.
- Vòng đời là **bảng** `Record<Status, readonly Status[]>`, không phải chuỗi `if`: thêm trạng thái mà quên đường đi thì compiler báo lỗi.
- Quyền (`Permission`), mã lỗi (`E*ErrorCode`), whitelist sort (`@SortField([...])`) đều là dữ liệu.
- Hiệu ứng phụ dùng chung ở **một hàm** (`applyOrderPaid`): thêm nguồn xác nhận thanh toán mới không phải chép logic.

**Tốt trong repo.** `ORDER_TRANSITIONS`, `PAYMENT_VERIFICATION_STATUSES`, `@SortField`, `Permission`.

**Hiện trạng lệch (nói thẳng).** Thêm **nhà cung cấp thanh toán** thứ hai vẫn phải sửa chỗ phân nhánh theo `provider` trong `payment/` (chưa có điểm mở rộng, vì mới có SePay). Đây là chấp nhận có chủ đích tới khi spec chốt nhà cung cấp thứ hai: lúc đó áp Strategy (`design-patterns.md` mục 4.1). Danh sách phương thức giao hàng (`SHIPPING_METHOD_IDS`) cố định theo thiết kế, admin chỉ sửa nội dung và phí.

**Dấu hiệu vi phạm.** Thêm một giá trị mà phải sửa logic ở ≥ 2 file; `switch` theo tên ở nhiều chỗ.

## 4. L — Liskov Substitution: lớp con thay được lớp cha

**Là gì.** Nơi nhận lớp cha phải dùng được lớp con mà không đổi nghĩa.

**Áp vào dự án.** Kế thừa chỉ để dùng chung **cột/DTO**, không để tái dùng logic nghiệp vụ (dùng composition + hàm thuần):
- `BaseEntity` (id nanoid16, `createdAt`, `updatedAt`) — mọi entity là một `BaseEntity` đúng nghĩa.
- `PaginationQueryDto` — mọi query DTO list kế thừa; `list-query.dto.spec.ts` ép default 1/25, `limit ≤ 200`, whitelist sort.
- `Update*Dto = PartialType(Create*Dto, { skipNullProperties: false })` — `update-dto.spec.ts` ép giữ mọi ràng buộc của create.

**Dấu hiệu vi phạm.** Lớp con ném "not supported", đổi kiểu trả về, nới/siết điều kiện của lớp cha, hoặc nơi dùng phải `instanceof`.

## 5. I — Interface Segregation: nhận kiểu hẹp đúng nhu cầu

**Là gì.** Đừng ép người dùng phụ thuộc vào thứ họ không dùng. Hàm nhận **đúng các field nó cần**.

**Áp vào dự án.**
- Hàm thuần nhận `Pick<Entity, 'a' | 'b'>` hoặc kiểu cục bộ, không nhận cả entity chỉ để đọc 1–2 field.
- Presenter generic theo kiểu hẹp: `presentOrder<O extends OrderLike>` (`OrderLike` = vài field tiền) dùng được cho nhiều hình dạng đơn.
- Hàm dùng chung nhận `EntityManager` (để vào transaction của người gọi), không nhận cả service.

**Tốt trong repo.** `assertOrderPayable(order: Pick<Order, 'paymentStatus' | 'status'>)` (`payment/shared/payment-payable.util.ts`) — unit test chỉ dựng hai field. `OrderLike` trong `order.presenter.ts`.

**Dấu hiệu vi phạm.** Mock phải dựng cả đống field; hàm nhận `Order` đầy đủ chỉ để đọc `total`; interface to có method mà mỗi người dùng chỉ cần một.

## 6. D — Dependency Inversion: phụ thuộc abstraction ở biên ngoài

**Là gì.** Logic nghiệp vụ không phụ thuộc chi tiết cụ thể (SDK, định dạng của bên ngoài); cả hai cùng phụ thuộc một hợp đồng nhỏ.

**Áp vào dự án (có chọn lọc).**
- **Trong cùng module**: dùng class cụ thể qua DI của Nest là đủ. Tạo interface cho mỗi service là over-engineering.
- **Ở biên ngoài** (cổng thanh toán, storage, email, Google): bọc bằng **adapter hàm thuần** + service điều phối; service nghiệp vụ nhận kiểu của mình (`SepayWebhookPayload`), không nhận JSON thô của nhà cung cấp. Khi có ≥ 2 nhà cung cấp thật thì nâng lên interface + token DI (Strategy).
- **Test:** dịch vụ ngoài được giả ở biên (webhook ký sẵn, `fetch` spy), không mock service nội bộ.
- Không `new Sdk()` trong service; cấu hình ngoài đi qua `ConfigService`/`PaymentConfigService` và được validate lúc khởi động.

**Tốt trong repo.** `sepay-payload.util.ts` / `sepay-signature.util.ts` test không cần mạng; `PaymentConfigService`.

**Hiện trạng lệch (nói thẳng).** `SepayWebhookService` (cell `payment/sepay/`) biết thẳng SePay — chấp nhận vì SePay là cổng duy nhất; `OrderStatusService` gọi trực tiếp `PaymentAttemptService` và `RefundService` (cần cùng transaction, nên phụ thuộc class cụ thể có chủ đích); `MediaService` gọi Supabase Storage REST thẳng, được giả bằng spy `fetch` trong test.

**Dấu hiệu vi phạm.** Logic nghiệp vụ import SDK; `fetch` rải trong service; test phải mock cả hệ thống ngoài mới chạy được.

## 7. SOLID và các phần khác của rule

| Quan hệ | Ý nghĩa |
|---|---|
| SOLID ↔ cell | Cell là S ở mức thư mục: một nhóm chức năng, một lý do đổi |
| SOLID ↔ pattern | Pattern là công cụ để đạt O/D (State machine → O; Strategy/Adapter → D); xem `design-patterns.md` |
| SOLID ↔ test | Khó test (mock nhiều) là chỉ báo S/I/D vi phạm |
| Nguyên lý nào **nhường** | D chỉ áp ở biên ngoài; O chỉ khi đã có ≥ 2 biến thể thật (đừng mở rộng "để sau này") |

## 8. Cách ghi trong spec

Bảng mục 3.4 mỗi nguyên lý một dòng, **nêu class/hàm cụ thể**, không viết chung chung "đạt":

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | `X` chỉ lo A; B tách sang `Y` |
| O | ✔ | thêm trạng thái = thêm dòng vào `…_TRANSITIONS` |
| L | n.a. | không kế thừa |
| I | ✔ | `assertX` nhận `Pick<…>` |
| D | ✘ | `Z` biết thẳng SDK; chấp nhận vì một nhà cung cấp, xem kích hoạt ở design-patterns.md 4 |

## 9. Checklist review SOLID

- [ ] S: constructor ≤ 5 dependency, file ≤ 300 dòng, mỗi class một lý do đổi?
- [ ] O: thêm giá trị mới là thêm dữ liệu, không thêm nhánh ở nhiều file?
- [ ] L: kế thừa chỉ cho cột/DTO; lớp con không đổi nghĩa lớp cha?
- [ ] I: hàm nhận kiểu hẹp; mock không phải dựng field thừa?
- [ ] D: dịch vụ ngoài bọc ở biên; không SDK/`fetch` trong logic nghiệp vụ?
- [ ] Mục ✘ trong spec có lý do chấp nhận hoặc kế hoạch?
