import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { requestWhileAdvisoryLocked } from '../../support/locks';

/** Batch 15–16 (category): đọc công khai, danh sách admin, tạo, sửa, xoá, xếp lại thứ tự. */
describe('Flow: categories', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  type User = Awaited<ReturnType<Builders['user']>>;
  type Made = { id: string; slug: string; title: string; priority: number; subcategories: { id: string; slug: string }[] };
  const rows = <R>(sql: string, params: unknown[] = []) => t.dataSource.query(sql, params) as Promise<R[]>;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const publicList = (query: object = {}) => t.api.get('/api/categories').query(query);
  const adminList = (admin: User, query: object = {}) => t.api.get('/api/admin/categories').query(query).set(bearer(t, admin));
  const create = (admin: User, body: object) => t.api.post('/api/admin/categories').set(bearer(t, admin)).send(body);
  const update = (admin: User, id: string, body: object) => t.api.patch(`/api/admin/categories/${id}`).set(bearer(t, admin)).send(body);
  const remove = (admin: User, id: string) => t.api.delete(`/api/admin/categories/${id}`).set(bearer(t, admin));
  const reorder = (admin: User, ids: unknown) => t.api.patch('/api/admin/categories/reorder').set(bearer(t, admin)).send({ ids });
  const ids = (res: { body: { data: { id: string }[] } }) => res.body.data.map((row) => row.id);
  const priorities = () =>
    rows<{ slug: string; priority: number }>('SELECT slug, priority FROM categories ORDER BY priority').then((r) =>
      r.map((row) => [row.slug, row.priority]),
    );

  /** Tạo qua API để `priority` là dãy 1..N như production. */
  async function make(admin: User, slug: string, extra: object = {}): Promise<Made> {
    const res = await create(admin, { slug, title: `Title ${slug}`, ...extra }).expect(201);
    return res.body.data as Made;
  }

  describe('GET /api/categories', () => {
    it('lists categories by priority with their subcategories in the public shape, without a token', async () => {
      const admin = await b.admin();
      const [first, second] = [
        await make(admin, 'tops', {
          description: 'Áo',
          heroImage: 'https://cdn.flow.test/tops.jpg',
          subcategories: [{ slug: 't-shirts', label: 'T-shirts', description: 'Áo thun', count: 4 }],
        }),
        await make(admin, 'bags'),
      ];

      const res = await publicList().expect(200);

      expect(ids(res)).toEqual([first.id, second.id]);
      expect(res.body).toMatchObject({ total: 2, page: 1, limit: 25, totalPages: 1 });
      expect(res.body.data[0]).toEqual({
        id: first.id,
        slug: 'tops',
        title: 'Title tops',
        description: 'Áo',
        heroImage: 'https://cdn.flow.test/tops.jpg',
        priority: 1,
        subcategories: [{ id: first.subcategories[0].id, slug: 't-shirts', label: 'T-shirts', description: 'Áo thun', count: 4 }],
      });
      expect(res.body.data[1]).toMatchObject({ heroImage: null, subcategories: [] });
    });

    it('is empty without categories', async () => {
      const res = await publicList().expect(200);

      expect(res.body).toMatchObject({ data: [], total: 0, totalPages: 0 });
    });

    it('searches title, slug and description, sorts, and paginates on categories (not on their subcategory rows)', async () => {
      const admin = await b.admin();
      const sub = (n: number) => Array.from({ length: n }, (_, i) => ({ slug: `s-${i}`, label: `S ${i}` }));
      const [a, c, d] = [
        await make(admin, 'aaa', { title: 'Zebra', description: 'Dạ hội', subcategories: sub(3) }),
        await make(admin, 'bbb', { title: 'Apple', subcategories: sub(3) }),
        await make(admin, 'ccc-mu', { title: 'Mid', subcategories: sub(3) }),
      ];

      expect(ids(await publicList({ search: 'zebra' }).expect(200))).toEqual([a.id]);
      expect(ids(await publicList({ search: 'DẠ HỘI' }).expect(200))).toEqual([a.id]);
      expect(ids(await publicList({ search: 'ccc' }).expect(200))).toEqual([d.id]);
      expect(ids(await publicList({ search: 'khong-co' }).expect(200))).toEqual([]);
      expect(ids(await publicList({ sort: 'title' }).expect(200))).toEqual([c.id, d.id, a.id]);
      expect(ids(await publicList({ sort: '-priority' }).expect(200))).toEqual([d.id, c.id, a.id]);
      expect(ids(await publicList({ sort: 'createdAt' }).expect(200))).toEqual([a.id, c.id, d.id]);
      const page = await publicList({ limit: 2, page: 2 }).expect(200);
      expect(ids(page)).toEqual([d.id]);
      expect(page.body).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });
      expect(page.body.data[0].subcategories).toHaveLength(3);
      const first = await publicList({ limit: 2 }).expect(200);
      expect(first.body.data.map((row: { subcategories: unknown[] }) => row.subcategories.length)).toEqual([3, 3]);
    });

    it('returns one category by slug (list parameters ignored) and 404 / 1101 for an unknown slug', async () => {
      const admin = await b.admin();
      const tops = await make(admin, 'tops', { subcategories: [{ slug: 'polo', label: 'Polo' }] });
      await make(admin, 'bags');

      const one = await publicList({ slug: 'tops', search: 'bags', page: 5 }).expect(200);
      const unknown = await publicList({ slug: 'khong-co' });

      expect(one.body.data).toMatchObject({ id: tops.id, slug: 'tops', priority: 1, subcategories: [{ slug: 'polo', label: 'Polo' }] });
      expect(one.body).not.toHaveProperty('total');
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1101 });
    });

    it.each([
      ['a sort field outside the whitelist', { sort: 'slug' }],
      ['the removed `sorts` parameter', { sorts: 'title' }],
      ['a limit above 200', { limit: 201 }],
      ['a page below 1', { page: 0 }],
      ['a search longer than 255 characters', { search: 'x'.repeat(256) }],
      ['a slug longer than 255 characters', { slug: 'x'.repeat(256) }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const res = await publicList(query);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('GET /api/admin/categories', () => {
    it('lists the entity with timestamps and subcategories, by priority', async () => {
      const admin = await b.admin();
      const [first, second] = [await make(admin, 'tops', { subcategories: [{ slug: 'polo', label: 'Polo' }] }), await make(admin, 'bags')];

      const res = await adminList(admin).expect(200);

      expect(ids(res)).toEqual([first.id, second.id]);
      expect(res.body).toMatchObject({ total: 2, page: 1, limit: 25, totalPages: 1 });
      expect(res.body.data[0]).toMatchObject({
        id: first.id,
        slug: 'tops',
        priority: 1,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        subcategories: [{ slug: 'polo', label: 'Polo', count: 0 }],
      });
    });

    it('searches slug, title and description, sorts and paginates', async () => {
      const admin = await b.admin();
      const [a, c, d] = [
        await make(admin, 'aaa', { title: 'Zebra' }),
        await make(admin, 'bbb', { title: 'Apple', description: 'Quả táo' }),
        await make(admin, 'ccc', { title: 'Mid' }),
      ];

      expect(ids(await adminList(admin, { search: 'zebra' }).expect(200))).toEqual([a.id]);
      expect(ids(await adminList(admin, { search: 'TÁO' }).expect(200))).toEqual([c.id]);
      expect(ids(await adminList(admin, { search: 'ccc' }).expect(200))).toEqual([d.id]);
      expect(ids(await adminList(admin, { sort: '-title' }).expect(200))).toEqual([a.id, d.id, c.id]);
      expect(ids(await adminList(admin, { sort: '-createdAt' }).expect(200))).toEqual([d.id, c.id, a.id]);
      const page = await adminList(admin, { limit: 2, page: 2 }).expect(200);
      expect(ids(page)).toEqual([d.id]);
      expect(page.body).toMatchObject({ total: 3, totalPages: 2 });
    });

    it.each([
      ['a sort field outside the whitelist', { sort: 'slug' }],
      ['the removed `sorts` parameter', { sorts: 'title' }],
      ['a limit above 200', { limit: 201 }],
      ['a search longer than 255 characters', { search: 'x'.repeat(256) }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const res = await adminList(await b.admin(), query);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('POST /api/admin/categories', () => {
    it('creates a category at the end of the order with its subcategories and the defaults', async () => {
      const admin = await b.admin();
      await make(admin, 'first');

      const res = await create(admin, {
        slug: 'tops',
        title: 'Tops',
        description: 'Áo',
        heroImage: 'https://cdn.flow.test/t.jpg',
        subcategories: [
          { slug: 'polo', label: 'Polo', count: 3 },
          { slug: 'tee', label: 'Tee' },
        ],
      }).expect(201);

      expect(res.body.data).toMatchObject({
        id: expect.any(String),
        slug: 'tops',
        title: 'Tops',
        description: 'Áo',
        heroImage: 'https://cdn.flow.test/t.jpg',
        priority: 2,
      });
      expect(
        res.body.data.subcategories.map((s: { slug: string; label: string; description: string; count: number }) => [
          s.slug,
          s.label,
          s.description,
          s.count,
        ]),
      ).toEqual([
        ['polo', 'Polo', '', 3],
        ['tee', 'Tee', '', 0],
      ]);
      expect(await priorities()).toEqual([
        ['first', 1],
        ['tops', 2],
      ]);
    });

    it('needs only a slug and a title (description empty, no hero image, no subcategories), and takes priority 1 when first', async () => {
      const admin = await b.admin();

      const res = await create(admin, { slug: 'bags', title: 'Bags' }).expect(201);

      expect(res.body.data).toMatchObject({ description: '', heroImage: null, priority: 1, subcategories: [] });
      expect(await rows('SELECT 1 FROM subcategories')).toHaveLength(0);
    });

    it('lets two categories use the same subcategory slug, and keeps the order unique when many are created at once', async () => {
      const admin = await b.admin();
      await create(admin, { slug: 'a', title: 'A', subcategories: [{ slug: 'same', label: 'Same' }] }).expect(201);
      await create(admin, { slug: 'b', title: 'B', subcategories: [{ slug: 'same', label: 'Same' }] }).expect(201);

      const results = await Promise.all(['c', 'd', 'e', 'f', 'g'].map((slug) => create(admin, { slug, title: slug.toUpperCase() })));

      expect(results.map((res) => res.status)).toEqual([201, 201, 201, 201, 201]);
      expect((await priorities()).map(([, priority]) => priority)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('refuses a duplicate slug (400 / 1102) and creates nothing', async () => {
      const admin = await b.admin();
      await make(admin, 'tops');

      const res = await create(admin, { slug: 'tops', title: 'Khác' });

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1102 });
      expect(await priorities()).toEqual([['tops', 1]]);
    });

    it('refuses repeated subcategory slugs in the payload (400 / 1103)', async () => {
      const admin = await b.admin();

      const res = await create(admin, {
        slug: 'tops',
        title: 'Tops',
        subcategories: [
          { slug: 'x', label: 'X' },
          { slug: 'x', label: 'Y' },
        ],
      });

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1103 });
      expect(await priorities()).toEqual([]);
    });

    it('lets exactly one of several simultaneous creations with the same slug through (the others are 400)', async () => {
      const admin = await b.admin();

      const results = await Promise.all([1, 2, 3].map((n) => create(admin, { slug: 'dup', title: `T${String(n)}` })));

      expect(results.map((res) => res.status).sort()).toEqual([201, 400, 400]);
      expect(results.filter((res) => res.status === 400).map((res) => res.body.errorCode)).toEqual([1102, 1102]);
      expect(await priorities()).toEqual([['dup', 1]]);
    });

    it('waits for the priority lock and then takes the next free rank', async () => {
      const admin = await b.admin();
      await make(admin, 'first');

      const res = await requestWhileAdvisoryLocked(
        t.dataSource,
        'categories_priority',
        () => create(admin, { slug: 'late', title: 'Late' }),
        (runner) =>
          runner.query(
            `INSERT INTO categories (id, slug, title, description, priority, created_at, updated_at) VALUES ('inserted0000001', 'meanwhile', 'Meanwhile', '', 2, now(), now())`,
          ),
      );

      expect(res.status).toBe(201);
      expect(await priorities()).toEqual([
        ['first', 1],
        ['meanwhile', 2],
        ['late', 3],
      ]);
    });

    it.each([
      ['a missing slug', { title: 'T' }],
      ['an empty slug', { slug: '', title: 'T' }],
      ['a slug longer than 255 characters', { slug: 'x'.repeat(256), title: 'T' }],
      ['a missing title', { slug: 's' }],
      ['an empty title', { slug: 's', title: '' }],
      ['a title longer than 255 characters', { slug: 's', title: 'x'.repeat(256) }],
      ['a non-string description', { slug: 's', title: 'T', description: 5 }],
      ['a hero image longer than 500 characters', { slug: 's', title: 'T', heroImage: 'x'.repeat(501) }],
      ['subcategories that are not an array', { slug: 's', title: 'T', subcategories: 'polo' }],
      ['a subcategory without a slug', { slug: 's', title: 'T', subcategories: [{ label: 'L' }] }],
      ['a subcategory with an empty label', { slug: 's', title: 'T', subcategories: [{ slug: 'x', label: '' }] }],
      ['a negative subcategory count', { slug: 's', title: 'T', subcategories: [{ slug: 'x', label: 'L', count: -1 }] }],
      ['a fractional subcategory count', { slug: 's', title: 'T', subcategories: [{ slug: 'x', label: 'L', count: 1.5 }] }],
      ['an unknown subcategory field', { slug: 's', title: 'T', subcategories: [{ slug: 'x', label: 'L', id: 'custom' }] }],
      ['a priority (not accepted when creating)', { slug: 's', title: 'T', priority: 1 }],
      ['an unknown field', { slug: 's', title: 'T', id: 'custom' }],
    ])('rejects %s with a validation error (no errorCode) and creates nothing', async (_name, body) => {
      const res = await create(await b.admin(), body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await priorities()).toEqual([]);
    });
  });

  describe('PATCH /api/admin/categories/:id', () => {
    it('changes only the fields sent in the database and keeps the others', async () => {
      const admin = await b.admin();
      const tops = await make(admin, 'tops', { description: 'Áo', heroImage: 'https://cdn.flow.test/t.jpg' });

      const res = await update(admin, tops.id, { title: 'Áo các loại' }).expect(200);

      expect(res.body.data).toMatchObject({
        id: tops.id,
        slug: 'tops',
        title: 'Áo các loại',
        description: 'Áo',
        heroImage: 'https://cdn.flow.test/t.jpg',
        priority: 1,
        subcategories: [],
      });
      expect(await rows('SELECT slug, title, description, hero_image, priority FROM categories')).toEqual([
        { slug: 'tops', title: 'Áo các loại', description: 'Áo', hero_image: 'https://cdn.flow.test/t.jpg', priority: 1 },
      ]);
    });

    it('changes the slug and description, clears the hero image with null, and accepts its own slug again', async () => {
      const admin = await b.admin();
      const tops = await make(admin, 'tops', { heroImage: 'https://cdn.flow.test/t.jpg' });

      await update(admin, tops.id, { slug: 'tops' }).expect(200);
      await update(admin, tops.id, { slug: 'tops-moi', description: 'Mô tả mới', heroImage: null }).expect(200);

      expect(await rows('SELECT slug, description, hero_image FROM categories')).toEqual([
        { slug: 'tops-moi', description: 'Mô tả mới', hero_image: null },
      ]);
    });

    it('refuses a slug used by another category (400 / 1102)', async () => {
      const admin = await b.admin();
      const [tops] = [await make(admin, 'tops'), await make(admin, 'bags')];

      const res = await update(admin, tops.id, { slug: 'bags' });

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1102 });
      expect((await priorities()).map(([slug]) => slug)).toEqual(['tops', 'bags']);
    });

    it('moves a category to another rank and shifts the ones in between, up and down', async () => {
      const admin = await b.admin();
      const [a, , , d] = [await make(admin, 'a'), await make(admin, 'b'), await make(admin, 'c'), await make(admin, 'd')];

      await update(admin, d.id, { priority: 1 }).expect(200);
      expect(await priorities()).toEqual([
        ['d', 1],
        ['a', 2],
        ['b', 3],
        ['c', 4],
      ]);
      await update(admin, a.id, { priority: 4 }).expect(200);
      expect(await priorities()).toEqual([
        ['d', 1],
        ['b', 2],
        ['c', 3],
        ['a', 4],
      ]);
      await update(admin, a.id, { priority: 4 }).expect(200);
      expect(await priorities()).toEqual([
        ['d', 1],
        ['b', 2],
        ['c', 3],
        ['a', 4],
      ]);
    });

    it('refuses a rank above the number of categories (400 / 1108) and changes nothing', async () => {
      const admin = await b.admin();
      const [a] = [await make(admin, 'a'), await make(admin, 'b')];

      const res = await update(admin, a.id, { priority: 3, title: 'Không lưu' });

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1108 });
      expect(await rows('SELECT title FROM categories ORDER BY priority')).toEqual([{ title: 'Title a' }, { title: 'Title b' }]);
      expect(await priorities()).toEqual([
        ['a', 1],
        ['b', 2],
      ]);
    });

    it('syncs subcategories by slug: keeps the id of a matching one, adds new ones, removes the ones left out', async () => {
      const admin = await b.admin();
      const tops = await make(admin, 'tops', {
        subcategories: [
          { slug: 'polo', label: 'Polo', count: 1 },
          { slug: 'tee', label: 'Tee' },
        ],
      });
      const poloId = tops.subcategories.find((s) => s.slug === 'polo')?.id;

      await update(admin, tops.id, {
        subcategories: [
          { slug: 'polo', label: 'Polo mới', description: 'Có cổ', count: 9 },
          { slug: 'hoodie', label: 'Hoodie' },
        ],
      }).expect(200);

      expect(await rows('SELECT id, slug, label, description, count FROM subcategories ORDER BY slug')).toEqual([
        { id: expect.any(String), slug: 'hoodie', label: 'Hoodie', description: '', count: 0 },
        { id: poloId, slug: 'polo', label: 'Polo mới', description: 'Có cổ', count: 9 },
      ]);
    });

    it('removes every subcategory with an empty list, and refuses repeated slugs (400 / 1103)', async () => {
      const admin = await b.admin();
      const tops = await make(admin, 'tops', { subcategories: [{ slug: 'polo', label: 'Polo' }] });

      const repeated = await update(admin, tops.id, {
        subcategories: [
          { slug: 'x', label: 'X' },
          { slug: 'x', label: 'Y' },
        ],
      });
      expect(error(repeated)).toMatchObject({ status: 400, errorCode: 1103 });
      expect(await rows('SELECT slug FROM subcategories')).toEqual([{ slug: 'polo' }]);
      await update(admin, tops.id, { subcategories: [] }).expect(200);

      expect(await rows('SELECT 1 FROM subcategories')).toHaveLength(0);
    });

    it('refuses to drop a subcategory that still has products (400 / 1105), changing nothing', async () => {
      const admin = await b.admin();
      const category = await b.category();
      const sub = category.subcategories[0];
      await b.product({ category, subcategory: sub });

      const res = await update(admin, category.id, { title: 'Không lưu', subcategories: [{ slug: 'khac', label: 'Khác' }] });

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1105, message: expect.stringContaining(sub.slug) });
      expect(await rows('SELECT slug FROM subcategories')).toEqual([{ slug: sub.slug }]);
      expect(await rows('SELECT title FROM categories')).toEqual([{ title: category.title }]);
    });

    it('keeps a subcategory with products when the payload still lists it, and lets its label change', async () => {
      const admin = await b.admin();
      const category = await b.category();
      const sub = category.subcategories[0];
      const product = await b.product({ category, subcategory: sub });

      await update(admin, category.id, { subcategories: [{ slug: sub.slug, label: 'Nhãn mới' }] }).expect(200);

      expect(await rows('SELECT id, label FROM subcategories')).toEqual([{ id: sub.id, label: 'Nhãn mới' }]);
      expect(await rows('SELECT subcategory_id FROM products WHERE id = $1', [product.id])).toEqual([{ subcategory_id: sub.id }]);
    });

    it('treats null on an optional field as not sent, and still clears the hero image with null', async () => {
      const admin = await b.admin();
      const tops = await make(admin, 'tops', {
        description: 'Áo',
        heroImage: 'https://cdn.flow.test/t.jpg',
        subcategories: [{ slug: 'polo', label: 'Polo' }],
      });

      const ignored = await update(admin, tops.id, { description: null, subcategories: null, priority: null }).expect(200);
      expect(ignored.body.data).toMatchObject({
        description: 'Áo',
        heroImage: 'https://cdn.flow.test/t.jpg',
        subcategories: [{ slug: 'polo' }],
      });
      const cleared = await update(admin, tops.id, { heroImage: null }).expect(200);

      expect(cleared.body.data.heroImage).toBeNull();
      expect(await rows('SELECT description, hero_image FROM categories')).toEqual([{ description: 'Áo', hero_image: null }]);
    });

    it('answers 404 / 1101 for an unknown category', async () => {
      const res = await update(await b.admin(), 'zzzzzzzzzzzzzzzz', { title: 'x' });

      expect(error(res)).toMatchObject({ status: 404, errorCode: 1101 });
    });

    it.each([
      ['a slug longer than 255 characters', { slug: 'x'.repeat(256) }],
      ['a title longer than 255 characters', { title: 'x'.repeat(256) }],
      ['a hero image longer than 500 characters', { heroImage: 'x'.repeat(501) }],
      ['a priority of 0', { priority: 0 }],
      ['a fractional priority', { priority: 1.5 }],
      ['subcategories that are not an array', { subcategories: 'polo' }],
      ['a subcategory without a label', { subcategories: [{ slug: 'x' }] }],
      ['a negative subcategory count', { subcategories: [{ slug: 'x', label: 'L', count: -1 }] }],
      ['an empty slug', { slug: '' }],
      ['an empty title', { title: '' }],
      ['a null slug', { slug: null }],
      ['a null title', { title: null }],
      ['an unknown field', { id: 'other' }],
    ])('rejects %s with a validation error (no errorCode) and changes nothing', async (_name, body) => {
      const admin = await b.admin();
      const tops = await make(admin, 'tops');

      const res = await update(admin, tops.id, body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await priorities()).toEqual([['tops', 1]]);
    });
  });

  describe('DELETE /api/admin/categories/:id', () => {
    it('deletes the category with its subcategories and closes the gap in the order', async () => {
      const admin = await b.admin();
      const [, middle] = [
        await make(admin, 'a'),
        await make(admin, 'b', { subcategories: [{ slug: 'x', label: 'X' }] }),
        await make(admin, 'c'),
      ];
      const created = await rows<{ id: string }>(`SELECT id FROM categories WHERE slug = 'b'`);

      const res = await remove(admin, created[0].id).expect(200);

      expect(res.body).toEqual({ message: 'Category deleted successfully' });
      expect(middle.slug).toBe('b');
      expect(await priorities()).toEqual([
        ['a', 1],
        ['c', 2],
      ]);
      expect(await rows('SELECT 1 FROM subcategories')).toHaveLength(0);
    });

    it('deletes the first and the last one correctly', async () => {
      const admin = await b.admin();
      const [a, , c] = [await make(admin, 'a'), await make(admin, 'b'), await make(admin, 'c')];

      await remove(admin, c.id).expect(200);
      await remove(admin, a.id).expect(200);

      expect(await priorities()).toEqual([['b', 1]]);
    });

    it('refuses to delete a category that still has products (400 / 1104) and keeps everything', async () => {
      const admin = await b.admin();
      const category = await b.category();
      await b.product({ category, subcategory: category.subcategories[0] });

      const res = await remove(admin, category.id);

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1104 });
      expect(await rows('SELECT 1 FROM categories')).toHaveLength(1);
      expect(await rows('SELECT 1 FROM subcategories')).toHaveLength(1);
    });

    it('answers 404 / 1101 for an unknown category and for a second delete', async () => {
      const admin = await b.admin();
      const a = await make(admin, 'a');
      await remove(admin, a.id).expect(200);

      const again = await remove(admin, a.id);
      const unknown = await remove(admin, 'zzzzzzzzzzzzzzzz');

      expect(error(again)).toMatchObject({ status: 404, errorCode: 1101 });
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1101 });
    });
  });

  describe('PATCH /api/admin/categories/reorder', () => {
    it('sets the order from the ids sent, answers with the new ranks, and the lists follow', async () => {
      const admin = await b.admin();
      const [a, c, d] = [await make(admin, 'a'), await make(admin, 'b'), await make(admin, 'c')];

      const res = await reorder(admin, [d.id, a.id, c.id]).expect(200);

      expect(res.body).toEqual({
        data: [
          { id: d.id, priority: 1 },
          { id: a.id, priority: 2 },
          { id: c.id, priority: 3 },
        ],
      });
      expect(await priorities()).toEqual([
        ['c', 1],
        ['a', 2],
        ['b', 3],
      ]);
      expect(ids(await publicList().expect(200))).toEqual([d.id, a.id, c.id]);
    });

    it('accepts the current order (no change) and a single category', async () => {
      const admin = await b.admin();
      const a = await make(admin, 'a');
      await reorder(admin, [a.id]).expect(200);
      const c = await make(admin, 'b');

      await reorder(admin, [a.id, c.id]).expect(200);

      expect(await priorities()).toEqual([
        ['a', 1],
        ['b', 2],
      ]);
    });

    it('refuses repeated ids (400 / 1106), unknown ids (400 / 1101) and a partial list (400 / 1107), changing nothing', async () => {
      const admin = await b.admin();
      const [a, c, d] = [await make(admin, 'a'), await make(admin, 'b'), await make(admin, 'c')];

      const repeated = await reorder(admin, [a.id, a.id, c.id]);
      const unknown = await reorder(admin, [a.id, c.id, 'zzzzzzzzzzzzzzzz']);
      const partial = await reorder(admin, [d.id, a.id]);

      expect(error(repeated)).toMatchObject({ status: 400, errorCode: 1106 });
      expect(error(unknown)).toMatchObject({ status: 400, errorCode: 1101, message: expect.stringContaining('zzzzzzzzzzzzzzzz') });
      expect(error(partial)).toMatchObject({ status: 400, errorCode: 1107 });
      expect(await priorities()).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
    });

    it('waits for the priority lock and then compares against the categories that exist by then (incomplete → 1107)', async () => {
      const admin = await b.admin();
      const [a, c] = [await make(admin, 'a'), await make(admin, 'b')];

      const res = await requestWhileAdvisoryLocked(
        t.dataSource,
        'categories_priority',
        () => reorder(admin, [c.id, a.id]),
        (runner) =>
          runner.query(
            `INSERT INTO categories (id, slug, title, description, priority, created_at, updated_at) VALUES ('inserted0000001', 'meanwhile', 'Meanwhile', '', 3, now(), now())`,
          ),
      );

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1107 });
      expect(await priorities()).toEqual([
        ['a', 1],
        ['b', 2],
        ['meanwhile', 3],
      ]);
    });

    it.each([
      ['no ids', undefined],
      ['an empty list', []],
      ['ids that are not an array', 'abc'],
      ['more than 500 ids', Array.from({ length: 501 }, (_, i) => `id-${String(i)}`)],
      ['an empty id', ['']],
      ['an id longer than 255 characters', ['x'.repeat(256)]],
      ['a non-string id', [5]],
    ])('rejects %s with a validation error (no errorCode)', async (_name, value) => {
      const res = await reorder(await b.admin(), value);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });

    it('rejects an unknown field with a validation error (no errorCode)', async () => {
      const admin = await b.admin();
      const a = await make(admin, 'a');

      const res = await t.api
        .patch('/api/admin/categories/reorder')
        .set(bearer(t, admin))
        .send({ ids: [a.id], extra: 1 });

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });
});
