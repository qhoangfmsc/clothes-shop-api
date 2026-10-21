import { CollectionService } from './collection.service';

const PRODUCT_RELATIONS = ['products', 'products.category', 'products.subcategory'];

function setup() {
  const qb: any = {
    andWhere: () => qb,
    orderBy: () => qb,
    skip: () => qb,
    take: () => qb,
    getManyAndCount: async () => [[{ id: 'c1' }], 1],
  };
  const collectionRepo: any = {
    createQueryBuilder: () => qb,
    find: jest.fn(async () => [{ id: 'c1', products: [] }]),
    findAndCount: jest.fn(async () => [[], 0]),
    findOne: jest.fn(async () => ({ id: 'c1', slug: 'c', products: [] })),
    save: jest.fn(async (c: any) => c),
    create: jest.fn((c: any) => c),
  };
  const productRepo: any = { find: jest.fn(async () => [{ id: 'p1' }]) };
  const service = new CollectionService(collectionRepo, productRepo, { getVndPerUsd: async () => 25000 } as any);
  return { service, collectionRepo, productRepo };
}

describe('CollectionService products shape', () => {
  it('public list, public detail and admin list load products with category and subcategory', async () => {
    const { service, collectionRepo } = setup();
    await service.findAllPublic({});
    await service.findBySlug('c');
    await service.findAllAdmin({});
    expect(collectionRepo.find.mock.calls[0][0].relations).toEqual(PRODUCT_RELATIONS);
    expect(collectionRepo.findOne.mock.calls[0][0].relations).toEqual(PRODUCT_RELATIONS);
    expect(collectionRepo.findAndCount.mock.calls[0][0].relations).toEqual(PRODUCT_RELATIONS);
  });

  it('create/update resolve products with category and subcategory', async () => {
    const { service, productRepo, collectionRepo } = setup();
    collectionRepo.findOne.mockResolvedValueOnce(null); // ensureSlugUnique
    await service.create({ slug: 'c', name: 'C', productIds: ['p1'] } as any);
    await service.update('c1', { productIds: ['p1'] } as any);
    for (const [options] of productRepo.find.mock.calls) expect(options.relations).toEqual(['category', 'subcategory']);
    expect(collectionRepo.findOne.mock.calls.at(-1)[0].relations).toEqual(PRODUCT_RELATIONS);
  });
});
