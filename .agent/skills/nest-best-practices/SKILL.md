---
name: nest-best-practices
description: NestJS best practices and conventions for the marops-api project. Covers folder structure, module/controller/service patterns, TypeORM usage, DTO validation with class-validator (zod is deprecated), error handling, guards, logging, and testing.
---

# NestJS Best Practices — marops-api

Tài liệu quy ước và best practices cho dự án. Mỗi rule được tách thành file riêng trong thư mục `rules/` để dễ quản lý.

## Rules Index

| # | File | Mô tả |
|---|------|-------|
| 01 | [Project Structure](rules/01-project-structure.md) | Cấu trúc thư mục `src/`, phân chia `core/`, `common/`, `modules/` |
| 02 | [Module Convention](rules/02-module-convention.md) | Quy ước tạo module, sub-module, parent module, đặt tên |
| 03 | [Database — TypeORM](rules/03-database-typeorm.md) | Entity definition, Repository pattern, QueryBuilder, list query util |
| 04 | [DTO Validation — class-validator](rules/04-dto-validation.md) | class-validator decorators |
| 04b | [DTO Validation — Zod](rules/04b-dto-validation-zod.md) | [DEPRECATED] Không sử dụng Zod cho module mới |
| 05 | [Controller Convention](rules/05-controller-convention.md) | Template controller, Swagger decorators, route ordering |
| 06 | [Service Convention](rules/06-service-convention.md) | Template service, CRUD pattern với TypeORM Repository |
| 07 | [Error Handling](rules/07-error-handling.md) | NestJS exceptions, AppException với custom error codes |
| 08 | [Logging](rules/08-logging.md) | LoggerService global (KHÔNG dùng Logger của NestJS) |
| 09 | [Guards & Auth](rules/09-guards-auth.md) | AuthGuard (JWT Bearer), RolesGuard, PermissionsGuard |
| 10a | [Platform & Tooling](rules/10-platform.md) | Fastify, TypeORM |
| 10b | [Import Convention](rules/10-import-convention.md) | No barrel exports, path aliases |
| 11 | [E2E Testing](rules/11-e2e-testing.md) | PGlite in-memory DB, cấu trúc e2e-spec.ts, createTestApp(), template |
| 12 | [New Module Checklist](rules/12-new-module-checklist.md) | Checklist step-by-step khi tạo module mới |
| 13 | [BullMQ Queue](rules/13-bullmq-queue.md) | Queue naming convention, Bull Board dashboard, processor/queue injection |
| 14 | [Database Migration](rules/14-migration.md) | Tạo migration qua CLI (`yarn migration:generate`), quy tắc đặt tên, idempotent |

## Khi nào đọc rule nào?

- **Tạo module mới**: Đọc `12` (checklist) → `02` (module) → `03` (entity) → `04` (dto) → `06` (service) → `05` (controller) → `11` (e2e test)
- **Viết test**: Đọc `11` (e2e testing)
- **Thêm entity/table mới**: Đọc `03` (database)
- **Sửa API endpoint**: Đọc `05` (controller) + `11` (e2e test)
- **Cần xử lý lỗi**: Đọc `07` (error handling)
- **Cần log**: Đọc `08` (logging)
- **Phân quyền**: Đọc `09` (guards)
- **Tổng quan dự án**: Đọc `01` (structure) + `10a` (platform) + `10b` (import)
- **Thêm background job / queue**: Đọc `13` (bullmq)
- **Thay đổi database schema / tạo migration**: Đọc `14` (migration) + `03` (database)
