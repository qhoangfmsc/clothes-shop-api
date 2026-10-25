import { presentProduct, presentProductSummary } from './product.presenter';

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

  it('returns the same category/subcategory shape however they were loaded (no nested subcategories/category)', () => {
    const category = { id: 'c1', slug: 'ao', title: 'Áo', subcategories: [{ id: 's1', slug: 'thun' }] };
    const subcategory = { id: 's1', slug: 'thun', label: 'Thun', category };
    const out: any = presentProduct({ ...product, category, subcategory }, 25_000);
    expect(out.category).toEqual({ id: 'c1', slug: 'ao', title: 'Áo' });
    expect(out.subcategory).toEqual({ id: 's1', slug: 'thun', label: 'Thun' });
    // entity gốc không bị đổi
    expect(category.subcategories).toHaveLength(1);
    expect(subcategory.category).toBe(category);
  });

  it('leaves category/subcategory absent when they were not loaded', () => {
    expect(presentProduct(product, 25_000)).not.toHaveProperty('category');
  });
});

describe('presentProductSummary', () => {
  const full = {
    id: 'p1',
    name: 'Áo thun',
    slug: 'ao-thun',
    images: ['a.jpg', 'b.jpg'],
    badge: 'sale',
    description: 'long text',
    category: { id: 'c1', slug: 'ao', title: 'Áo', heroImage: null, subcategories: [{ id: 's1' }] },
    subcategory: { id: 's1', slug: 'thun', label: 'Thun', count: 3, category: { id: 'c1' } },
  };

  it('keeps only what is needed to identify the product and build its link', () => {
    expect(presentProductSummary(full)).toEqual({
      id: 'p1',
      name: 'Áo thun',
      slug: 'ao-thun',
      image: 'a.jpg',
      badge: 'sale',
      category: { id: 'c1', slug: 'ao', title: 'Áo' },
      subcategory: { id: 's1', slug: 'thun', label: 'Thun' },
    });
  });

  it('always has the same keys: missing image, badge and relations become null', () => {
    expect(presentProductSummary({ id: 'p2', name: 'B', slug: 'b', images: [] })).toEqual({
      id: 'p2',
      name: 'B',
      slug: 'b',
      image: null,
      badge: null,
      category: null,
      subcategory: null,
    });
  });
});
