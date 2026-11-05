import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';

/** Batch 13 (product, đọc): danh sách công khai, chi tiết, autocomplete, danh sách admin. */
describe('Flow: products (read)', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  type User = Awaited<ReturnType<Builders['user']>>;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const list = (query: object = {}) => t.api.get('/api/products').query(query);
  const adminList = (admin: User, query: object = {}) => t.api.get('/api/admin/products').query(query).set(bearer(t, admin));
  const ids = (res: { body: { data: { id: string }[] } }) => res.body.data.map((row) => row.id);
  const day = (offset: number) => new Date(Date.UTC(2026, 9, 1 + offset, 12));
  const inCategory = async (overrides: object = {}) => {
    const category = await b.category();
    return {
      category,
      make: (extra: object = {}) => b.product({ category, subcategory: category.subcategories[0], ...overrides, ...extra }),
    };
  };

  describe('GET /api/products', () => {
    it('lists active products in the standard shape with Vnd/Usd pairs, newest first, without a token', async () => {
      const [older, newer] = [
        await b.product({ createdAt: day(1), price: 350_000, originalPrice: 500_000 }),
        await b.product({ createdAt: day(2), price: 120_000 }),
      ];
      await b.product({ status: 'disabled' });

      const res = await list().expect(200);

      expect(ids(res)).toEqual([newer.id, older.id]);
      expect(res.body).toMatchObject({ total: 2, page: 1, limit: 25, totalPages: 1 });
      expect(res.body.data[1]).toMatchObject({
        id: older.id,
        slug: older.slug,
        sku: older.sku,
        name: older.name,
        priceVnd: 350_000,
        priceUsd: 14,
        originalPriceVnd: 500_000,
        originalPriceUsd: 20,
        status: 'active',
        badge: null,
        sizes: ['M'],
        colors: [{ name: 'Black', hex: '#000000' }],
        ratingAverage: null,
        ratingCount: 0,
        category: { id: older.category.id, slug: older.category.slug },
        subcategory: { id: older.subcategory.id, slug: older.subcategory.slug },
      });
      expect(res.body.data[1]).not.toHaveProperty('price');
      expect(res.body.data[1]).not.toHaveProperty('originalPrice');
      expect(res.body.data[1].category).not.toHaveProperty('subcategories');
      expect(res.body.data[1].subcategory).not.toHaveProperty('category');
      expect(res.body.data[0]).toMatchObject({ originalPriceVnd: null, originalPriceUsd: null });
    });

    it('is empty without products', async () => {
      const res = await list().expect(200);

      expect(res.body).toMatchObject({ data: [], total: 0, totalPages: 0 });
    });

    it('searches name, slug and description case-insensitively', async () => {
      const byName = await b.product({ name: 'Áo Thun Mây', slug: 'ao-thun-may', description: 'Cotton' });
      const bySlug = await b.product({ name: 'Quần', slug: 'quan-jogger-xam', description: 'Nỉ' });
      const byDescription = await b.product({ name: 'Mũ', slug: 'mu-len', description: 'Giữ ấm mùa ĐÔNG' });

      expect(ids(await list({ search: 'thun MÂY' }).expect(200))).toEqual([byName.id]);
      expect(ids(await list({ search: 'jogger' }).expect(200))).toEqual([bySlug.id]);
      expect(ids(await list({ search: 'mùa đông' }).expect(200))).toEqual([byDescription.id]);
      expect(ids(await list({ search: 'khong-co-gi' }).expect(200))).toEqual([]);
    });

    it('filters by category and subcategory slug, and by badge', async () => {
      const { category, make } = await inCategory();
      const [inside, badged] = [await make({ createdAt: day(1) }), await make({ badge: 'sale', createdAt: day(2) })];
      await b.product();

      expect(ids(await list({ category: category.slug }).expect(200))).toEqual([badged.id, inside.id]);
      expect(ids(await list({ subcategory: category.subcategories[0].slug }).expect(200))).toEqual([badged.id, inside.id]);
      expect(ids(await list({ category: category.slug, badge: 'sale' }).expect(200))).toEqual([badged.id]);
      expect(ids(await list({ category: 'khong-co' }).expect(200))).toEqual([]);
    });

    it('filters by price range in VND, both bounds inclusive', async () => {
      const [cheap, mid, dear] = [
        await b.product({ price: 100_000 }),
        await b.product({ price: 200_000 }),
        await b.product({ price: 300_000 }),
      ];

      expect(ids(await list({ minPrice: 200_000, sort: 'price' }).expect(200))).toEqual([mid.id, dear.id]);
      expect(ids(await list({ maxPrice: 200_000, sort: 'price' }).expect(200))).toEqual([cheap.id, mid.id]);
      expect(ids(await list({ minPrice: 200_000, maxPrice: 200_000 }).expect(200))).toEqual([mid.id]);
      expect(ids(await list({ minPrice: 300_001 }).expect(200))).toEqual([]);
    });

    it('filters by sizes and colours (any match, spaces and empty items ignored)', async () => {
      const [small, large, both] = [
        await b.product({ sizes: ['S'], colors: [{ name: 'Red', hex: '#f00' }], createdAt: day(1) }),
        await b.product({ sizes: ['L', 'XL'], colors: [{ name: 'Blue', hex: '#00f' }], createdAt: day(2) }),
        await b.product({
          sizes: ['S', 'L'],
          colors: [
            { name: 'Red', hex: '#f00' },
            { name: 'Blue', hex: '#00f' },
          ],
          createdAt: day(3),
        }),
      ];

      expect(ids(await list({ sizes: 'S' }).expect(200))).toEqual([both.id, small.id]);
      expect(ids(await list({ sizes: ' XL , ,M' }).expect(200))).toEqual([large.id]);
      expect(ids(await list({ colors: 'Blue' }).expect(200))).toEqual([both.id, large.id]);
      expect(ids(await list({ sizes: 'L', colors: 'Red' }).expect(200))).toEqual([both.id]);
      expect(ids(await list({ sizes: ',' }).expect(200))).toHaveLength(3);
      expect(ids(await list({ colors: 'Green' }).expect(200))).toEqual([]);
    });

    it('filters by minimum rating (unrated products are left out) and sorts unrated products last in both directions', async () => {
      const [top, mid, unrated] = [
        await b.product({ ratingAverage: 4.8, ratingCount: 10 }),
        await b.product({ ratingAverage: 3.2, ratingCount: 2 }),
        await b.product(),
      ];

      expect(ids(await list({ minRating: 4 }).expect(200))).toEqual([top.id]);
      expect(ids(await list({ minRating: 1, sort: 'ratingAverage' }).expect(200))).toEqual([mid.id, top.id]);
      expect(ids(await list({ sort: '-ratingAverage' }).expect(200))).toEqual([top.id, mid.id, unrated.id]);
      expect(ids(await list({ sort: 'ratingAverage' }).expect(200))).toEqual([mid.id, top.id, unrated.id]);
      expect(ids(await list({ sort: '-ratingCount' }).expect(200))).toEqual([top.id, mid.id, unrated.id]);
    });

    it('sorts by price, name and creation time in either direction, and paginates', async () => {
      const [a, c, d] = [
        await b.product({ name: 'Cam', price: 300_000, createdAt: day(1) }),
        await b.product({ name: 'Ao', price: 100_000, createdAt: day(2) }),
        await b.product({ name: 'Bo', price: 200_000, createdAt: day(3) }),
      ];

      expect(ids(await list({ sort: 'price' }).expect(200))).toEqual([c.id, d.id, a.id]);
      expect(ids(await list({ sort: '-price' }).expect(200))).toEqual([a.id, d.id, c.id]);
      expect(ids(await list({ sort: 'name' }).expect(200))).toEqual([c.id, d.id, a.id]);
      expect(ids(await list({ sort: 'createdAt' }).expect(200))).toEqual([a.id, c.id, d.id]);
      const page = await list({ limit: 2, page: 2 }).expect(200);
      expect(ids(page)).toEqual([a.id]);
      expect(page.body).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });
      expect(ids(await list({ limit: 2, page: 9 }).expect(200))).toEqual([]);
    });

    it.each([
      ['an unknown badge', { badge: 'hot' }],
      ['a negative minPrice', { minPrice: -1 }],
      ['a fractional maxPrice', { maxPrice: 1.5 }],
      ['a minRating of 0', { minRating: 0 }],
      ['a minRating of 6', { minRating: 6 }],
      ['a sort field outside the whitelist', { sort: 'sku' }],
      ['the removed `sorts` parameter', { sorts: 'price' }],
      ['a limit above 200', { limit: 201 }],
      ['a page below 1', { page: 0 }],
      ['a search longer than 255 characters', { search: 'x'.repeat(256) }],
      ['a category longer than 255 characters', { category: 'x'.repeat(256) }],
      ['sizes longer than 255 characters', { sizes: 'x'.repeat(256) }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const res = await list(query);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('GET /api/products/:id', () => {
    it('returns the product with related ones of the same category: active only, not itself, newest first, 4 by default', async () => {
      const { make } = await inCategory();
      const main = await make({ createdAt: day(0) });
      const related: Awaited<ReturnType<Builders['product']>>[] = [];
      for (let i = 1; i <= 5; i++) related.push(await make({ createdAt: day(i) }));
      await make({ status: 'disabled', createdAt: day(9) });
      await b.product({ createdAt: day(8) });

      const res = await t.api.get(`/api/products/${main.id}`).expect(200);
      const limited = await t.api.get(`/api/products/${main.id}`).query({ relatedLimit: 2 }).expect(200);

      expect(res.body.data).toMatchObject({
        id: main.id,
        priceVnd: 350_000,
        priceUsd: 14,
        category: { id: main.category.id },
        subcategory: { id: main.subcategory.id },
      });
      expect(res.body.related.map((p: { id: string }) => p.id)).toEqual([related[4].id, related[3].id, related[2].id, related[1].id]);
      expect(res.body.related[0]).toMatchObject({ priceVnd: 350_000, category: { id: main.category.id } });
      expect(limited.body.related).toHaveLength(2);
    });

    it('has no related products when the category has no other active product', async () => {
      const only = await b.product();

      const res = await t.api.get(`/api/products/${only.id}`).expect(200);

      expect(res.body.related).toEqual([]);
    });

    it('answers 404 / 1001 for an unknown id', async () => {
      const res = await t.api.get('/api/products/zzzzzzzzzzzzzzzz');

      expect(error(res)).toMatchObject({ status: 404, errorCode: 1001 });
    });

    it.each([
      ['a relatedLimit of 0', { relatedLimit: 0 }],
      ['a relatedLimit above 20', { relatedLimit: 21 }],
      ['a fractional relatedLimit', { relatedLimit: 1.5 }],
      ['a non-numeric relatedLimit', { relatedLimit: 'abc' }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const product = await b.product();

      const res = await t.api.get(`/api/products/${product.id}`).query(query);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('GET /api/products/autocomplete', () => {
    it('suggests active products whose name or slug contains the text, names starting with it first, then by name', async () => {
      const [contains, starts, bySlug] = [
        await b.product({ name: 'Ao thun polo', slug: 'ao-thun-polo' }),
        await b.product({ name: 'Polo dài tay', slug: 'polo-dai-tay', badge: 'new' }),
        await b.product({ name: 'Ao khoac', slug: 'khoac-polo-mini' }),
      ];
      await b.product({ name: 'Polo cũ', status: 'disabled' });
      await b.product({ name: 'Quần' });

      const res = await t.api.get('/api/products/autocomplete').query({ q: 'POLO' }).expect(200);

      expect(res.body.data.map((p: { id: string }) => p.id)).toEqual([starts.id, bySlug.id, contains.id]);
      expect(res.body.data[0]).toEqual({
        id: starts.id,
        name: 'Polo dài tay',
        slug: 'polo-dai-tay',
        image: starts.images[0],
        badge: 'new',
        category: { id: starts.category.id, slug: starts.category.slug, title: starts.category.title },
        subcategory: { id: starts.subcategory.id, slug: starts.subcategory.slug, label: starts.subcategory.label },
        priceVnd: 350_000,
        priceUsd: 14,
      });
    });

    it('treats % and _ in the text literally and limits the number of suggestions (default 8)', async () => {
      const literal = await b.product({ name: '100%_cotton', slug: 'cotton-100' });
      await b.product({ name: '100 abc cotton' });
      for (let i = 0; i < 9; i++) await b.product({ name: `Giày ${String(i)}` });

      const exact = await t.api.get('/api/products/autocomplete').query({ q: '0%_c' }).expect(200);
      const byDefault = await t.api.get('/api/products/autocomplete').query({ q: 'Giày' }).expect(200);
      const limited = await t.api.get('/api/products/autocomplete').query({ q: 'Giày', limit: 3 }).expect(200);

      expect(exact.body.data.map((p: { id: string }) => p.id)).toEqual([literal.id]);
      expect(byDefault.body.data).toHaveLength(8);
      expect(limited.body.data).toHaveLength(3);
    });

    it('is not mistaken for a product id', async () => {
      const res = await t.api.get('/api/products/autocomplete').query({ q: 'khong-co' }).expect(200);

      expect(res.body).toEqual({ data: [] });
    });

    it.each([
      ['a missing q', {}],
      ['a q of one character', { q: 'a' }],
      ['a q longer than 255 characters', { q: 'x'.repeat(256) }],
      ['a limit of 0', { q: 'áo', limit: 0 }],
      ['a limit above 10', { q: 'áo', limit: 11 }],
      ['a fractional limit', { q: 'áo', limit: 1.5 }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const res = await t.api.get('/api/products/autocomplete').query(query);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('GET /api/admin/products', () => {
    it('lists products of every status with the standard shape', async () => {
      const admin = await b.admin();
      const [active, disabled] = [await b.product({ createdAt: day(1) }), await b.product({ status: 'disabled', createdAt: day(2) })];

      const res = await adminList(admin).expect(200);

      expect(ids(res)).toEqual([disabled.id, active.id]);
      expect(res.body).toMatchObject({ total: 2, page: 1, limit: 25, totalPages: 1 });
      expect(res.body.data[0]).toMatchObject({
        status: 'disabled',
        priceVnd: 350_000,
        priceUsd: 14,
        category: { id: disabled.category.id },
        subcategory: { id: disabled.subcategory.id },
      });
    });

    it('searches name, slug, SKU and description, and combines the search with the other filters', async () => {
      const admin = await b.admin();
      const byName = await b.product({ name: 'Áo Mây', sku: 'AAA-1', slug: 's-1', description: 'd1' });
      const bySku = await b.product({ name: 'Quần', sku: 'SKU-ZETA-9', slug: 's-2', description: 'd2' });
      const byDescription = await b.product({ name: 'Mũ', sku: 'AAA-3', slug: 's-3', description: 'Rất ấm', status: 'disabled' });

      expect(ids(await adminList(admin, { search: 'mây' }).expect(200))).toEqual([byName.id]);
      expect(ids(await adminList(admin, { search: 'zeta' }).expect(200))).toEqual([bySku.id]);
      expect(ids(await adminList(admin, { search: 'ẤM' }).expect(200))).toEqual([byDescription.id]);
      expect(ids(await adminList(admin, { search: 'aaa', status: 'disabled' }).expect(200))).toEqual([byDescription.id]);
      expect(ids(await adminList(admin, { search: 'aaa', status: 'active' }).expect(200))).toEqual([byName.id]);
    });

    it('filters by status, category slug (unknown slug → empty), badge and minimum rating', async () => {
      const admin = await b.admin();
      const { category, make } = await inCategory();
      const [rated, disabled] = [
        await make({ badge: 'sale', ratingAverage: 4.5, ratingCount: 3, createdAt: day(1) }),
        await make({ status: 'disabled', createdAt: day(2) }),
      ];
      await b.product({ ratingAverage: 2, ratingCount: 1 });

      expect(ids(await adminList(admin, { status: 'disabled' }).expect(200))).toEqual([disabled.id]);
      expect(ids(await adminList(admin, { category: category.slug }).expect(200))).toEqual([disabled.id, rated.id]);
      expect(ids(await adminList(admin, { category: 'khong-co' }).expect(200))).toEqual([]);
      expect(ids(await adminList(admin, { badge: 'sale' }).expect(200))).toEqual([rated.id]);
      expect(ids(await adminList(admin, { minRating: 4 }).expect(200))).toEqual([rated.id]);
    });

    it('sorts by price, name, creation time and rating (unrated last), and paginates', async () => {
      const admin = await b.admin();
      const [a, c, d] = [
        await b.product({ name: 'Cam', price: 300_000, createdAt: day(1), ratingAverage: 2, ratingCount: 1 }),
        await b.product({ name: 'Ao', price: 100_000, createdAt: day(2) }),
        await b.product({ name: 'Bo', price: 200_000, createdAt: day(3), ratingAverage: 5, ratingCount: 4 }),
      ];

      expect(ids(await adminList(admin, { sort: 'price' }).expect(200))).toEqual([c.id, d.id, a.id]);
      expect(ids(await adminList(admin, { sort: '-name' }).expect(200))).toEqual([a.id, d.id, c.id]);
      expect(ids(await adminList(admin, { sort: 'createdAt' }).expect(200))).toEqual([a.id, c.id, d.id]);
      expect(ids(await adminList(admin, { sort: '-ratingAverage' }).expect(200))).toEqual([d.id, a.id, c.id]);
      expect(ids(await adminList(admin, { sort: 'ratingAverage' }).expect(200))).toEqual([a.id, d.id, c.id]);
      const page = await adminList(admin, { limit: 2, page: 2 }).expect(200);
      expect(ids(page)).toEqual([a.id]);
      expect(page.body).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });
    });

    it.each([
      ['an unknown status', { status: 'deleted' }],
      ['an unknown badge', { badge: 'hot' }],
      ['a minRating of 6', { minRating: 6 }],
      ['a category longer than 255 characters', { category: 'x'.repeat(256) }],
      ['a search longer than 255 characters', { search: 'x'.repeat(256) }],
      ['a sort field outside the whitelist', { sort: 'sku' }],
      ['the removed `sorts` parameter', { sorts: 'price' }],
      ['a limit above 200', { limit: 201 }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const res = await adminList(await b.admin(), query);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });
});
