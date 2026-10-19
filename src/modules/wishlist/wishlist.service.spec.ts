import { WishlistService } from './wishlist.service';

describe('WishlistService.findAll', () => {
  it('loads product with category and subcategory and presents prices as VND/USD pairs', async () => {
    const item = {
      id: 'w1',
      userId: 'u1',
      product: { id: 'p1', price: 250000, originalPrice: null, category: { id: 'c1' }, subcategory: { id: 's1' } },
    };
    const wishlistRepo: any = { find: jest.fn(async () => [item]) };
    const service = new WishlistService(wishlistRepo, {} as any, { getVndPerUsd: async () => 25000 } as any);

    const result = await service.findAll('u1');

    expect(wishlistRepo.find.mock.calls[0][0].relations).toEqual(['product', 'product.category', 'product.subcategory']);
    expect(result.total).toBe(1);
    expect(result.data[0].product).toMatchObject({ priceVnd: 250000, priceUsd: 10, category: { id: 'c1' }, subcategory: { id: 's1' } });
  });
});
