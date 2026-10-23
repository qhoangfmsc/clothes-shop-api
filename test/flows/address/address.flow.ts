import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';

/** Batch 18 (address): danh sách, tạo, sửa, xoá địa chỉ của chính mình. Mã 2101 còn được ghim ở `address-errors.flow.ts`. */
describe('Flow: addresses', () => {
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
  const list = (user: User) => t.api.get('/api/addresses').set(bearer(t, user));
  const create = (user: User, body: object) => t.api.post('/api/addresses').set(bearer(t, user)).send(body);
  const update = (user: User, id: string, body: object) => t.api.patch(`/api/addresses/${id}`).set(bearer(t, user)).send(body);
  const remove = (user: User, id: string) => t.api.delete(`/api/addresses/${id}`).set(bearer(t, user));
  const valid = (overrides: object = {}) => ({
    fullName: 'Nguyễn Văn A',
    phone: '0901234567',
    addressLine1: '12 Lê Lợi',
    city: 'Hồ Chí Minh',
    ...overrides,
  });
  const defaults = () => rows<{ label: string; is_default: boolean }>('SELECT label, is_default FROM addresses ORDER BY label');
  const day = (offset: number) => new Date(Date.UTC(2026, 9, 1 + offset, 12));

  describe('GET /api/addresses', () => {
    it('lists only my addresses, default first and then newest first, without pagination', async () => {
      const [me, other] = [await b.user(), await b.user()];
      const [old, recent, preferred] = [
        await b.address(me, { label: 'old', isDefault: false, createdAt: day(1) }),
        await b.address(me, { label: 'recent', isDefault: false, createdAt: day(3) }),
        await b.address(me, { label: 'preferred', isDefault: true, createdAt: day(2) }),
      ];
      await b.address(other, { label: 'theirs' });

      const res = await list(me).expect(200);

      expect(res.body.data.map((a: { id: string }) => a.id)).toEqual([preferred.id, recent.id, old.id]);
      expect(res.body.total).toBe(3);
      expect(res.body).not.toHaveProperty('page');
      expect(res.body.data[0]).toMatchObject({
        id: preferred.id,
        userId: me.id,
        label: 'preferred',
        fullName: me.name,
        phone: '0900000000',
        addressLine1: '1 Test Street',
        city: 'Ho Chi Minh',
        isDefault: true,
      });
    });

    it('is empty for a user without addresses', async () => {
      const res = await list(await b.user()).expect(200);

      expect(res.body).toEqual({ data: [], total: 0 });
    });
  });

  describe('POST /api/addresses', () => {
    it('creates an address for me with the defaults for the optional fields', async () => {
      const me = await b.user();

      const res = await create(me, valid()).expect(201);

      expect(res.body.data).toMatchObject({
        id: expect.any(String),
        userId: me.id,
        fullName: 'Nguyễn Văn A',
        phone: '0901234567',
        addressLine1: '12 Lê Lợi',
        city: 'Hồ Chí Minh',
        label: '',
        addressLine2: '',
        province: '',
        postalCode: '',
        country: 'Vietnam',
        isDefault: false,
      });
      expect(await rows('SELECT user_id, country, is_default FROM addresses')).toEqual([
        { user_id: me.id, country: 'Vietnam', is_default: false },
      ]);
    });

    it('stores every optional field when sent', async () => {
      const me = await b.user();

      const res = await create(
        me,
        valid({ label: 'Nhà', addressLine2: 'Tầng 3', province: 'Bình Thạnh', postalCode: '700000', country: 'Việt Nam', isDefault: true }),
      ).expect(201);

      expect(res.body.data).toMatchObject({
        label: 'Nhà',
        addressLine2: 'Tầng 3',
        province: 'Bình Thạnh',
        postalCode: '700000',
        country: 'Việt Nam',
        isDefault: true,
      });
    });

    it('makes the new default replace the previous one, only among my own addresses', async () => {
      const [me, other] = [await b.user(), await b.user()];
      await create(me, valid({ label: 'a', isDefault: true })).expect(201);
      await b.address(other, { label: 'theirs', isDefault: true });

      await create(me, valid({ label: 'b', isDefault: true })).expect(201);
      await create(me, valid({ label: 'c' })).expect(201);

      expect(await defaults()).toEqual([
        { label: 'a', is_default: false },
        { label: 'b', is_default: true },
        { label: 'c', is_default: false },
        { label: 'theirs', is_default: true },
      ]);
    });

    it.each([
      ['a missing fullName', { phone: '0901234567', addressLine1: 'x', city: 'y' }],
      ['an empty fullName', { fullName: '', phone: '0901234567', addressLine1: 'x', city: 'y' }],
      ['a fullName longer than 255 characters', { fullName: 'x'.repeat(256), phone: '0901234567', addressLine1: 'x', city: 'y' }],
      ['a missing phone', { fullName: 'A', addressLine1: 'x', city: 'y' }],
      ['an empty phone', { fullName: 'A', phone: '', addressLine1: 'x', city: 'y' }],
      ['a phone longer than 50 characters', { fullName: 'A', phone: '1'.repeat(51), addressLine1: 'x', city: 'y' }],
      ['a missing addressLine1', { fullName: 'A', phone: '1', city: 'y' }],
      ['an addressLine1 longer than 500 characters', { fullName: 'A', phone: '1', addressLine1: 'x'.repeat(501), city: 'y' }],
      ['a missing city', { fullName: 'A', phone: '1', addressLine1: 'x' }],
      ['an empty city', { fullName: 'A', phone: '1', addressLine1: 'x', city: '' }],
      ['a label longer than 100 characters', { fullName: 'A', phone: '1', addressLine1: 'x', city: 'y', label: 'x'.repeat(101) }],
      [
        'an addressLine2 longer than 500 characters',
        { fullName: 'A', phone: '1', addressLine1: 'x', city: 'y', addressLine2: 'x'.repeat(501) },
      ],
      ['a province longer than 255 characters', { fullName: 'A', phone: '1', addressLine1: 'x', city: 'y', province: 'x'.repeat(256) }],
      ['a postal code longer than 20 characters', { fullName: 'A', phone: '1', addressLine1: 'x', city: 'y', postalCode: '1'.repeat(21) }],
      ['a country longer than 100 characters', { fullName: 'A', phone: '1', addressLine1: 'x', city: 'y', country: 'x'.repeat(101) }],
      ['a non-boolean isDefault', { fullName: 'A', phone: '1', addressLine1: 'x', city: 'y', isDefault: 'yes' }],
      ['a userId (not accepted)', { fullName: 'A', phone: '1', addressLine1: 'x', city: 'y', userId: 'someone-else' }],
      ['an unknown field', { fullName: 'A', phone: '1', addressLine1: 'x', city: 'y', id: 'custom' }],
    ])('rejects %s with a validation error (no errorCode) and creates nothing', async (_name, body) => {
      const res = await create(await b.user(), body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await rows('SELECT 1 FROM addresses')).toHaveLength(0);
    });
  });

  describe('PATCH /api/addresses/:id', () => {
    it('changes only the fields sent in the database', async () => {
      const me = await b.user();
      const address = await b.address(me, { label: 'Nhà', city: 'Hà Nội' });

      const res = await update(me, address.id, { phone: '0912345678', addressLine2: 'Tầng 5' }).expect(200);

      expect(res.body.data).toMatchObject({ id: address.id, phone: '0912345678', addressLine2: 'Tầng 5' });
      expect(await rows('SELECT label, city, phone, address_line_2, full_name FROM addresses')).toEqual([
        { label: 'Nhà', city: 'Hà Nội', phone: '0912345678', address_line_2: 'Tầng 5', full_name: me.name },
      ]);
    });

    it('accepts an empty body as no change', async () => {
      const me = await b.user();
      const address = await b.address(me, { label: 'Nhà' });

      await update(me, address.id, {}).expect(200);

      expect(await rows('SELECT label FROM addresses')).toEqual([{ label: 'Nhà' }]);
    });

    it('makes it the only default among my addresses and leaves other users’ defaults alone', async () => {
      const [me, other] = [await b.user(), await b.user()];
      const [a, c] = [await b.address(me, { label: 'a', isDefault: true }), await b.address(me, { label: 'c', isDefault: false })];
      await b.address(other, { label: 'theirs', isDefault: true });

      await update(me, c.id, { isDefault: true }).expect(200);

      expect(await defaults()).toEqual([
        { label: 'a', is_default: false },
        { label: 'c', is_default: true },
        { label: 'theirs', is_default: true },
      ]);
      await update(me, c.id, { isDefault: false }).expect(200);
      expect((await defaults()).filter((row) => row.is_default).map((row) => row.label)).toEqual(['theirs']);
      expect(a.id).not.toBe(c.id);
    });

    it('answers 404 / 2101 for an unknown address and for another user’s address, which stays unchanged', async () => {
      const [me, other] = [await b.user(), await b.user()];
      const theirs = await b.address(other, { label: 'Của họ' });

      const foreign = await update(me, theirs.id, { label: 'Chiếm' });
      const unknown = await update(me, 'zzzzzzzzzzzzzzzz', { label: 'x' });

      expect(error(foreign)).toMatchObject({ status: 404, errorCode: 2101 });
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 2101 });
      expect(await rows('SELECT label FROM addresses')).toEqual([{ label: 'Của họ' }]);
    });

    it.each([
      ['a fullName longer than 255 characters', { fullName: 'x'.repeat(256) }],
      ['a phone longer than 50 characters', { phone: '1'.repeat(51) }],
      ['an addressLine1 longer than 500 characters', { addressLine1: 'x'.repeat(501) }],
      ['a city longer than 255 characters', { city: 'x'.repeat(256) }],
      ['a postal code longer than 20 characters', { postalCode: '1'.repeat(21) }],
      ['a non-boolean isDefault', { isDefault: 'yes' }],
      ['a non-string label', { label: 5 }],
      ['a userId (not accepted)', { userId: 'someone-else' }],
      ['an unknown field', { id: 'other' }],
    ])('rejects %s with a validation error (no errorCode) and changes nothing', async (_name, body) => {
      const me = await b.user();
      const address = await b.address(me, { label: 'Nhà' });

      const res = await update(me, address.id, body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await rows('SELECT label, user_id FROM addresses')).toEqual([{ label: 'Nhà', user_id: me.id }]);
    });
  });

  describe('DELETE /api/addresses/:id', () => {
    it('deletes my address, keeps the others, and does not pick a new default', async () => {
      const [me, other] = [await b.user(), await b.user()];
      const [preferred] = [
        await b.address(me, { label: 'preferred', isDefault: true }),
        await b.address(me, { label: 'spare', isDefault: false }),
      ];
      await b.address(other, { label: 'theirs' });

      const res = await remove(me, preferred.id).expect(200);

      expect(res.body).toEqual({ success: true });
      expect(await defaults()).toEqual([
        { label: 'spare', is_default: false },
        { label: 'theirs', is_default: true },
      ]);
      expect((await list(me).expect(200)).body.total).toBe(1);
    });

    it('does not change orders already placed with that address', async () => {
      const me = await b.user();
      const product = await b.product();
      await b.cart(me, [{ product }]);
      const address = await b.address(me);
      const order = await t.api.post('/api/orders').set(bearer(t, me)).send({ addressId: address.id }).expect(201);

      await remove(me, address.id).expect(200);

      const detail = await t.api.get(`/api/orders/${order.body.data.id}`).set(bearer(t, me)).expect(200);
      expect(detail.body.data.shippingAddress).toMatchObject({ fullName: me.name, city: 'Ho Chi Minh' });
    });

    it('answers 404 / 2101 for an unknown address, another user’s address and a second delete', async () => {
      const [me, other] = [await b.user(), await b.user()];
      const [mine, theirs] = [await b.address(me), await b.address(other)];
      await remove(me, mine.id).expect(200);

      const again = await remove(me, mine.id);
      const foreign = await remove(me, theirs.id);
      const unknown = await remove(me, 'zzzzzzzzzzzzzzzz');

      for (const res of [again, foreign, unknown]) expect(error(res)).toMatchObject({ status: 404, errorCode: 2101 });
      expect(await rows('SELECT user_id FROM addresses')).toEqual([{ user_id: other.id }]);
    });
  });
});
