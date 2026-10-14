import { MoreThanOrEqual } from 'typeorm';
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
  return { service: new ProductService(productRepo, {} as any, {} as any), calls, productRepo };
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
