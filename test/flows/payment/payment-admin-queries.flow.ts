import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { createQr, placeAndPayOrder, placeOrder } from '../order-payment/steps';

/** Batch 01 (payment): phía admin — tra cứu phiên thanh toán và toàn cảnh thanh toán của một đơn. */
describe('Flow: admin payment queries (attempts and order overview)', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  const expire = (orderId: string) =>
    t.dataSource.query(`UPDATE payment_attempts SET expires_at = now() - interval '1 minute' WHERE order_id = $1`, [orderId]);

  /** Bốn đơn, mỗi đơn một kết cục: chờ trả, đã trả, hết hạn, đã huỷ */
  async function seed() {
    const pending = await placeOrder(t, b);
    const pendingQr = await createQr(t, pending.customer, pending.order.id);
    const paid = await placeAndPayOrder(t, b);
    const expired = await placeOrder(t, b);
    const expiredQr = await createQr(t, expired.customer, expired.order.id);
    await expire(expired.order.id);
    const cancelled = await placeOrder(t, b);
    const cancelledQr = await createQr(t, cancelled.customer, cancelled.order.id);
    await t.api.patch(`/api/orders/${cancelled.order.id}/cancel`).set(bearer(t, cancelled.customer)).expect(200);
    return {
      pending: { ...pending, qr: pendingQr },
      paid,
      expired: { ...expired, qr: expiredQr },
      cancelled: { ...cancelled, qr: cancelledQr },
    };
  }
  const attempts = async (query: object = {}) => {
    const admin = await b.admin();
    return t.api.get('/api/admin/payments/attempts').query(query).set(bearer(t, admin));
  };
  const ok = async (query: object = {}) => {
    const res = await attempts(query);
    expect(res.status).toBe(200);
    return res;
  };
  const orderIds = (res: { body: { data: { order: { id: string } }[] } }) => res.body.data.map((row) => row.order.id);

  describe('GET /api/admin/payments/attempts', () => {
    it('lists every issued code with its order, customer and bound transactions', async () => {
      const { paid } = await seed();

      const res = await ok();

      expect(res.body).toMatchObject({ total: 4, page: 1, limit: 25, totalPages: 1 });
      const row = res.body.data.find((item: { order: { id: string } }) => item.order.id === paid.order.id);
      expect(row).toMatchObject({
        transferCode: paid.qr.transferContent,
        status: 'PAID',
        amountVnd: 730_000,
        amountUsd: expect.any(Number),
        order: {
          id: paid.order.id,
          status: 'confirmed',
          paymentStatus: 'paid',
          totalVnd: 730_000,
          customer: { fullName: paid.customer.name, phone: '0900000000' },
        },
      });
      expect(row.transactions).toEqual([expect.objectContaining({ provider: 'sepay', verificationStatus: 'MATCHED', amountVnd: 730_000 })]);
      expect(JSON.stringify(res.body)).not.toContain('raw');
      expect(JSON.stringify(res.body)).not.toContain('0123456789');
    });

    it.each([
      ['PENDING', 'pending'],
      ['PAID', 'paid'],
      ['EXPIRED', 'expired'],
      ['CANCELLED', 'cancelled'],
    ] as const)('filters by the effective status %s', async (status, key) => {
      const data = await seed();

      const res = await ok({ status });

      expect(orderIds(res)).toEqual([data[key].order.id]);
    });

    it('filters by order id and searches by transfer code, phone and customer name', async () => {
      const { pending, paid } = await seed();

      expect(orderIds(await ok({ orderId: paid.order.id }))).toEqual([paid.order.id]);
      expect(orderIds(await ok({ search: pending.qr.transferContent.toLowerCase() }))).toEqual([pending.order.id]);
      expect(orderIds(await ok({ search: paid.customer.name }))).toEqual([paid.order.id]);
      expect((await ok({ search: '0900000000' })).body.total).toBe(4);
      expect((await ok({ search: 'no-such-thing' })).body.total).toBe(0);
    });

    it('sorts by amount and createdAt and paginates', async () => {
      await seed();

      const newestFirst = await ok({});
      const oldestFirst = await ok({ sort: 'createdAt' });
      expect(orderIds(oldestFirst)).toEqual([...orderIds(newestFirst)].reverse());

      const byAmount = await ok({ sort: '-amount' });
      const amounts = byAmount.body.data.map((row: { amountVnd: number }) => row.amountVnd);
      expect(amounts).toEqual([...amounts].sort((x: number, y: number) => y - x));

      const page = await ok({ limit: 3, page: 2 });
      expect(page.body).toMatchObject({ total: 4, page: 2, limit: 3, totalPages: 2 });
      expect(page.body.data).toHaveLength(1);
    });

    it.each([
      ['an unknown status', { status: 'DONE' }],
      ['a sort field outside the whitelist', { sort: '-transferCode' }],
      ['a limit above 200', { limit: 201 }],
      ['an orderId longer than 16 characters', { orderId: 'x'.repeat(17) }],
      ['an unknown query parameter', { sorts: 'createdAt' }],
    ])('rejects %s with 400 (validation, no errorCode)', async (_name, query) => {
      const res = await attempts(query);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBeUndefined();
    });
  });

  describe('GET /api/admin/payments/orders/:orderId', () => {
    it('shows the order, its sessions newest first with effective statuses, and the bound transactions', async () => {
      const admin = await b.admin();
      const { customer, order } = await placeOrder(t, b);
      const first = await createQr(t, customer, order.id);
      await expire(order.id);
      const second = await createQr(t, customer, order.id);

      const res = await t.api.get(`/api/admin/payments/orders/${order.id}`).set(bearer(t, admin)).expect(200);

      expect(res.body.data.order).toMatchObject({
        id: order.id,
        status: 'pending',
        paymentStatus: 'unpaid',
        paidAt: null,
        subtotalVnd: 700_000,
        shippingFeeVnd: 30_000,
        totalVnd: 730_000,
        totalUsd: expect.any(Number),
        shippingMethod: 'standard',
        customer: { fullName: customer.name, phone: '0900000000' },
      });
      expect(res.body.data.attempts.map((a: { transferCode: string; status: string }) => [a.transferCode, a.status])).toEqual([
        [second.transferContent, 'PENDING'],
        [first.transferContent, 'EXPIRED'],
      ]);
      expect(res.body.data.transactions).toEqual([]);
    });

    it('includes the matched transaction of a paid order with amounts in both currencies', async () => {
      const admin = await b.admin();
      const { order } = await placeAndPayOrder(t, b);

      const res = await t.api.get(`/api/admin/payments/orders/${order.id}`).set(bearer(t, admin)).expect(200);

      expect(res.body.data.order).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', paidAt: expect.any(String) });
      expect(res.body.data.attempts).toEqual([
        expect.objectContaining({ status: 'PAID', amountVnd: 730_000, amountUsd: expect.any(Number) }),
      ]);
      expect(res.body.data.transactions).toEqual([
        expect.objectContaining({ verificationStatus: 'MATCHED', amountVnd: 730_000, amountUsd: expect.any(Number) }),
      ]);
    });

    it('answers 404 / 1301 for an unknown order', async () => {
      const admin = await b.admin();

      const res = await t.api.get('/api/admin/payments/orders/zzzzzzzzzzzzzzzz').set(bearer(t, admin));

      expect({ status: res.status, errorCode: res.body.errorCode }).toEqual({ status: 404, errorCode: 1301 });
    });
  });
});
