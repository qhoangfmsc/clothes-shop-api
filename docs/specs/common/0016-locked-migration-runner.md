# 0016 — Chạy migration lúc khởi động có khoá (nhiều instance)

> Module: `common` (+ `scripts/`) · Trạng thái: Implemented · Ngày: 2026-10-27

## 1. Bối cảnh & vấn đề

`yarn start:prod` = `yarn typeorm migration:run -d data-source.ts && node dist/src/main.js`. Mỗi instance mới tự chạy migration trước khi lên. Với một instance thì đủ. Khi Render scale ngang, hoặc deploy zero-downtime khởi động instance mới song song với instance cũ, **hai tiến trình có thể cùng chạy migration một lúc**: cả hai đọc bảng `typeorm_migrations` thấy migration X chưa chạy, cùng chạy X; một bên lỗi (`relation already exists`, `duplicate key`) hoặc, tệ hơn, migration dữ liệu (`SetAllProductPricesTo2000Vnd`, `ConfirmPaidPendingOrders`) chạy hai lần. Lỗi nằm đúng lúc deploy nên chỉ lộ ra ở production. Spec `common/0015` mục 7 đã ghi đây là điểm chưa ép.

TypeORM `runMigrations` không tự khoá giữa các tiến trình; mỗi migration chạy trong transaction riêng nhưng việc "kiểm tra đã chạy chưa" nằm ngoài transaction đó.

## 2. Mục tiêu & ngoài phạm vi

**Mục tiêu**
- Tại một thời điểm chỉ một tiến trình chạy migration trên một DB; tiến trình đến sau chờ rồi thấy mọi thứ đã chạy xong và đi tiếp.
- Một đường chạy duy nhất cho dev, production và smoke test (`yarn migration:run`), để đường đã test cũng là đường production dùng.
- Có test chứng minh: hai runner đồng thời trên DB trống cho kết quả đúng (đủ migration, không trùng, không lỗi).

**Ngoài phạm vi**
- Đổi cách deploy (tách bước migrate thành job riêng của Render, release command): vẫn là lựa chọn tốt hơn về lâu dài nhưng phụ thuộc cấu hình Render của người dùng. Khoá advisory an toàn cả khi có bước đó.
- `migration:revert`, `migration:generate`: chạy tay, không cần khoá.
- Đổi nội dung bất kỳ migration nào.

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Khoá advisory Postgres (`pg_advisory_lock`) trên một kết nối riêng, bọc quanh `runMigrations`** | Không thêm hạ tầng; tự nhả khi tiến trình chết; chờ thay vì lỗi | Giữ một kết nối trong lúc migrate; khoá theo phiên nên phải dùng đúng một kết nối |
| B. `DataSource` option `migrationsTransactionMode: 'all'` | Có sẵn | Không giải race "kiểm tra rồi chạy" giữa hai tiến trình; chỉ làm tất-cả-hoặc-không |
| C. Tách migrate thành bước deploy riêng (Render pre-deploy command) | Đúng kiến trúc nhất | Cấu hình ngoài repo; bước đó cũng có thể chạy đồng thời nếu cấu hình sai |
| D. Giữ nguyên, ghi chú "chỉ một instance" | Không đổi gì | Lỗi lộ ra ở production, đúng lúc scale |

**Chọn A**. Pattern: **mutual exclusion bằng khoá phân tán qua cơ sở dữ liệu** (advisory lock).

### 3.2 Kiến trúc & ranh giới

```
scripts/migrate.ts   export runMigrationsWithLock(dataSource) + CLI (require.main)
package.json         "migration:run": ts-node -r tsconfig-paths/register scripts/migrate.ts
                     "start:prod":    yarn migration:run && node dist/src/main.js
scripts/smoke-prod.sh dùng yarn migration:run (đã là bản có khoá)
```

`runMigrationsWithLock`: (1) `initialize`; (2) mở một `QueryRunner` riêng, `SELECT pg_advisory_lock(KEY)` (chặn tới khi giành được); (3) `dataSource.runMigrations()`; (4) `finally` nhả khoá, giải phóng runner, `destroy`. `KEY` là hằng số có tên, khác khoá của flow test (`20_261_021`). Không import `src/modules`. Nằm ngoài `src/` nên không vào bản build production; chạy bằng ts-node như CLI TypeORM hiện nay (ts-node đã là điều kiện của `start:prod`).

### 3.3 Design pattern áp dụng

| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Mutual exclusion qua advisory lock | `runMigrationsWithLock` | Hai tiến trình cùng migrate | Tiến trình sau chờ (tối đa thời gian migrate); một kết nối giữ thêm |
| Idempotency (sẵn có) | bảng `typeorm_migrations` | Chạy lại sau khi đã chạy xong là no-op | — |

### 3.4 Kiểm tra SOLID

| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | hàm chỉ lo "khoá + chạy"; CLI mỏng tách khỏi hàm |
| O | ✔ | thêm migration không đổi runner |
| L, I | n.a. | |
| D | ✔ | nhận `DataSource` đã cấu hình (tiêm được trong test) |

### 3.5–3.6 Dữ liệu, API
Không đổi bảng, API. Lệnh mới/đổi: `yarn migration:run` (có khoá).

### 3.7 Luồng
```
instance A, B khởi động cùng lúc
 A: pg_advisory_lock → giành được → runMigrations (30 migration) → nhả
 B: pg_advisory_lock → chờ ........................... → giành được → runMigrations (không còn gì) → nhả
 cả hai: node dist/src/main.js
```
Tiến trình chết giữa chừng: Postgres tự nhả khoá khi kết nối đóng; migration dở của nó rollback theo transaction từng migration.

### 3.8 Lỗi & biên
| Tình huống | Hành vi |
|---|---|
| Migration lỗi | khoá được nhả (`finally`), tiến trình thoát mã ≠ 0, instance không lên (như hiện nay) |
| Không kết nối được DB | lỗi kết nối, thoát mã ≠ 0 |
| Instance B chờ lâu hơn thời gian health check của nền tảng | Render coi deploy chưa sẵn sàng; migration vốn ngắn nên chấp nhận |

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Flow (Postgres thật) | DB tạm trống: hai `runMigrationsWithLock` song song → cả hai thành công, số dòng `typeorm_migrations` = số file migration, không trùng; chạy lần hai là no-op; khoá được nhả khi migration lỗi (runner kế tiếp vẫn chạy được) | `test/flows/migration/migration-lock.flow.ts` |
| Phá thử | bỏ lệnh khoá → hai runner đồng thời phải gây lỗi/trùng (test đỏ) | thủ công, sau khi commit |
| Smoke | `yarn smoke:prod` vẫn xanh (dùng runner có khoá) | `scripts/smoke-prod.sh` |

## 5. Rủi ro & rollback
- Khoá bị giữ nếu tiến trình treo nhưng kết nối còn: chỉ xảy ra khi migration treo; đã là sự cố sẵn có. Có thể kiểm bằng `SELECT * FROM pg_locks WHERE locktype='advisory'`.
- Rollback: `git revert` (trả `migration:run` về lệnh TypeORM CLI cũ).

## 6. Kết quả triển khai

- **File:** `scripts/migrate.ts` (`runMigrationsWithLock`, `MIGRATION_LOCK_KEY`, CLI qua `require.main`), `package.json` (`migration:run` = ts-node `scripts/migrate.ts`; `start:prod` = `yarn migration:run && node dist/src/main.js`), `biome.json` và `tsconfig.build.json` (nhận `scripts/`, loại khỏi bản build), `test/flows/migration/migration-lock.flow.ts` (4 flow), `scripts/smoke-prod.sh` (đã dùng `yarn migration:run`).
- **Khác thiết kế:** thư mục flow `migration` được xếp vào flow toàn cục của `yarn impact` (`GLOBAL_FLOW_DIRS`) vì không thuộc module nào.
- **Thử phá (sau khi commit):** bỏ lệnh `pg_advisory_lock` → 2 trong 4 flow đỏ (hai runner song song, runner chờ khi khoá bị giữ). Khôi phục bằng `git checkout`.
- **Docs/test:** `docs/modules/common.md` (4.1, 4.9, 4.11), `.claude/rules/architecture.md` mục 6, `design-patterns.md` (Mutual exclusion), `release-gate.md` mục 7, `test/README.md`.
