import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';

/** Batch 17 (collection): đọc công khai, danh sách admin, tạo, sửa, xoá. */
describe('Flow: collections', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  type User = Awaited<ReturnType<Builders['user']>>;
  type Product = Awaited<ReturnType<Builders['product']>>;
  const rows = <R>(sql: string, params: unknown[] = []) => t.dataSource.query(sql, params) as Promise<R[]>;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const publicList = (query: object = {}) => t.api.get('/api/collections').query(query);
  const adminList = (admin: User, query: object = {}) => t.api.get('/api/admin/collections').query(query).set(bearer(t, admin));
  const create = (admin: User, body: object) => t.api.post('/api/admin/collections').set(bearer(t, admin)).send(body);
  const update = (admin: User, id: string, body: object) => t.api.patch(`/api/admin/collections/${id}`).set(bearer(t, admin)).send(body);
  const remove = (admin: User, id: string) => t.api.delete(`/api/admin/collections/${id}`).set(bearer(t, admin));
  const ids = (res: { body: { data: { id: string }[] } }) => res.body.data.map((row) => row.id);
  const productIdsOf = (collection: { products: { id: string }[] }) => collection.products.map((product) => product.id).sort();
  const sorted = (products: Product[]) => products.map((product) => product.id).sort();
  const links = () => rows<{ collection_id: string; product_id: string }>('SELECT collection_id, product_id FROM collection_products');
  const day = (offset: number) => new Date(Date.UTC(2026, 9, 1 + offset, 12));

  /** Tạo qua API; trả view của collection. */
  async function make(admin: User, slug: string, extra: object = {}) {
    const res = await create(admin, { slug, name: `Name ${slug}`, image: `https://cdn.flow.test/${slug}.jpg`, ...extra }).expect(201);
    return res.body.data as { id: string; slug: string; products: { id: string }[] };
  }
  const setCreatedAt = (id: string, offset: number) => rows('UPDATE collections SET created_at = $2 WHERE id = $1', [id, day(offset)]);

  describe('GET /api/collections', () => {
    it('lists collections newest first with their products in the standard shape, without a token', async () => {
      const admin = await b.admin();
      const [p1, p2] = [await b.product({ price: 350_000, originalPrice: 500_000 }), await b.product()];
      const [old, recent] = [
        await make(admin, 'summer', { subtitle: 'Nắng', description: 'Mùa hè', season: 'SS26', productIds: [p1.id, p2.id] }),
        await make(admin, 'winter'),
      ];
      await setCreatedAt(old.id, 1);
      await setCreatedAt(recent.id, 2);

      const res = await publicList().expect(200);

      expect(ids(res)).toEqual([recent.id, old.id]);
      expect(res.body).toMatchObject({ total: 2, page: 1, limit: 25, totalPages: 1 });
      expect(res.body.data[1]).toMatchObject({
        id: old.id,
        slug: 'summer',
        name: 'Name summer',
        subtitle: 'Nắng',
        description: 'Mùa hè',
        image: 'https://cdn.flow.test/summer.jpg',
        season: 'SS26',
      });
      expect(productIdsOf(res.body.data[1])).toEqual(sorted([p1, p2]));
      const withPrice = res.body.data[1].products.find((p: { id: string }) => p.id === p1.id);
      expect(withPrice).toMatchObject({
        priceVnd: 350_000,
        priceUsd: 14,
        originalPriceVnd: 500_000,
        originalPriceUsd: 20,
        category: { id: p1.category.id },
        subcategory: { id: p1.subcategory.id },
      });
      expect(withPrice).not.toHaveProperty('price');
      expect(res.body.data[0].products).toEqual([]);
    });

    it('is empty without collections', async () => {
      const res = await publicList().expect(200);

      expect(res.body).toMatchObject({ data: [], total: 0, totalPages: 0 });
    });

    it('searches name and slug, sorts, and paginates on collections (not on their product rows)', async () => {
      const admin = await b.admin();
      const products = [await b.product(), await b.product(), await b.product()];
      const productIds = products.map((p) => p.id);
      const [a, c, d] = [
        await make(admin, 'aaa', { name: 'Zebra', productIds }),
        await make(admin, 'bbb-sale', { name: 'Apple', productIds }),
        await make(admin, 'ccc', { name: 'Mid', productIds }),
      ];
      await setCreatedAt(a.id, 1);
      await setCreatedAt(c.id, 2);
      await setCreatedAt(d.id, 3);

      expect(ids(await publicList({ search: 'zebra' }).expect(200))).toEqual([a.id]);
      expect(ids(await publicList({ search: 'SALE' }).expect(200))).toEqual([c.id]);
      expect(ids(await publicList({ search: 'khong-co' }).expect(200))).toEqual([]);
      expect(ids(await publicList({ sort: 'name' }).expect(200))).toEqual([c.id, d.id, a.id]);
      expect(ids(await publicList({ sort: '-name' }).expect(200))).toEqual([a.id, d.id, c.id]);
      expect(ids(await publicList({ sort: 'createdAt' }).expect(200))).toEqual([a.id, c.id, d.id]);
      const page = await publicList({ limit: 2, page: 2 }).expect(200);
      expect(ids(page)).toEqual([a.id]);
      expect(page.body).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });
      expect(page.body.data[0].products).toHaveLength(3);
      const first = await publicList({ limit: 2 }).expect(200);
      expect(first.body.data.map((row: { products: unknown[] }) => row.products.length)).toEqual([3, 3]);
    });

    it('returns one collection by slug with its products (list parameters ignored) and 404 / 1201 for an unknown slug', async () => {
      const admin = await b.admin();
      const product = await b.product();
      const summer = await make(admin, 'summer', { productIds: [product.id] });
      await make(admin, 'winter');

      const one = await publicList({ slug: 'summer', search: 'winter', page: 5 }).expect(200);
      const unknown = await publicList({ slug: 'khong-co' });

      expect(one.body.data).toMatchObject({
        id: summer.id,
        slug: 'summer',
        products: [{ id: product.id, priceVnd: 350_000, category: { id: product.category.id } }],
      });
      expect(one.body.products).toEqual(one.body.data.products);
      expect(one.body).not.toHaveProperty('total');
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1201 });
    });

    it.each([
      ['a sort field outside the whitelist', { sort: 'slug' }],
      ['the removed `sorts` parameter', { sorts: 'name' }],
      ['a limit above 200', { limit: 201 }],
      ['a page below 1', { page: 0 }],
      ['a search longer than 255 characters', { search: 'x'.repeat(256) }],
      ['a slug longer than 255 characters', { slug: 'x'.repeat(256) }],
      ['a season filter (admin only)', { season: 'SS26' }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const res = await publicList(query);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('GET /api/admin/collections', () => {
    it('lists collections with their products, newest first', async () => {
      const admin = await b.admin();
      const product = await b.product();
      const [old, recent] = [await make(admin, 'summer', { productIds: [product.id] }), await make(admin, 'winter')];
      await setCreatedAt(old.id, 1);
      await setCreatedAt(recent.id, 2);

      const res = await adminList(admin).expect(200);

      expect(ids(res)).toEqual([recent.id, old.id]);
      expect(res.body).toMatchObject({ total: 2, page: 1, limit: 25, totalPages: 1 });
      expect(res.body.data[1].products).toMatchObject([
        { id: product.id, priceVnd: 350_000, priceUsd: 14, category: { id: product.category.id } },
      ]);
    });

    it('filters by exact season, searches slug and name, sorts and paginates', async () => {
      const admin = await b.admin();
      const [a, c, d] = [
        await make(admin, 'aaa', { name: 'Zebra', season: 'SS26' }),
        await make(admin, 'bbb', { name: 'Apple', season: 'FW26' }),
        await make(admin, 'ccc-ss', { name: 'Mid', season: 'SS26' }),
      ];
      await setCreatedAt(a.id, 1);
      await setCreatedAt(c.id, 2);
      await setCreatedAt(d.id, 3);

      expect(ids(await adminList(admin, { season: 'SS26' }).expect(200))).toEqual([d.id, a.id]);
      expect(ids(await adminList(admin, { season: 'ss26' }).expect(200))).toEqual([]);
      expect(ids(await adminList(admin, { search: 'zebra' }).expect(200))).toEqual([a.id]);
      expect(ids(await adminList(admin, { search: 'CCC' }).expect(200))).toEqual([d.id]);
      expect(ids(await adminList(admin, { search: 'a', season: 'FW26' }).expect(200))).toEqual([c.id]);
      expect(ids(await adminList(admin, { sort: 'name' }).expect(200))).toEqual([c.id, d.id, a.id]);
      expect(ids(await adminList(admin, { sort: 'createdAt' }).expect(200))).toEqual([a.id, c.id, d.id]);
      const page = await adminList(admin, { limit: 2, page: 2 }).expect(200);
      expect(ids(page)).toEqual([a.id]);
      expect(page.body).toMatchObject({ total: 3, totalPages: 2 });
    });

    it.each([
      ['a sort field outside the whitelist', { sort: 'season' }],
      ['the removed `sorts` parameter', { sorts: 'name' }],
      ['a limit above 200', { limit: 201 }],
      ['a season longer than 100 characters', { season: 'x'.repeat(101) }],
      ['a search longer than 255 characters', { search: 'x'.repeat(256) }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const res = await adminList(await b.admin(), query);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('POST /api/admin/collections', () => {
    it('creates a collection with its products, and the defaults when optional fields are left out', async () => {
      const admin = await b.admin();
      const [p1, p2] = [await b.product(), await b.product()];

      const full = await create(admin, {
        slug: 'summer',
        name: 'Summer',
        subtitle: 'Nắng',
        description: 'Mùa hè',
        image: 'https://cdn.flow.test/s.jpg',
        season: 'SS26',
        productIds: [p1.id, p2.id],
      }).expect(201);
      const minimal = await create(admin, { slug: 'plain', name: 'Plain', image: 'https://cdn.flow.test/p.jpg' }).expect(201);

      expect(full.body.data).toMatchObject({
        id: expect.any(String),
        slug: 'summer',
        name: 'Summer',
        subtitle: 'Nắng',
        description: 'Mùa hè',
        season: 'SS26',
        image: 'https://cdn.flow.test/s.jpg',
      });
      expect(productIdsOf(full.body.data)).toEqual(sorted([p1, p2]));
      expect(full.body.data.products[0]).toMatchObject({ priceVnd: 350_000, priceUsd: 14, category: { id: expect.any(String) } });
      expect(await rows('SELECT slug, subtitle, description, season FROM collections ORDER BY slug')).toEqual([
        { slug: 'plain', subtitle: '', description: '', season: '' },
        { slug: 'summer', subtitle: 'Nắng', description: 'Mùa hè', season: 'SS26' },
      ]);
      expect(minimal.body.data.products ?? []).toEqual([]);
      expect(await links()).toHaveLength(2);
    });

    it('shows a new collection in the public list and by slug', async () => {
      const admin = await b.admin();
      const product = await b.product();

      await make(admin, 'summer', { productIds: [product.id] });

      expect((await publicList().expect(200)).body.total).toBe(1);
      expect((await publicList({ slug: 'summer' }).expect(200)).body.data.products).toHaveLength(1);
    });

    it('refuses a duplicate slug (400 / 1202) and creates nothing', async () => {
      const admin = await b.admin();
      await make(admin, 'summer');

      const res = await create(admin, { slug: 'summer', name: 'Khác', image: 'x' });

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1202 });
      expect(await rows('SELECT 1 FROM collections')).toHaveLength(1);
    });

    it('refuses unknown products (400 / 1203, naming them) and creates nothing', async () => {
      const admin = await b.admin();
      const product = await b.product();

      const res = await create(admin, { slug: 'summer', name: 'Summer', image: 'x', productIds: [product.id, 'zzzzzzzzzzzzzzzz'] });

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1203, message: expect.stringContaining('zzzzzzzzzzzzzzzz') });
      expect(await rows('SELECT 1 FROM collections')).toHaveLength(0);
      expect(await links()).toHaveLength(0);
    });

    it.each([
      ['a missing slug', { name: 'N', image: 'x' }],
      ['an empty slug', { slug: '', name: 'N', image: 'x' }],
      ['a slug longer than 255 characters', { slug: 'x'.repeat(256), name: 'N', image: 'x' }],
      ['a missing name', { slug: 's', image: 'x' }],
      ['an empty name', { slug: 's', name: '', image: 'x' }],
      ['a missing image', { slug: 's', name: 'N' }],
      ['an empty image', { slug: 's', name: 'N', image: '' }],
      ['an image longer than 500 characters', { slug: 's', name: 'N', image: 'x'.repeat(501) }],
      ['a subtitle longer than 500 characters', { slug: 's', name: 'N', image: 'x', subtitle: 'x'.repeat(501) }],
      ['a season longer than 100 characters', { slug: 's', name: 'N', image: 'x', season: 'x'.repeat(101) }],
      ['productIds that are not an array', { slug: 's', name: 'N', image: 'x', productIds: 'abc' }],
      ['an empty product id', { slug: 's', name: 'N', image: 'x', productIds: [''] }],
      ['a non-string product id', { slug: 's', name: 'N', image: 'x', productIds: [5] }],
      [
        'more than 100 product ids',
        { slug: 's', name: 'N', image: 'x', productIds: Array.from({ length: 101 }, (_, i) => `p-${String(i)}`) },
      ],
      ['an unknown field', { slug: 's', name: 'N', image: 'x', id: 'custom' }],
    ])('rejects %s with a validation error (no errorCode) and creates nothing', async (_name, body) => {
      const res = await create(await b.admin(), body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await rows('SELECT 1 FROM collections')).toHaveLength(0);
    });
  });

  describe('PATCH /api/admin/collections/:id', () => {
    it('changes only the fields sent in the database and keeps the products', async () => {
      const admin = await b.admin();
      const product = await b.product();
      const summer = await make(admin, 'summer', { subtitle: 'Nắng', season: 'SS26', productIds: [product.id] });

      const res = await update(admin, summer.id, { name: 'Tên mới', description: 'Mô tả mới' }).expect(200);

      expect(res.body.data).toMatchObject({ id: summer.id, name: 'Tên mới', description: 'Mô tả mới' });
      expect(await rows('SELECT slug, name, subtitle, description, season FROM collections')).toEqual([
        { slug: 'summer', name: 'Tên mới', subtitle: 'Nắng', description: 'Mô tả mới', season: 'SS26' },
      ]);
      expect(await links()).toEqual([{ collection_id: summer.id, product_id: product.id }]);
    });

    it('replaces the whole product list when productIds is sent, and clears it with []', async () => {
      const admin = await b.admin();
      const [p1, p2, p3] = [await b.product(), await b.product(), await b.product()];
      const summer = await make(admin, 'summer', { productIds: [p1.id, p2.id] });

      const replaced = await update(admin, summer.id, { productIds: [p2.id, p3.id] }).expect(200);
      expect(productIdsOf(replaced.body.data)).toEqual(sorted([p2, p3]));
      expect((await links()).map((row) => row.product_id).sort()).toEqual(sorted([p2, p3]));
      await update(admin, summer.id, { productIds: [] }).expect(200);

      expect(await links()).toHaveLength(0);
      expect((await publicList({ slug: 'summer' }).expect(200)).body.data.products).toEqual([]);
    });

    it('changes the slug and accepts its own slug again', async () => {
      const admin = await b.admin();
      const summer = await make(admin, 'summer');

      await update(admin, summer.id, { slug: 'summer' }).expect(200);
      await update(admin, summer.id, { slug: 'summer-2026' }).expect(200);

      expect(await rows('SELECT slug FROM collections')).toEqual([{ slug: 'summer-2026' }]);
    });

    it('refuses a slug used by another collection (400 / 1202)', async () => {
      const admin = await b.admin();
      const [summer] = [await make(admin, 'summer'), await make(admin, 'winter')];

      const res = await update(admin, summer.id, { slug: 'winter' });

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1202 });
      expect(await rows('SELECT slug FROM collections ORDER BY slug')).toEqual([{ slug: 'summer' }, { slug: 'winter' }]);
    });

    it('refuses unknown products (400 / 1203) and keeps the old list and fields', async () => {
      const admin = await b.admin();
      const product = await b.product();
      const summer = await make(admin, 'summer', { productIds: [product.id] });

      const res = await update(admin, summer.id, { name: 'Không lưu', productIds: ['zzzzzzzzzzzzzzzz'] });

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1203 });
      expect(await links()).toEqual([{ collection_id: summer.id, product_id: product.id }]);
      expect(await rows('SELECT name FROM collections')).toEqual([{ name: 'Name summer' }]);
    });

    it('answers 404 / 1201 for an unknown collection', async () => {
      const res = await update(await b.admin(), 'zzzzzzzzzzzzzzzz', { name: 'x' });

      expect(error(res)).toMatchObject({ status: 404, errorCode: 1201 });
    });

    it.each([
      ['a slug longer than 255 characters', { slug: 'x'.repeat(256) }],
      ['a name longer than 255 characters', { name: 'x'.repeat(256) }],
      ['a subtitle longer than 500 characters', { subtitle: 'x'.repeat(501) }],
      ['an image longer than 500 characters', { image: 'x'.repeat(501) }],
      ['a season longer than 100 characters', { season: 'x'.repeat(101) }],
      ['productIds that are not an array', { productIds: 'abc' }],
      ['an empty product id', { productIds: [''] }],
      ['more than 100 product ids', { productIds: Array.from({ length: 101 }, (_, i) => `p-${String(i)}`) }],
      ['an unknown field', { id: 'other' }],
    ])('rejects %s with a validation error (no errorCode) and changes nothing', async (_name, body) => {
      const admin = await b.admin();
      const summer = await make(admin, 'summer');

      const res = await update(admin, summer.id, body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await rows('SELECT slug, name FROM collections')).toEqual([{ slug: 'summer', name: 'Name summer' }]);
    });
  });

  describe('DELETE /api/admin/collections/:id', () => {
    it('deletes the collection and its links but keeps the products and other collections', async () => {
      const admin = await b.admin();
      const product = await b.product();
      const [summer, winter] = [
        await make(admin, 'summer', { productIds: [product.id] }),
        await make(admin, 'winter', { productIds: [product.id] }),
      ];

      const res = await remove(admin, summer.id).expect(200);

      expect(res.body).toEqual({ message: 'Collection deleted successfully' });
      expect(await rows('SELECT id FROM collections')).toEqual([{ id: winter.id }]);
      expect(await links()).toEqual([{ collection_id: winter.id, product_id: product.id }]);
      expect(await rows('SELECT id FROM products')).toEqual([{ id: product.id }]);
      expect((await publicList().expect(200)).body.total).toBe(1);
    });

    it('answers 404 / 1201 for an unknown collection and for a second delete', async () => {
      const admin = await b.admin();
      const summer = await make(admin, 'summer');
      await remove(admin, summer.id).expect(200);

      const again = await remove(admin, summer.id);
      const unknown = await remove(admin, 'zzzzzzzzzzzzzzzz');

      expect(error(again)).toMatchObject({ status: 404, errorCode: 1201 });
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1201 });
    });
  });
});
