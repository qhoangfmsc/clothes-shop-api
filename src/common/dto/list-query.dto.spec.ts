import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@common/base/pagination.util';
import { ValidationPipe } from '@nestjs/common';
import { PaginationQueryDto } from './pagination-query.dto';

// Same options as main.ts
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const run = (metatype: new () => object, query: unknown) => pipe.transform(query, { type: 'query', metatype });

// Query DTO KHÔNG phải API list (không phân trang) — thêm vào đây phải có lý do rõ ràng
const NOT_LIST_DTO_FILES = ['product-autocomplete-query.dto.ts', 'public-site-config-query.dto.ts'];

// Mọi file *-query.dto.ts trong modules/*/dtos là DTO của API list → phải theo chuẩn chung (xem CLAUDE.md "List API Standards")
const modulesDir = path.join(__dirname, '..', '..', 'modules');
const listDtos: [string, new () => object][] = fs
  .readdirSync(modulesDir)
  .flatMap((mod) => {
    const dtoDir = path.join(modulesDir, mod, 'dtos');
    return fs.existsSync(dtoDir) ? fs.readdirSync(dtoDir).map((file) => path.join(dtoDir, file)) : [];
  })
  .filter((file) => file.endsWith('-query.dto.ts') && !NOT_LIST_DTO_FILES.includes(path.basename(file)))
  .flatMap((file) =>
    Object.entries(require(file) as Record<string, new () => object>)
      .filter(([, value]) => typeof value === 'function')
      .map(([name, value]): [string, new () => object] => [name, value]),
  );

// DTO có sort: whitelist field → thử 1 giá trị sort hợp lệ lấy từ metadata Swagger
const sortable = listDtos.filter(([, dto]) => 'sort' in new dto());

describe('List query DTOs', () => {
  it('finds the list DTOs', () => {
    expect(listDtos.length).toBeGreaterThanOrEqual(11);
  });

  describe.each(listDtos)('%s', (_name, Dto) => {
    it('extends PaginationQueryDto', () => {
      expect(new Dto()).toBeInstanceOf(PaginationQueryDto);
    });

    it('accepts limit up to the max and rejects above it', async () => {
      await expect(run(Dto, { limit: String(MAX_PAGE_SIZE) })).resolves.toMatchObject({ limit: MAX_PAGE_SIZE });
      await expect(run(Dto, { limit: String(MAX_PAGE_SIZE + 1) })).rejects.toMatchObject({ status: 400 });
    });

    it('defaults to page 1 and the shared default page size', async () => {
      await expect(run(Dto, {})).resolves.toMatchObject({ page: 1, limit: DEFAULT_PAGE_SIZE });
    });

    it('rejects the legacy "sorts" param and non-positive paging', async () => {
      await expect(run(Dto, { sorts: '-createdAt' })).rejects.toMatchObject({ status: 400 });
      await expect(run(Dto, { page: '0' })).rejects.toMatchObject({ status: 400 });
      await expect(run(Dto, { limit: '0' })).rejects.toMatchObject({ status: 400 });
    });
  });

  describe.each(sortable)('%s sort', (_name, Dto) => {
    it('rejects legacy and unknown sort values', async () => {
      for (const sort of ['newest', 'oldest', 'price_asc', 'name_desc', 'unknownField', '--createdAt']) {
        await expect(run(Dto, { sort })).rejects.toMatchObject({ status: 400 });
      }
    });

    it('accepts "field" and "-field" for every whitelisted field', async () => {
      const meta = Reflect.getMetadata('swagger/apiModelProperties', Dto.prototype, 'sort') as { enum: string[] };
      expect(meta.enum.length).toBeGreaterThan(0);
      for (const sort of meta.enum) {
        await expect(run(Dto, { sort })).resolves.toMatchObject({ sort });
      }
    });
  });
});
