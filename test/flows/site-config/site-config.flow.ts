import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';

/** Batch 22 (site-config): đọc công khai, danh sách key và cấu hình đã lưu, đặt và xoá cấu hình. */
describe('Flow: site config', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  type User = Awaited<ReturnType<Builders['user']>>;
  const rows = <R>(sql: string, params: unknown[] = []) => t.dataSource.query(sql, params) as Promise<R[]>;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const publicGet = (key?: string) => t.api.get('/api/site-config').query(key === undefined ? {} : { key });
  const adminList = (admin: User) => t.api.get('/api/admin/site-config').set(bearer(t, admin));
  const keys = (admin: User) => t.api.get('/api/admin/site-config/keys').set(bearer(t, admin));
  const put = (admin: User, key: string, value: unknown) =>
    t.api.put(`/api/admin/site-config/${key}`).set(bearer(t, admin)).send({ value });
  const remove = (admin: User, key: string) => t.api.delete(`/api/admin/site-config/${key}`).set(bearer(t, admin));
  const stored = () => rows<{ key: string; type: string; value: string }>('SELECT key, type, value FROM site_configs ORDER BY key');
  const BANNERS = JSON.stringify([{ image: 'https://cdn.flow.test/b1.jpg', title: 'Summer', href: '/shop' }]);

  describe('GET /api/admin/site-config/keys', () => {
    it('lists every key of the registry with its type, configured or not', async () => {
      const admin = await b.admin();
      await put(admin, 'SHOP_HERO_BANNERS', BANNERS).expect(200);

      const res = await keys(admin).expect(200);

      expect(res.body.data).toEqual([
        { key: 'SHOP_HERO_BANNERS', type: 'BANNER' },
        { key: 'NEW_IN_HERO_BANNERS', type: 'BANNER' },
        { key: 'COLLECTIONS_HERO_BANNERS', type: 'BANNER' },
        { key: 'NAV_MENU_BANNERS', type: 'BANNER' },
        { key: 'SHIPPING_CONFIG', type: 'SHIPPING' },
        { key: 'EXCHANGE_RATE', type: 'CURRENCY' },
      ]);
    });
  });

  describe('PUT /api/admin/site-config/:key', () => {
    it('creates a config with the type taken from the key, then replaces its value keeping the same row', async () => {
      const admin = await b.admin();

      const created = await put(admin, 'SHOP_HERO_BANNERS', BANNERS).expect(200);
      const replaced = await put(admin, 'SHOP_HERO_BANNERS', '[]').expect(200);

      expect(created.body.data).toMatchObject({
        id: expect.any(String),
        key: 'SHOP_HERO_BANNERS',
        type: 'BANNER',
        value: BANNERS,
        createdAt: expect.any(String),
      });
      expect(replaced.body.data).toMatchObject({ id: created.body.data.id, value: '[]' });
      expect(await stored()).toEqual([{ key: 'SHOP_HERO_BANNERS', type: 'BANNER', value: '[]' }]);
    });

    it('restores the type of the key when a stored row has another one', async () => {
      const admin = await b.admin();
      await put(admin, 'SHOP_HERO_BANNERS', BANNERS).expect(200);
      await rows(`UPDATE site_configs SET type = 'TEXT' WHERE key = 'SHOP_HERO_BANNERS'`);

      const res = await put(admin, 'SHOP_HERO_BANNERS', '[]').expect(200);

      expect(res.body.data.type).toBe('BANNER');
      expect(await stored()).toEqual([{ key: 'SHOP_HERO_BANNERS', type: 'BANNER', value: '[]' }]);
    });

    it('keeps any JSON object or array for a banner key, without checking its structure', async () => {
      const admin = await b.admin();

      for (const value of ['{"anything":true}', '[1,"two",{"three":3}]']) {
        await put(admin, 'NAV_MENU_BANNERS', value).expect(200);
        expect((await stored())[0].value).toBe(value);
      }
    });

    it('stores SHIPPING_CONFIG in the canonical form (methods in fixed order) with type SHIPPING', async () => {
      const admin = await b.admin();
      const method = (id: string, priceVnd: number, icon: string) => ({
        id,
        name: id,
        description: '',
        estimatedDays: '1 day',
        priceVnd,
        icon,
      });
      const value = JSON.stringify({
        freeShippingThresholdVnd: 2_000_000,
        methods: [method('store-pickup', 0, 'store'), method('express', 70_000, 'express'), method('standard', 40_000, 'truck')],
      });

      const res = await put(admin, 'SHIPPING_CONFIG', value).expect(200);

      const saved = JSON.parse(res.body.data.value);
      expect(res.body.data.type).toBe('SHIPPING');
      expect(saved.methods.map((m: { id: string }) => m.id)).toEqual(['standard', 'express', 'store-pickup']);
      expect(saved.returnPolicy).toMatchObject({ days: 30 });
      expect(JSON.parse((await stored())[0].value)).toEqual(saved);
    });

    it('stores EXCHANGE_RATE with type CURRENCY and the new rate applies to every USD amount at once', async () => {
      const [admin, product] = [await b.admin(), await b.product({ price: 350_000 })];
      expect((await t.api.get(`/api/products/${product.id}`).expect(200)).body.data.priceUsd).toBe(14);

      const res = await put(admin, 'EXCHANGE_RATE', JSON.stringify({ vndPerUsd: 26_000 })).expect(200);

      expect(res.body.data).toMatchObject({ type: 'CURRENCY', value: '{"vndPerUsd":26000}' });
      const detail = await t.api.get(`/api/products/${product.id}`).expect(200);
      expect(detail.body.data).toMatchObject({ priceVnd: 350_000, priceUsd: 13.46 });
    });

    it('answers 400 / 1502 for a key outside the registry and stores nothing', async () => {
      const res = await put(await b.admin(), 'UNKNOWN_KEY', '[]');

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1502 });
      expect(await stored()).toEqual([]);
    });

    it.each([
      ['a shipping config that is not an object', 'SHIPPING_CONFIG', '[]'],
      ['a shipping config without methods', 'SHIPPING_CONFIG', '{"freeShippingThresholdVnd":1000}'],
      [
        'a shipping config with the legacy `price` field',
        'SHIPPING_CONFIG',
        JSON.stringify({ freeShippingThresholdVnd: 1000, methods: [], legacy: 1 }),
      ],
      ['a shipping config with a fractional threshold', 'SHIPPING_CONFIG', JSON.stringify({ freeShippingThresholdVnd: 10.5, methods: [] })],
      ['an exchange rate of 0', 'EXCHANGE_RATE', '{"vndPerUsd":0}'],
      ['an exchange rate above 1.000.000', 'EXCHANGE_RATE', '{"vndPerUsd":1000001}'],
      ['an exchange rate with 3 decimals', 'EXCHANGE_RATE', '{"vndPerUsd":25000.123}'],
      ['an exchange rate with an extra field', 'EXCHANGE_RATE', '{"vndPerUsd":25000,"usdPerVnd":1}'],
    ])('answers 400 / 1503 for %s and keeps the stored value', async (_name, key, value) => {
      const admin = await b.admin();
      await put(admin, 'EXCHANGE_RATE', '{"vndPerUsd":25500}').expect(200);

      const res = await put(admin, key, value);

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1503, message: expect.stringContaining(`Invalid ${key}`) });
      expect(await stored()).toEqual([{ key: 'EXCHANGE_RATE', type: 'CURRENCY', value: '{"vndPerUsd":25500}' }]);
    });

    it.each([
      ['a missing value', undefined],
      ['an empty value', ''],
      ['a value that is not JSON', '{not json'],
      ['a JSON primitive (only objects and arrays are accepted)', '25000'],
      ['a JSON string', '"text"'],
      ['a value that is not a string', ['x']],
    ])('rejects %s with a validation error (no errorCode) and stores nothing', async (_name, value) => {
      const res = await put(await b.admin(), 'SHOP_HERO_BANNERS', value);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await stored()).toEqual([]);
    });

    it('rejects a body with a type or other unknown field with a validation error', async () => {
      const res = await t.api
        .put('/api/admin/site-config/SHOP_HERO_BANNERS')
        .set(bearer(t, await b.admin()))
        .send({ value: '[]', type: 'TEXT' });

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('GET /api/site-config', () => {
    it('returns the stored row for a key, with or without a token', async () => {
      const [admin, user] = [await b.admin(), await b.user()];
      await put(admin, 'SHOP_HERO_BANNERS', BANNERS).expect(200);

      const anonymous = await publicGet('SHOP_HERO_BANNERS').expect(200);
      const authed = await t.api.get('/api/site-config').query({ key: 'SHOP_HERO_BANNERS' }).set(bearer(t, user)).expect(200);

      expect(anonymous.body.data).toMatchObject({ key: 'SHOP_HERO_BANNERS', type: 'BANNER', value: BANNERS });
      expect(authed.body).toEqual(anonymous.body);
    });

    it('answers data: null for a key without a stored row', async () => {
      const res = await publicGet('NEW_IN_HERO_BANNERS').expect(200);

      expect(res.body).toEqual({ data: null });
    });

    it.each([
      ['a missing key', undefined],
      ['an empty key', ''],
      ['a key outside the registry', 'UNKNOWN_KEY'],
      ['a key in lower case', 'shop_hero_banners'],
    ])('rejects %s with a validation error (no errorCode)', async (_name, key) => {
      const res = await publicGet(key);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('GET /api/admin/site-config', () => {
    it('lists the stored configs sorted by key, without pagination, and is empty at first', async () => {
      const admin = await b.admin();
      expect((await adminList(admin).expect(200)).body).toEqual({ data: [], total: 0 });
      await put(admin, 'SHOP_HERO_BANNERS', BANNERS).expect(200);
      await put(admin, 'EXCHANGE_RATE', '{"vndPerUsd":26000}').expect(200);
      await put(admin, 'NAV_MENU_BANNERS', '[]').expect(200);

      const res = await adminList(admin).expect(200);

      expect(res.body.total).toBe(3);
      expect(res.body.data.map((row: { key: string }) => row.key)).toEqual(['EXCHANGE_RATE', 'NAV_MENU_BANNERS', 'SHOP_HERO_BANNERS']);
      expect(res.body.data[0]).toMatchObject({
        id: expect.any(String),
        type: 'CURRENCY',
        value: '{"vndPerUsd":26000}',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(res.body).not.toHaveProperty('page');
    });
  });

  describe('DELETE /api/admin/site-config/:key', () => {
    it('removes the stored row, after which the public read answers null', async () => {
      const admin = await b.admin();
      await put(admin, 'SHOP_HERO_BANNERS', BANNERS).expect(200);
      await put(admin, 'NAV_MENU_BANNERS', '[]').expect(200);

      const res = await remove(admin, 'SHOP_HERO_BANNERS').expect(200);

      expect(res.body).toEqual({ message: 'Site config deleted successfully' });
      expect((await publicGet('SHOP_HERO_BANNERS').expect(200)).body).toEqual({ data: null });
      expect(await stored()).toEqual([{ key: 'NAV_MENU_BANNERS', type: 'BANNER', value: '[]' }]);
    });

    it('falls back to the defaults when the exchange rate row is deleted', async () => {
      const [admin, product] = [await b.admin(), await b.product({ price: 350_000 })];
      await put(admin, 'EXCHANGE_RATE', '{"vndPerUsd":50000}').expect(200);
      expect((await t.api.get(`/api/products/${product.id}`).expect(200)).body.data.priceUsd).toBe(7);

      await remove(admin, 'EXCHANGE_RATE').expect(200);

      expect((await t.api.get(`/api/products/${product.id}`).expect(200)).body.data.priceUsd).toBe(14);
    });

    it('answers 400 / 1501 for a key without a row, a key outside the registry and a second delete', async () => {
      const admin = await b.admin();
      await put(admin, 'SHOP_HERO_BANNERS', BANNERS).expect(200);
      await remove(admin, 'SHOP_HERO_BANNERS').expect(200);

      const again = await remove(admin, 'SHOP_HERO_BANNERS');
      const unconfigured = await remove(admin, 'NEW_IN_HERO_BANNERS');
      const unknown = await remove(admin, 'UNKNOWN_KEY');

      for (const res of [again, unconfigured, unknown]) expect(error(res)).toMatchObject({ status: 400, errorCode: 1501 });
    });
  });
});
