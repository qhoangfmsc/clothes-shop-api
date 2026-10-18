import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MoreThanOrEqual } from 'typeorm';
import { ProductDetailQueryDto, RELATED_MAX_LIMIT } from './dtos/product-detail-query.dto';
import { ProductService } from './product.service';

function setup() {
  const calls: { where: [string, any?][]; orderBy?: unknown[]; addOrderBy?: unknown[] } = { where: [] };
  const qb: any = {
    leftJoinAndSelect: () => qb,
    where: (sql: string, params?: any) => {
      calls.where.push([sql, params]);
      return qb;
    },
    andWhere: (sql: string, params?: any) => {
      calls.where.push([sql, params]);
      return qb;
    },
    orderBy: (...args: unknown[]) => {
      calls.orderBy = args;
      return qb;
    },
    addOrderBy: (...args: unknown[]) => {
      calls.addOrderBy = args;
      return qb;
    },
    skip: () => qb,
    take: () => qb,
    getManyAndCount: async () => [[], 0],
  };
  const productRepo: any = { createQueryBuilder: () => qb, findAndCount: jest.fn(async () => [[], 0]) };
  return { service: new ProductService(productRepo, {} as any, {} as any, { getVndPerUsd: async () => 25000 } as any), calls, productRepo };
}

describe('ProductService rating filter and sort', () => {
  it('public list: minRating keeps products whose average rating reaches the threshold', async () => {
    const { service, calls } = setup();
    await service.findAllPublic({ minRating: 4 });
    expect(calls.where).toContainEqual(['p.ratingAverage >= :minRating', { minRating: 4 }]);
  });

  it('public list: no minRating, no rating condition', async () => {
    const { service, calls } = setup();
    await service.findAllPublic({});
    expect(calls.where.map(([sql]) => sql).join(' ')).not.toContain('ratingAverage');
  });

  it.each([
    ['-ratingAverage', 'DESC'],
    ['ratingAverage', 'ASC'],
    ['-ratingCount', 'DESC'],
  ])('public list: sort=%s puts products without ratings last and keeps pagination stable', async (sort, direction) => {
    const { service, calls } = setup();
    await service.findAllPublic({ sort });
    expect(calls.orderBy).toEqual([`p.${sort.replace('-', '')}`, direction, 'NULLS LAST']);
    expect(calls.addOrderBy).toEqual(['p.id', 'ASC']);
  });

  it('admin list: minRating and rating sorts', async () => {
    const { service, productRepo } = setup();
    await service.findAllAdmin({ minRating: 3, sort: '-ratingAverage' });
    const opts = productRepo.findAndCount.mock.calls[0][0];
    expect(opts.where).toEqual({ ratingAverage: MoreThanOrEqual(3) });
    expect(opts.order).toEqual({ ratingAverage: { direction: 'DESC', nulls: 'LAST' }, id: 'ASC' });
  });

  it('admin list: minRating combines with search into every OR branch', async () => {
    const { service, productRepo } = setup();
    await service.findAllAdmin({ minRating: 5, search: 'shirt' });
    const where = productRepo.findAndCount.mock.calls[0][0].where as any[];
    expect(where).toHaveLength(4);
    for (const branch of where) expect(branch.ratingAverage).toEqual(MoreThanOrEqual(5));
  });
});

describe('ProductService.findById related products', () => {
  const product = { id: 'p1', category: { id: 'c1' } };
  function setupDetail() {
    const productRepo: any = {
      findOne: jest.fn(async () => product),
      find: jest.fn(async () => []),
    };
    const service = new ProductService(productRepo, {} as any, {} as any, { getVndPerUsd: async () => 25000 } as any);
    return { service, productRepo };
  }

  it('defaults to 4 related products when relatedLimit is omitted', async () => {
    const { service, productRepo } = setupDetail();
    await service.findById('p1');
    expect(productRepo.find.mock.calls[0][0].take).toBe(4);
  });

  it('uses relatedLimit chosen by the client', async () => {
    const { service, productRepo } = setupDetail();
    await service.findById('p1', { relatedLimit: 5 });
    expect(productRepo.find.mock.calls[0][0].take).toBe(5);
  });
});

describe('ProductDetailQueryDto', () => {
  const check = async (raw: object) => validate(plainToInstance(ProductDetailQueryDto, raw));

  it('defaults to 4 and coerces the query string to a number', async () => {
    expect(plainToInstance(ProductDetailQueryDto, {}).relatedLimit).toBe(4);
    const dto = plainToInstance(ProductDetailQueryDto, { relatedLimit: '5' });
    expect(dto.relatedLimit).toBe(5);
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each(['0', '-1', '21', 'abc', '1.5'])('rejects relatedLimit=%s', async (value) => {
    expect(await check({ relatedLimit: value })).not.toHaveLength(0);
  });

  it('accepts the max limit', async () => {
    expect(await check({ relatedLimit: String(RELATED_MAX_LIMIT) })).toHaveLength(0);
  });
});
