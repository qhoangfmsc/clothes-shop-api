import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { createQr, placeAndPayOrder } from './steps';

type Customer = Awaited<ReturnType<Builders['user']>>;

describe('Flow: order queries (customer and admin)', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  /** Một đơn 350.000đ cho `customer` (dùng lại giỏ của khách), giao tiêu chuẩn tới địa chỉ có `phone` */
  async function orderFor(customer: Customer, phone?: string) {
    await b.cart(customer, [{ product: await b.product() }]);
    const address = await b.address(customer, phone ? { phone } : {});
    const res = await t.api.post('/api/orders').set(bearer(t, customer)).send({ addressId: address.id }).expect(201);
    return res.body.data.id as string;
  }
  const ids = (res: { body: { data: { id: string }[] } }) => res.body.data.map((order) => order.id);

  it('lists only my orders, newest first, with status filter, ascending sort and pagination', async () => {
    const [me, other] = [await b.user(), await b.user()];
    const admin = await b.admin();
    const [o1, o2, o3] = [await orderFor(me), await orderFor(me), await orderFor(me)];
    await orderFor(other);
    await t.api.patch(`/api/admin/orders/${o2}/status`).set(bearer(t, admin)).send({ status: 'confirmed' }).expect(200);
    const get = (query: object) => t.api.get('/api/orders').query(query).set(bearer(t, me)).expect(200);

    const all = await get({});
    expect(ids(all)).toEqual([o3, o2, o1]);
    expect(all.body).toMatchObject({ total: 3, page: 1, limit: 25, totalPages: 1 });
    expect(all.body.data[0]).toMatchObject({ totalVnd: 380_000, totalUsd: expect.any(Number), paymentStatus: 'unpaid' });
    expect(all.body.data[0].items).toHaveLength(1);

    expect(ids(await get({ status: 'confirmed' }))).toEqual([o2]);
    expect(ids(await get({ sort: 'createdAt' }))).toEqual([o1, o2, o3]);
    const page2 = await get({ limit: 2, page: 2 });
    expect(ids(page2)).toEqual([o1]);
    expect(page2.body).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });
  });

  it('shows an order with its payment sessions and refunds', async () => {
    const customer = await b.user();
    const id = await orderFor(customer);

    const before = await t.api.get(`/api/orders/${id}`).set(bearer(t, customer)).expect(200);
    expect(before.body.data).toMatchObject({ id, status: 'pending', totalVnd: 380_000, paymentAttempts: [], refunds: [] });

    const qr = await createQr(t, customer, id);
    const after = await t.api.get(`/api/orders/${id}`).set(bearer(t, customer)).expect(200);
    expect(after.body.data.paymentAttempts).toEqual([
      expect.objectContaining({ transferCode: qr.transferContent, amountVnd: 380_000, amountUsd: expect.any(Number), status: 'PENDING' }),
    ]);
  });

  describe('admin', () => {
    async function seed() {
      const [u1, u2] = [await b.user(), await b.user()];
      const o1 = await orderFor(u1, '0911000111'); // pending, chưa có QR → cần admin
      const paid = await placeAndPayOrder(t, b); // confirmed + paid → cần admin
      const o3 = await orderFor(u1); // pending + QR còn hạn → chưa cần admin
      const qr = await createQr(t, u1, o3);
      return { u1, u2, o1, o2: paid.order.id, o3, qr };
    }
    const list = async (query: object) => {
      const admin = await b.admin();
      return t.api.get('/api/admin/orders').query(query).set(bearer(t, admin)).expect(200);
    };

    it('lists every order and filters by status, payment status, user, search text and needsAction', async () => {
      const { u1, o1, o2, o3, qr } = await seed();

      expect((await list({})).body.total).toBe(3);
      expect(ids(await list({ status: 'confirmed' }))).toEqual([o2]);
      expect(ids(await list({ paymentStatus: 'paid' }))).toEqual([o2]);
      expect(ids(await list({ userId: u1.id })).sort()).toEqual([o1, o3].sort());
      expect(ids(await list({ search: '0911000111' }))).toEqual([o1]);
      expect(ids(await list({ search: qr.transferContent }))).toEqual([o3]);
      expect(ids(await list({ needsAction: true })).sort()).toEqual([o1, o2].sort());
    });

    it('shows one order in full and counts the orders that need action like the list does', async () => {
      const { o2 } = await seed();
      const admin = await b.admin();

      const detail = await t.api.get(`/api/admin/orders/${o2}`).set(bearer(t, admin)).expect(200);
      expect(detail.body.data).toMatchObject({ id: o2, status: 'confirmed', paymentStatus: 'paid', totalVnd: 730_000 });
      expect(detail.body.data.items).toHaveLength(1);

      const counts = await t.api.get('/api/admin/pending-counts').set(bearer(t, admin)).expect(200);
      expect(counts.body.data.orders).toBe((await list({ needsAction: true })).body.total);
      expect(counts.body.data.orders).toBe(2);
    });
  });
});
