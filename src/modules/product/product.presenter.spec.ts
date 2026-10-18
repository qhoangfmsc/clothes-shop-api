import { presentProduct } from './product.presenter';

const product = { id: 'p1', name: 'Áo thun', price: 350_000, originalPrice: 500_000 as number | null, badge: 'sale', images: ['a.jpg'] };

describe('presentProduct', () => {
  it('replaces price/originalPrice with Vnd and Usd fields and keeps everything else', () => {
    const out = presentProduct(product, 25_000);
    expect(out).toEqual({
      id: 'p1',
      name: 'Áo thun',
      badge: 'sale',
      images: ['a.jpg'],
      priceVnd: 350_000,
      priceUsd: 14,
      originalPriceVnd: 500_000,
      originalPriceUsd: 20,
    });
    expect(out).not.toHaveProperty('price');
    expect(out).not.toHaveProperty('originalPrice');
  });

  it('a product without an original price has null in both currencies', () => {
    expect(presentProduct({ ...product, originalPrice: null }, 25_000)).toMatchObject({ originalPriceVnd: null, originalPriceUsd: null });
  });

  it('does not mutate the entity', () => {
    const copy = { ...product };
    presentProduct(copy, 25_000);
    expect(copy).toEqual(product);
  });
});
