import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';

/** Batch 13 (product, admin tạo) — batch 14 thêm sửa và xoá ở cùng file. */
describe('Flow: products (admin write)', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  type User = Awaited<ReturnType<Builders['user']>>;
  type Category = Awaited<ReturnType<Builders['category']>>;
  const rows = <R>(sql: string, params: unknown[] = []) => t.dataSource.query(sql, params) as Promise<R[]>;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const create = (admin: User, body: object) => t.api.post('/api/admin/products').set(bearer(t, admin)).send(body);
  const productRows = () => rows<{ slug: string }>('SELECT slug FROM products');

  /** Body hợp lệ tối thiểu cho một danh mục; test ghi đè phần khác biệt. */
  const validBody = (category: Category, overrides: object = {}) => ({
    slug: 'ao-thun-may',
    name: 'Áo thun Mây',
    priceVnd: 350_000,
    images: ['https://cdn.flow.test/a.jpg'],
    categoryId: category.id,
    subcategoryId: category.subcategories[0].id,
    description: 'Cotton 100%',
    material: 'Cotton',
    care: 'Giặt máy',
    sizes: ['S', 'M'],
    colors: [{ name: 'Black', hex: '#000000' }],
    tags: ['basic'],
    ...overrides,
  });

  describe('POST /api/admin/products', () => {
    it('creates an active product with a generated SKU, Vnd/Usd prices and the category shape', async () => {
      const [admin, category] = [await b.admin(), await b.category()];

      const res = await create(admin, validBody(category)).expect(201);

      expect(res.body.data).toMatchObject({
        id: expect.any(String),
        slug: 'ao-thun-may',
        sku: `${category.slug}-${category.subcategories[0].slug}-ao-thun-may`,
        name: 'Áo thun Mây',
        priceVnd: 350_000,
        priceUsd: 14,
        originalPriceVnd: null,
        originalPriceUsd: null,
        images: ['https://cdn.flow.test/a.jpg'],
        status: 'active',
        badge: null,
        description: 'Cotton 100%',
        material: 'Cotton',
        care: 'Giặt máy',
        sizes: ['S', 'M'],
        colors: [{ name: 'Black', hex: '#000000' }],
        tags: ['basic'],
        ratingAverage: null,
        ratingCount: 0,
        category: { id: category.id, slug: category.slug },
        subcategory: { id: category.subcategories[0].id },
      });
      expect(res.body.data).not.toHaveProperty('price');
      expect(await rows('SELECT price, original_price, status FROM products')).toEqual([
        { price: '350000', original_price: null, status: 'active' },
      ]);
    });

    it('stores a given SKU, the original price, a badge and a disabled status, which keeps it off the public list', async () => {
      const [admin, category] = [await b.admin(), await b.category()];

      const res = await create(
        admin,
        validBody(category, { sku: 'CUSTOM-1', originalPriceVnd: 500_000, badge: 'sale', status: 'disabled' }),
      ).expect(201);

      expect(res.body.data).toMatchObject({
        sku: 'CUSTOM-1',
        priceVnd: 350_000,
        originalPriceVnd: 500_000,
        originalPriceUsd: 20,
        badge: 'sale',
        status: 'disabled',
      });
      expect((await t.api.get('/api/products').expect(200)).body.total).toBe(0);
      expect((await t.api.get('/api/admin/products').set(bearer(t, admin)).expect(200)).body.total).toBe(1);
    });

    it('accepts the price limits (1 and 1.000.000.000), an original price equal to the price and a null badge', async () => {
      const [admin, category] = [await b.admin(), await b.category()];

      const low = await create(admin, validBody(category, { slug: 'low', priceVnd: 1, originalPriceVnd: 1, badge: null })).expect(201);
      const high = await create(
        admin,
        validBody(category, { slug: 'high', priceVnd: 1_000_000_000, originalPriceVnd: 1_000_000_000 }),
      ).expect(201);

      expect(low.body.data).toMatchObject({ priceVnd: 1, originalPriceVnd: 1, badge: null });
      expect(high.body.data).toMatchObject({ priceVnd: 1_000_000_000, originalPriceVnd: 1_000_000_000, priceUsd: 40_000 });
    });

    it('shows a new active product in the public list and detail', async () => {
      const [admin, category] = [await b.admin(), await b.category()];

      const created = await create(admin, validBody(category)).expect(201);

      expect((await t.api.get('/api/products').expect(200)).body.data[0].id).toBe(created.body.data.id);
      await t.api.get(`/api/products/${created.body.data.id}`).expect(200);
    });

    it('refuses a duplicate slug (400 / 1002) and a duplicate SKU (400 / 1003)', async () => {
      const [admin, category] = [await b.admin(), await b.category()];
      await create(admin, validBody(category, { sku: 'DUP-SKU' })).expect(201);

      const slug = await create(admin, validBody(category, { sku: 'OTHER-SKU' }));
      const sku = await create(admin, validBody(category, { slug: 'khac', sku: 'DUP-SKU' }));

      expect(error(slug)).toMatchObject({ status: 400, errorCode: 1002 });
      expect(error(sku)).toMatchObject({ status: 400, errorCode: 1003 });
      expect(await productRows()).toHaveLength(1);
    });

    it('refuses an original price below the price (400 / 1009)', async () => {
      const [admin, category] = [await b.admin(), await b.category()];

      const res = await create(admin, validBody(category, { priceVnd: 400_000, originalPriceVnd: 399_999 }));

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1009 });
      expect(await productRows()).toHaveLength(0);
    });

    it('refuses an unknown category or subcategory (1004) and a subcategory of another category (1005)', async () => {
      const [admin, category, other] = [await b.admin(), await b.category(), await b.category()];

      const noCategory = await create(admin, validBody(category, { categoryId: 'zzzzzzzzzzzzzzzz' }));
      const noSubcategory = await create(admin, validBody(category, { subcategoryId: 'zzzzzzzzzzzzzzzz' }));
      const mismatch = await create(admin, validBody(category, { subcategoryId: other.subcategories[0].id }));

      expect(error(noCategory)).toMatchObject({ status: 400, errorCode: 1004 });
      expect(error(noSubcategory)).toMatchObject({ status: 400, errorCode: 1004 });
      expect(error(mismatch)).toMatchObject({ status: 400, errorCode: 1005 });
      expect(await productRows()).toHaveLength(0);
    });

    it.each([
      ['a missing slug', (c: Category) => ({ ...validBody(c), slug: undefined })],
      ['an empty slug', (c: Category) => validBody(c, { slug: '' })],
      ['a slug longer than 255 characters', (c: Category) => validBody(c, { slug: 'x'.repeat(256) })],
      ['a SKU longer than 255 characters', (c: Category) => validBody(c, { sku: 'x'.repeat(256) })],
      ['a missing name', (c: Category) => ({ ...validBody(c), name: undefined })],
      ['an empty name', (c: Category) => validBody(c, { name: '' })],
      ['a missing price', (c: Category) => ({ ...validBody(c), priceVnd: undefined })],
      ['a price of 0', (c: Category) => validBody(c, { priceVnd: 0 })],
      ['a price above 1.000.000.000', (c: Category) => validBody(c, { priceVnd: 1_000_000_001 })],
      ['a fractional price', (c: Category) => validBody(c, { priceVnd: 100.5 })],
      ['the legacy `price` field', (c: Category) => validBody(c, { price: 100_000 })],
      ['an original price of 0', (c: Category) => validBody(c, { originalPriceVnd: 0 })],
      ['the legacy `originalPrice` field', (c: Category) => validBody(c, { originalPrice: 100_000 })],
      ['no images', (c: Category) => validBody(c, { images: [] })],
      ['a non-string image', (c: Category) => validBody(c, { images: [1] })],
      ['a missing categoryId', (c: Category) => ({ ...validBody(c), categoryId: undefined })],
      ['an empty subcategoryId', (c: Category) => validBody(c, { subcategoryId: '' })],
      ['an unknown badge', (c: Category) => validBody(c, { badge: 'hot' })],
      ['an empty description', (c: Category) => validBody(c, { description: '' })],
      ['a material longer than 255 characters', (c: Category) => validBody(c, { material: 'x'.repeat(256) })],
      ['a care longer than 500 characters', (c: Category) => validBody(c, { care: 'x'.repeat(501) })],
      ['no sizes', (c: Category) => validBody(c, { sizes: [] })],
      ['no colours', (c: Category) => validBody(c, { colors: [] })],
      ['a colour without a hex', (c: Category) => validBody(c, { colors: [{ name: 'Red' }] })],
      ['a colour with an empty name', (c: Category) => validBody(c, { colors: [{ name: '', hex: '#f00' }] })],
      ['missing tags', (c: Category) => ({ ...validBody(c), tags: undefined })],
      ['non-string tags', (c: Category) => validBody(c, { tags: [1] })],
      ['an unknown status', (c: Category) => validBody(c, { status: 'archived' })],
      ['the rating fields', (c: Category) => validBody(c, { ratingAverage: 5, ratingCount: 1 })],
      ['an unknown field', (c: Category) => validBody(c, { id: 'custom-id' })],
    ])('rejects %s with a validation error (no errorCode) and creates nothing', async (_name, body) => {
      const [admin, category] = [await b.admin(), await b.category()];

      const res = await create(admin, body(category));

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await productRows()).toHaveLength(0);
    });
  });
});
