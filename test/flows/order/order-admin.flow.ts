import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';

/** Batch 05 (order, admin): danh sách (validation, sắp xếp, tìm kiếm, phân trang), chi tiết và trạng thái. */
describe('Flow: admin orders (list, detail, status)', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  type Customer = Awaited<ReturnType<Builders['user']>>;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  /** Một đơn của `customer`: quantity × 350.000đ + 30.000đ ship */
  async function orderFor(customer: Customer, quantity: number, over: { fullName?: string } = {}) {
    await b.cart(customer, [{ product: await b.product({ price: 350_000 }), quantity }]);
    const address = await b.address(customer, over.fullName ? { fullName: over.fullName } : {});
    return (await t.api.post('/api/orders').set(bearer(t, customer)).send({ addressId: address.id }).expect(201)).body.data.id as string;
  }
  const list = async (query: object = {}) =>
    t.api
      .get('/api/admin/orders')
      .query(query)
      .set(bearer(t, await b.admin()));
  const ids = (res: { body: { data: { id: string }[] } }) => res.body.data.map((order) => order.id);

  describe('GET /api/admin/orders', () => {
    it('sorts by total in both directions and by creation time, and paginates beyond the last page', async () => {
      const customer = await b.user();
      const [small, medium, large] = [await orderFor(customer, 1), await orderFor(customer, 2), await orderFor(customer, 4)];

      expect(ids(await list({ sort: 'total' }))).toEqual([small, medium, large]);
      expect(ids(await list({ sort: '-total' }))).toEqual([large, medium, small]);
      expect(ids(await list({ sort: 'createdAt' }))).toEqual([small, medium, large]);
      const beyond = await list({ limit: 2, page: 5 });
      expect(beyond.status).toBe(200);
      expect(beyond.body).toMatchObject({ data: [], total: 3, page: 5, limit: 2, totalPages: 2 });
    });

    it('searches by a part of the order id and by the customer name, case-insensitively', async () => {
      const [alice, bob] = [await b.user(), await b.user()];
      const aliceOrder = await orderFor(alice, 1, { fullName: 'Alice Nguyen' });
      const bobOrder = await orderFor(bob, 1, { fullName: 'Bob Tran' });

      expect(ids(await list({ search: aliceOrder.slice(2, 10).toLowerCase() }))).toEqual([aliceOrder]);
      expect(ids(await list({ search: 'bob tr' }))).toEqual([bobOrder]);
      expect((await list({ search: 'nobody' })).body.total).toBe(0);
    });

    it('returns each order with its lines, the current product and money in both currencies', async () => {
      const customer = await b.user();
      await orderFor(customer, 2);

      const res = await list();

      expect(res.body.data[0]).toMatchObject({
        status: 'pending',
        paymentStatus: 'unpaid',
        userId: customer.id,
        subtotalVnd: 700_000,
        subtotalUsd: 28,
        totalVnd: 730_000,
        totalUsd: 29.2,
        exchangeRate: 25_000,
      });
      expect(res.body.data[0].items[0]).toMatchObject({
        quantity: 2,
        priceVnd: 350_000,
        product: { name: expect.any(String), category: expect.anything(), subcategory: expect.anything() },
      });
    });

    it.each([
      ['an unknown status', { status: 'teleported' }],
      ['an unknown payment status', { paymentStatus: 'free' }],
      ['a sort field outside the whitelist', { sort: 'status' }],
      ['a needsAction value that is not true/false', { needsAction: 'maybe' }],
      ['a userId longer than 16 characters', { userId: 'x'.repeat(17) }],
      ['a limit above 200', { limit: 201 }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const res = await list(query);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('GET /api/admin/orders/:orderId', () => {
    it('shows any customer’s order in full', async () => {
      const customer = await b.user();
      const id = await orderFor(customer, 3, { fullName: 'Le Van C' });
      const admin = await b.admin();

      const res = await t.api.get(`/api/admin/orders/${id}`).set(bearer(t, admin)).expect(200);

      expect(res.body.data).toMatchObject({
        id,
        userId: customer.id,
        status: 'pending',
        totalVnd: 1_080_000,
        shippingAddress: { fullName: 'Le Van C' },
      });
      expect(res.body.data.items).toHaveLength(1);
    });

    it('answers an unknown order with 400 / 1301 (admin routes do not pass 404 today)', async () => {
      const admin = await b.admin();

      const res = await t.api.get('/api/admin/orders/zzzzzzzzzzzzzzzz').set(bearer(t, admin));

      expect(error(res)).toEqual({ status: 400, errorCode: 1301, message: 'Order not found' });
    });
  });

  describe('PATCH /api/admin/orders/:orderId/status', () => {
    it('rejects bodies without a valid status or with extra fields, leaving the order untouched', async () => {
      const admin = await b.admin();
      const id = await orderFor(await b.user(), 1);

      for (const body of [{}, { status: '' }, { status: 123 }, { status: 'confirmed', note: 'x' }]) {
        const res = await t.api.patch(`/api/admin/orders/${id}/status`).set(bearer(t, admin)).send(body);
        expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      }
      expect((await t.api.get(`/api/admin/orders/${id}`).set(bearer(t, admin)).expect(200)).body.data.status).toBe('pending');
    });
  });
});
