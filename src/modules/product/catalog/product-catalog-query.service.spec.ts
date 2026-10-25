import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { setup } from './catalog.test-utils';
import { ProductDetailQueryDto, RELATED_MAX_LIMIT } from './dtos/product-detail-query.dto';
import { ProductCatalogQueryService } from './product-catalog-query.service';

describe('ProductCatalogQueryService rating filter and sort', () => {
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
});

describe('ProductCatalogQueryService.findById related products', () => {
  const product = { id: 'p1', category: { id: 'c1' } };
  function setupDetail() {
    const productRepo: any = {
      findOne: jest.fn(async () => product),
      find: jest.fn(async () => []),
    };
    const service = new ProductCatalogQueryService(productRepo, { getVndPerUsd: async () => 25000 } as any);
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

describe('ProductCatalogQueryService.autocomplete', () => {
  it('returns the product summary (with category/subcategory links) plus price', async () => {
    const joins: string[] = [];
    const qb: any = {
      leftJoin: (path: string) => {
        joins.push(path);
        return qb;
      },
      select: () => qb,
      addSelect: () => qb,
      where: () => qb,
      andWhere: () => qb,
      setParameter: () => qb,
      orderBy: () => qb,
      addOrderBy: () => qb,
      limit: () => qb,
      getMany: async () => [
        {
          id: 'p1',
          name: 'Áo',
          slug: 'ao',
          price: 250000,
          images: ['a.jpg'],
          badge: null,
          category: { id: 'c1', slug: 'ao', title: 'Áo' },
          subcategory: { id: 's1', slug: 'thun', label: 'Thun' },
        },
      ],
    };
    const service = new ProductCatalogQueryService({ createQueryBuilder: () => qb } as any, { getVndPerUsd: async () => 25000 } as any);

    const { data } = await service.autocomplete({ q: 'ao' });

    expect(joins).toEqual(['p.category', 'p.subcategory']);
    expect(data[0]).toEqual({
      id: 'p1',
      name: 'Áo',
      slug: 'ao',
      image: 'a.jpg',
      badge: null,
      category: { id: 'c1', slug: 'ao', title: 'Áo' },
      subcategory: { id: 's1', slug: 'thun', label: 'Thun' },
      priceVnd: 250000,
      priceUsd: 10,
    });
  });
});
