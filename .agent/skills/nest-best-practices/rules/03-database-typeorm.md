# Database — TypeORM

## Entity Definition

Entities live in `modules/<feature>/entities/<feature>.entity.ts`.

```typescript
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('my_table')
export class MyTableEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
```

### Entity Rules

- Table name convention: `<snake_case>`
- Column name convention: `snake_case` in DB (via `name` option), `camelCase` in TypeScript
- Use `@PrimaryGeneratedColumn({ type: 'bigint' })` for auto-increment ID
- Always include `createdAt` and `updatedAt` with `@CreateDateColumn` / `@UpdateDateColumn`
- Foreign key: use `@ManyToOne` + `@JoinColumn({ name: 'column_name' })`
- **KHÔNG dùng `@OneToMany`**. Chỉ khai báo `@ManyToOne` + `@JoinColumn` ở phía "many". Khi cần query ngược (từ "one" → "many"), dùng `QueryBuilder` với `leftJoin` thay vì khai báo relation ngược.
- Entity class name convention: `<Feature>Entity` (e.g. `DemoGroupEntity`, `MediaEntity`)

## Register Entity in Module

Each module registers its own entities via `TypeOrmModule.forFeature()`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MyTableEntity } from './entities/my_table.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MyTableEntity])],
  // ...
})
export class MyModule {}
```

Auth entities (User, UserRole) are registered **globally** in `auth.module.ts` via `TypeOrmModule.forFeature()` + exported in `AuthModule`.

## Query Patterns — Repository

### Inject Repository

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MyTableEntity } from './entities/my_table.entity';

@Injectable()
export class FeatureService {
  constructor(
    @InjectRepository(MyTableEntity) private readonly repo: Repository<MyTableEntity>,
  ) {}
}
```

### Basic CRUD Operations

```typescript
// Find one
const result = await this.repo.findOne({ where: { id } });

// Find many with conditions
const results = await this.repo.find({
  where: { userId },
  order: { createdAt: 'DESC' },
  take: 20,
  skip: 0,
});

// Insert
const entity = this.repo.create({ name: 'test', description: '' });
const saved = await this.repo.save(entity);

// Update
await this.repo.update(id, { name: 'updated', updatedAt: new Date() });
const updated = await this.repo.findOne({ where: { id } });

// Delete
await this.repo.delete(id);
```

### QueryBuilder (for complex queries, JOINs)

```typescript
// Select with JOIN (relation defined in entity)
const rows = await this.repo
  .createQueryBuilder('item')
  .leftJoinAndSelect('item.group', 'group')
  .where('item.userId = :userId', { userId })
  .orderBy('item.created_at', 'DESC')
  .getMany();

// Join with external entity (not a defined relation)
const qb = this.repo
  .createQueryBuilder('project')
  .leftJoinAndMapOne('project.userEntity', User, 'user', 'project.user_id = user.id');

// Count
const total = await this.repo
  .createQueryBuilder('item')
  .where('item.status = :status', { status: 'active' })
  .getCount();

// Bulk delete with conditions
await this.repo
  .createQueryBuilder()
  .delete()
  .where('id IN (:...ids)', { ids: numericIds })
  .andWhere('project_id = :projectId', { projectId })
  .execute();
```

### Khi nào dùng cái nào?

| Trường hợp | Dùng |
|---|---|
| Tìm 1 record theo điều kiện | `repo.findOne({ where: { ... } })` |
| Lấy danh sách đơn giản | `repo.find({ where, order, take, skip })` |
| Cần JOIN bảng khác | `repo.createQueryBuilder().leftJoin()` |
| Insert | `repo.create()` + `repo.save()` |
| Update | `repo.update(id, data)` |
| Delete | `repo.delete(id)` |
| Count / aggregate / complex | `QueryBuilder` |

## List Query Utility (Pagination + Filter + Sort + Search)

Use `typeormListQuery` from `@common/base/typeorm-list-query.util` for standardized list endpoints:

```typescript
import { typeormListQuery } from '@common/base/typeorm-list-query.util';

async findAll(query: ListFeatureDto) {
  const { page, limit, search, sorts, ...filter } = query;

  const qb = this.repo.createQueryBuilder('feature');

  return typeormListQuery(qb, 'feature', { page, limit, search, sorts, filter }, {
    sortableColumns: ['id', 'name', 'createdAt'],
    searchableColumns: ['name', 'description'],
  });
}
```

**Supported filter operators**: `lt:v`, `lte:v`, `gt:v`, `gte:v`, `ne:v`, `eq:v`, `in:a,b,c`, `range:a,b`.

## Database Config

TypeORM is configured globally in `core.module.ts` via `TypeOrmModule.forRootAsync()`:
- `autoLoadEntities: true` — entities registered via `forFeature()` are auto-loaded
- `synchronize: false` — tables are managed manually, NOT auto-synced

## Migration Rules

### Seed Data — ID Convention

Nếu INSERT có cột `id`, **PHẢI dùng nanoid(16)** — không được hardcode chuỗi tự đặt (e.g. `'role_admin'`, `'sync_abc'`).

Generate ID trước bằng lệnh sau rồi paste vào migration:

```bash
node -e "
const { customAlphabet } = require('nanoid');
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 16);
console.log(nanoid());
"
```

Khai báo là hằng số ở đầu file migration để dễ tham chiếu:

```typescript
// Pre-generated nanoid(16) — fixed so this migration is idempotent
const ROLE_ADMIN_ID = 'WuMTGqonwAFKg0xY';
const ROLE_USER_ID  = 'KmZBU4Y9IqoVgQbt';
```

> **Tại sao hardcode thay vì generate runtime?**  
> Generate tại runtime khiến migration non-idempotent — mỗi lần re-run sẽ tạo ID khác, gây duplicate hoặc orphan record.

