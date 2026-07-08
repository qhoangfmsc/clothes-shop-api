# Module Convention

## File Structure

Every feature module follows the same flat file structure:

```
modules/<feature>/
├── <feature>.module.ts
├── <feature>.controller.ts
├── <feature>.service.ts
├── dtos/
│   ├── <feature>.dto.ts           # Create/Update/List DTOs
│   └── <feature>_response.dto.ts  # Response DTOs/interfaces (nếu có)
└── entities/
    └── <feature>.entity.ts
```

**DTO Rules:**
- DTOs được tổ chức trong thư mục `dtos/` bên trong mỗi module
- **2 file DTO** per module: `<feature>.dto.ts` (request/input) và `<feature>_response.dto.ts` (response/output)
- Nếu module chỉ có request DTOs, chỉ cần file `.dto.ts`

## Module Registration

```typescript
// <feature>.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureController } from './feature.controller';
import { FeatureService } from './feature.service';
import { FeatureEntity } from './entities/feature.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FeatureEntity])],
  controllers: [FeatureController],
  providers: [FeatureService],
  exports: [FeatureService], // Export if other modules need this service
})
export class FeatureModule {}
```

Then register in `main.module.ts`:

```typescript
@Module({
  imports: [
    CoreModule,
    // Feature modules
    FeatureModule,
  ],
})
export class MainModule {}
```

## Parent Module with Sub-modules

When a feature has **multiple related entities** (e.g. `demo_item` + `demo_group`), split into sub-modules under a parent folder. The parent module imports all sub-modules. Only the **parent module** is registered in `main.module.ts`.

```
modules/<feature>/
├── <feature>.module.ts                    # Parent module – imports all sub-modules
├── <feature>_<sub_a>/
│   ├── <feature>_<sub_a>.module.ts
│   ├── <feature>_<sub_a>.controller.ts
│   ├── <feature>_<sub_a>.service.ts
│   ├── dtos/
│   │   ├── <feature>_<sub_a>.dto.ts
│   │   └── <feature>_<sub_a>_response.dto.ts
│   └── entities/
│       └── <feature>_<sub_a>.entity.ts
└── <feature>_<sub_b>/
    ├── <feature>_<sub_b>.module.ts
    ├── <feature>_<sub_b>.controller.ts
    ├── <feature>_<sub_b>.service.ts
    ├── dtos/
    │   ├── <feature>_<sub_b>.dto.ts
    │   └── <feature>_<sub_b>_response.dto.ts
    └── entities/
        └── <feature>_<sub_b>.entity.ts
```

**Parent module example:**

```typescript
// demo.module.ts
import { Module } from '@nestjs/common';
import { DemoGroupModule } from './demo_group/demo_group.module';
import { DemoItemModule } from './demo_item/demo_item.module';

@Module({
  imports: [DemoGroupModule, DemoItemModule],
})
export class DemoModule {}
```

## Domain Grouping — Khi nào PHẢI tách sub-modules

**Quy tắc quan trọng:** Khi một domain chứa **nhiều khái niệm/entities khác nhau**, LUÔN tách thành parent module + sub-modules. **KHÔNG** nhét tất cả vào 1 module duy nhất.

### Dấu hiệu cần tách:
- Module quản lý **nhiều entity khác nhau** (user, role, permission, API key...)
- Các entity có **CRUD riêng biệt**, mỗi entity cần controller + service riêng
- Code trong 1 service quá lớn (>200 dòng) vì xử lý nhiều entity

### Naming Convention cho Sub-modules:
- **Ngắn gọn:** Sử dụng tên entity chính làm tên module con (e.g. `user/`, `role/`), **KHÔNG** lặp lại tên parent module (tránh `user_management_user/`).
- **File name:** `<sub_module>.module.ts`, `<sub_module>.controller.ts` (e.g. `user.module.ts`).
- **Class name:** `<SubModule>Module` (e.g. `UserModule`).

### Ví dụ thực tế — User Management:

```
modules/user_management/
├── user_management.module.ts              # Parent: import tất cả sub-modules
├── user/                                  # Tên ngắn gọn (thay vì user_management_user)
│   ├── user.module.ts
│   ├── user.controller.ts
│   ├── user.service.ts
│   └── dtos/
│       └── user.dto.ts
├── role/
│   ├── role.module.ts
│   ├── role.controller.ts
│   ├── role.service.ts
│   └── dtos/
│       └── role.dto.ts
├── permission/
│   ├── permission.module.ts
│   ├── permission.controller.ts
│   ├── permission.service.ts
│   └── dtos/
│       └── permission.dto.ts
└── api_key/
    ├── api_key.module.ts
    ├── api_key.controller.ts
    ├── api_key.service.ts
    ├── dtos/
    │   └── api_key.dto.ts
    └── entities/
        └── api_key.entity.ts
```

> **Lưu ý:** Với user_management, các entity `User`, `Role`, `Permission`, `RolePermission` đã nằm sẵn trong `core/auth/entities/` và registered global qua `CoreModule`. Sub-modules chỉ cần inject repository trực tiếp.

## Rules

- **Use underscores** (`_`) for folder and file names, NOT hyphens (`-`)
- **Use full entity name** for standard feature modules.
- **For Sub-modules in Domain Grouping:** Use simple, short names (e.g. `user`, `role`) instead of full prefix (e.g. `user_management_user`).
- **Naming consistency**: table name (`demo_item`), folder name (`demo_item/`), and file names (`demo_item.service.ts`) must all match (unless in sub-module grouping where simple names are preferred).
- Sub-modules that depend on each other should use `imports` + `exports` (e.g. `DemoItemModule` imports `DemoGroupModule` to use `DemoGroupService`)
- Each sub-module has its own entity, DTO, service, controller — fully self-contained
- Each module registers its own entities via `TypeOrmModule.forFeature([Entity])`
- Only the parent module is registered in `main.module.ts`
- **DTO: thư mục `dtos/`** per module, chứa `<feature>.dto.ts` và `<feature>_response.dto.ts` (nếu có)
- **KHÔNG nhét nhiều entity/concept vào 1 module** — luôn tách sub-module khi domain phức tạp
