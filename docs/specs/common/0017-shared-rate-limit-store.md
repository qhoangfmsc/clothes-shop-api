# 0017 — Kho đếm rate limit dùng chung (Redis tuỳ chọn)

> Module: `common` · Trạng thái: Implemented · Ngày: 2026-10-27 · Bổ sung cho 0010

## 1. Bối cảnh & vấn đề

Spec 0010 dùng kho đếm in-memory của `@nestjs/throttler`: mỗi instance đếm riêng nên với N instance giới hạn thực tế nhân N (120/phút thành 120×N), và bộ đếm mất khi restart. Đủ cho một instance; khi scale ngang giới hạn đăng nhập (10/phút) trở nên lỏng đúng ở chỗ nhạy cảm. Spec 0010 mục 2 loại Redis khỏi phạm vi và ghi đây là giới hạn đã biết; `release-gate.md` mục 7 cũng ghi.

`ThrottlerModule` nhận `storage` là một đối tượng cài `ThrottlerStorage` (`increment(key, ttl, limit, blockDuration, throttlerName)` trả `{ totalHits, timeToExpire, isBlocked, timeToBlockExpire }`).

## 2. Mục tiêu & ngoài phạm vi

**Mục tiêu**
- Khi đặt `REDIS_URL`, bộ đếm nằm ở Redis dùng chung giữa các instance; không đặt thì giữ nguyên in-memory (không bắt buộc hạ tầng mới).
- Redis lỗi hoặc không với tới được **không làm sập API**: ghi cảnh báo và đếm tạm bằng in-memory (fail-open, vì rate limit là lớp bảo vệ phụ, không phải tính đúng đắn nghiệp vụ).
- Đếm nguyên tử (hai instance không đếm hụt khi đồng thời).
- Có test với Redis thật chứng minh hai "instance" cộng dồn vào cùng bộ đếm.

**Ngoài phạm vi**
- Dùng Redis cho thứ khác (cache, queue, session).
- Thuật toán cửa sổ trượt chính xác: dùng cửa sổ cố định (INCR + PEXPIRE) — xem 3.8.
- `blockDuration` (chặn kéo dài sau khi vượt): dự án không dùng.
- Cấp Redis trên Render: việc của người dùng (khi cần scale ngang).

## 3. Thiết kế

### 3.1 Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Tự viết `RedisThrottlerStorage` (INCR + PEXPIRE qua Lua, `ioredis`), chọn theo `REDIS_URL`, lỗi → fallback in-memory** | Nhỏ (~60 dòng), kiểm soát lỗi, không phụ thuộc gói bên thứ ba ít người dùng | Thêm một phụ thuộc (`ioredis`); cửa sổ cố định |
| B. Gói `@nest-lab/throttler-storage-redis` | Có sẵn | Gói cộng đồng nhỏ; ít kiểm soát khi Redis lỗi (có thể ném 500) |
| C. Chuyển rate limit ra hạ tầng (Cloudflare, Render) | Không đổi code | Mất giới hạn theo route; ngoài repo, không test được |
| D. Không làm, ghi chú một instance | Không đổi gì | Giới hạn đăng nhập lỏng khi scale |

**Chọn A**. Pattern: **Adapter** (Redis → `ThrottlerStorage`) + **Fallback** (decorator bọc kho chính, lỗi thì dùng kho dự phòng).

### 3.2 Kiến trúc & ranh giới
```
common/utils/rate-limit.storage.ts   RedisThrottlerStorage implements ThrottlerStorage (client tối thiểu: eval/quit)
                                     FallbackThrottlerStorage(primary, fallback): lỗi primary → fallback + cảnh báo giới hạn tần suất log
                                     createRateLimitStorage(redisUrl?) → ThrottlerStorage | undefined
main.module.ts                       ThrottlerModule.forRootAsync({ useFactory: () => ({ throttlers, storage: createRateLimitStorage(process.env.REDIS_URL) }) })
core/env.validation.ts               REDIS_URL (nếu có) phải là redis:// hoặc rediss://
```
`common/` không import `modules/`. `ioredis` chỉ được import ở `rate-limit.storage.ts`; phần còn lại phụ thuộc interface `RedisLike { eval(...), quit() }` (D của SOLID, và cho phép giả trong unit test).

### 3.3 Design pattern áp dụng
| Pattern | Dùng ở | Vấn đề | Cái giá |
|---|---|---|---|
| Adapter | `RedisThrottlerStorage` | `@nestjs/throttler` cần `ThrottlerStorage`, Redis có API khác | Một lớp thêm |
| Fallback (graceful degradation) | `FallbackThrottlerStorage` | Redis chết không được kéo cả API | Khi Redis lỗi, giới hạn trở lại theo từng instance (đã là hành vi hiện tại) |
| Một Lua script nguyên tử | `INCR_WITH_TTL` | INCR rồi PEXPIRE rời nhau có thể để lại khoá không hết hạn | Một script nhỏ |

### 3.4 Kiểm tra SOLID
| Nguyên lý | Đạt? | Ghi chú |
|---|---|---|
| S | ✔ | Redis, fallback, factory tách |
| O | ✔ | thêm kho khác = cài `ThrottlerStorage` mới |
| L | ✔ | `RedisThrottlerStorage` và kho in-memory thay thế nhau với guard |
| I | ✔ | `RedisLike` chỉ có `eval`, `quit` |
| D | ✔ | guard phụ thuộc `ThrottlerStorage`, không biết Redis |

### 3.5 Dữ liệu
Redis: khoá `rl:<throttlerName>:<key>` (số nguyên, TTL = cửa sổ 60 giây). Không đổi Postgres.

### 3.6 API / cấu hình
Biến mới (tuỳ chọn): `REDIS_URL`. Không đổi API.

### 3.7 Luồng
`increment`: `EVAL` script: `INCR key`; nếu kết quả = 1 thì `PEXPIRE key ttl`; trả `{hits, pttl}`. `isBlocked = hits > limit`; `timeToExpire = ceil(pttl/1000)`; `timeToBlockExpire = isBlocked ? timeToExpire : 0` (để `Retry-After` > 0). Lỗi kết nối → `Fallback` gọi kho in-memory của throttler.

### 3.8 Lỗi & biên
| Tình huống | Hành vi |
|---|---|
| `REDIS_URL` trống | kho in-memory mặc định (như trước) |
| `REDIS_URL` sai định dạng | `validateEnv` từ chối khởi động (mọi môi trường) |
| Redis không với tới | mỗi lần lỗi: dùng in-memory, ghi cảnh báo tối đa 1 lần/phút; API không lỗi |
| Request thứ N+1 trong cửa sổ | `isBlocked`, 429 như cũ |
| Cửa sổ cố định | tối đa 2× giới hạn quanh ranh giới cửa sổ (chấp nhận, bảo vệ chống lạm dụng chứ không tính phí) |
| Hai instance, cùng khoá | cộng dồn (INCR nguyên tử) |

## 4. Kế hoạch test

| Tầng | Case | Vị trí |
|---|---|---|
| Unit | Lua trả `{hits, pttl}` → record đúng (dưới/ở/trên giới hạn, `timeToBlockExpire`); khoá có tiền tố; `Fallback`: primary lỗi → dùng fallback và log một lần; primary phục hồi → dùng lại; `createRateLimitStorage`: trống → `undefined`, có URL → Redis storage; `validateEnv` từ chối `REDIS_URL` sai | `src/common/utils/rate-limit.storage.spec.ts`, `src/core/env.validation.spec.ts` |
| Flow (Redis thật) | hai `RedisThrottlerStorage` (hai instance) cùng khoá cộng dồn; quá giới hạn thì `isBlocked`; khoá hết hạn sau cửa sổ; Redis không với tới → fallback không ném | `test/flows/rate-limit/rate-limit-redis.flow.ts` |
| Hạ tầng test | Redis trong `docker-compose.test.yml` (cổng 56379) và service container ở CI | `docker-compose.test.yml`, `.github/workflows/ci.yml` |
| Phá thử | bỏ PEXPIRE → khoá không hết hạn (test hết hạn đỏ); fallback không bắt lỗi → test lỗi đỏ | thủ công |

## 5. Rủi ro & rollback
- Thêm phụ thuộc `ioredis`: nằm trong `yarn audit` của CI.
- Redis chập chờn: fail-open nên không sập; giới hạn tạm lỏng theo instance.
- Rollback: bỏ `REDIS_URL` (về in-memory ngay, không cần deploy) hoặc `git revert`.

## 6. Kết quả triển khai

- **File:** `src/common/utils/rate-limit.storage.ts` (`RedisThrottlerStorage`, `FallbackThrottlerStorage`, `createRateLimitStorage`), `src/main.module.ts` (`ThrottlerModule.forRootAsync`), `src/core/env.validation.ts` (`REDIS_URL`), dependency `ioredis`, `docker-compose.test.yml` (Redis test cổng 56379), `.github/workflows/ci.yml` (service Redis ở job `flows`), `test/support/test-env.ts` (`REDIS_URL` luôn rỗng trong flow), `conventions.spec.ts` (vai trò tên file `storage`), `test/flows/rate-limit/rate-limit-redis.flow.ts` (6 flow, Redis thật), `rate-limit.storage.spec.ts` (13 unit), `env.validation.spec.ts` (1 ca).
- **Khác thiết kế:** không có.
- **Thử phá (sau khi commit):** bỏ `PEXPIRE` khỏi script Lua → 2 flow đỏ (hết hạn, không để khoá vô hạn) + 1 unit đỏ; để `Fallback` ném lại lỗi → 3 unit đỏ. Khôi phục bằng `git checkout`.
- **Lưu ý:** URL chứa `user:mật-khẩu@` trong test bị công cụ chặn nhầm là lộ thông tin nên test dùng URL không có thông tin đăng nhập.
- **Docs/test:** `docs/modules/common.md` (4.3, 4.10, 4.12, 4.13), `release-gate.md` (4.5, mục 7), `design-patterns.md` (Adapter + Fallback), `test/README.md`.
