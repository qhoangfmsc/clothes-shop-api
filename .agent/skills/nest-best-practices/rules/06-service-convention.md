# Service Conventions

## Template

```typescript
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MyTableEntity } from './entities/my_table.entity';

@Injectable()
export class FeatureService {
  constructor(
    @InjectRepository(MyTableEntity) private readonly repo: Repository<MyTableEntity>,
  ) {}

  async create(dto: CreateDto, userId: string) {
    const entity = this.repo.create({ ...dto, userId });
    return this.repo.save(entity);
  }

  async findById(id: string) {
    const result = await this.repo.findOne({ where: { id: Number(id) } });

    if (!result) {
      throw new NotFoundException('Feature not found');
    }

    return result;
  }

  async update(id: string, dto: UpdateDto, userId: string) {
    const existing = await this.findById(id); // Reuse findById

    if (existing.userId !== userId) {
      throw new ForbiddenException('Only owner can update');
    }

    await this.repo.update(Number(id), { ...dto, updatedAt: new Date() });
    return this.repo.findOne({ where: { id: Number(id) } });
  }

  async delete(id: string, userId: string): Promise<void> {
    const existing = await this.findById(id);

    if (existing.userId !== userId) {
      throw new ForbiddenException('Only owner can delete');
    }

    await this.repo.delete(Number(id));
  }
}
```

## Rules

- Inject repository via `@InjectRepository(Entity)`
- Reuse `findById()` in update/delete to check existence
- Always check ownership before update/delete (if applicable)
- Throw NestJS built-in exceptions (`NotFoundException`, `ForbiddenException`, etc.)
- Service contains ALL business logic — controller is thin
