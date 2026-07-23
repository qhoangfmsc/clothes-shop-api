# 🗺️ BACKEND ROADMAP — Ori Baebi API

> **Ngày:** 2026-07-23
> **Phạm vi:** Backend NestJS + TypeORM + PostgreSQL
> **Nguồn tham khảo:** [STRATEGIC_ADVISORY.md](../../clothes-shop/docs/STRATEGIC_ADVISORY.md)

---

## Tổng quan

Roadmap này chi tiết hóa lộ trình phát triển BE, tách biệt khỏi FE. Mỗi phase là một tập hợp công việc có thể hoàn thành độc lập, có đầu ra kiểm chứng được, và được sắp xếp theo thứ tự phụ thuộc — **phase trước là nền móng cho phase sau.**

## Cấu trúc hiện tại

```
13 modules: product, category, collection, order, cart, address,
           wishlist, review, user, auth, shipping, size-guide
22 admin endpoints + 32 client endpoints
Auth: JWT + Passport + Google OAuth
DB: PostgreSQL + TypeORM migrations (đầy đủ FK, CHECK, INDEX)
```

## Phase Map

| Phase | Tên | Thời gian | Mục tiêu chính |
|-------|-----|-----------|----------------|
| [0](./00-phase-foundation.md) | Foundation Hardening | 1-2 tuần | Test suite + CI/CD + Docker |
| [1](./01-phase-public-api.md) | Public API Completion | 1 tuần | Search/Pagination/Filter cho tất cả public endpoint |
| [2](./02-phase-security-infra.md) | Security & Infrastructure | 1-2 tuần | httpOnly cookie, Rate Limiting, DB Backup, Logging |
| [3](./03-phase-business-features.md) | Core Business Features | 2-3 tuần | Email, Guest Checkout, Discount/Promo, Image Upload |
| [4](./04-phase-product-v2.md) | Product System v2 | 2-3 tuần | Product Variants, Inventory, Size Guide per Product |
| [5](./05-phase-production.md) | Advanced & Production Ready | 2-3 tuần | Return/Refund, Monitoring, i18n, Staging, Perf |

## Nguyên tắc thiết kế

1. **Mỗi phase độc lập** — có thể ship riêng, không phá vỡ phase trước
2. **Code trước, tối ưu sau** — đừng over-engineer sớm
3. **Test đi cùng code** — mỗi phase đều có test coverage target
4. **Backward compatible** — API cũ không bị break khi thêm tính năng mới
5. **Migration-first** — mọi thay đổi schema đều qua TypeORM migration

## Quy ước trong các file

- 🟢 **Incremental** — bổ sung vào code hiện có
- 🔵 **New module** — tạo module/service/entity mới
- 🟡 **Refactor** — thay đổi code hiện có, cần migration
- 🔴 **Breaking change** — ảnh hưởng FE, cần sync

## Cách sử dụng

Mỗi file phase chứa:
1. **Mục tiêu** — đầu ra cụ thể của phase
2. **Task list** — danh sách công việc chi tiết
3. **Technical approach** — implementation strategy
4. **Files cần tạo/sửa** — code structure
5. **Test coverage target** — unit + integration
6. **Dependencies** — phase nào cần hoàn thành trước
