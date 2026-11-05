import { type Builders, bearer, createBuilders, createTestApp, sepayWebhook, type TestApp, truncateAll } from '../../support';
import { createQr, placeAndPayOrder, placeOrder } from '../order-payment/steps';

/** Batch 02 (payment): danh sách giao dịch ngân hàng, danh sách yêu cầu hoàn tiền và tạo yêu cầu hoàn thủ công. */
describe('Flow: bank transactions and refund requests (admin)', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  type Admin = Awaited<ReturnType<Builders['admin']>>;
  const rows = <R>(sql: string, params: unknown[] = []) => t.dataSource.query(sql, params) as Promise<R[]>;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const expire = (orderId: string) =>
    t.dataSource.query(`UPDATE payment_attempts SET expires_at = now() - interval '1 minute' WHERE order_id = $1`, [orderId]);
  const transfer = (content: string, amount: number, over: { transferType?: 'in' | 'out' } = {}) => {
    const hook = sepayWebhook({ id: `bank-${Math.random().toString(36).slice(2, 10)}`, amount, content, ...over });
    return t.api.post('/api/webhooks/sepay').set(hook.headers).send(hook.body).expect(200);
  };
  const ids = (res: { body: { data: { id: string }[] } }) => res.body.data.map((row) => row.id);

  describe('GET /api/admin/payments/transactions', () => {
    /** Năm giao dịch, mỗi giao dịch một kết quả đối soát */
    async function seed() {
      const admin = await b.admin();
      const paid = await placeAndPayOrder(t, b);
      const mismatch = await placeOrder(t, b);
      const mismatchQr = await createQr(t, mismatch.customer, mismatch.order.id);
      await transfer(`chuyen khoan ${mismatchQr.transferContent}`, 1_000);
      const late = await placeOrder(t, b);
      const lateQr = await createQr(t, late.customer, late.order.id);
      await expire(late.order.id);
      await transfer(`chuyen khoan ${lateQr.transferContent}`, 730_000);
      await transfer('tien an trua', 50_000);
      await transfer('rut tien mat', 2_000, { transferType: 'out' });
      return { admin, paid, mismatch, mismatchQr, late };
    }
    const list = (admin: Admin, query: object = {}) => t.api.get('/api/admin/payments/transactions').query(query).set(bearer(t, admin));
    const statuses = (res: { body: { data: { verificationStatus: string }[] } }) =>
      res.body.data.map((row) => row.verificationStatus).sort();

    it('lists every transaction with the matched session and order, and null for unmatched money', async () => {
      const { admin, paid } = await seed();

      const res = await list(admin).expect(200);

      expect(res.body).toMatchObject({ total: 5, page: 1, limit: 25, totalPages: 1 });
      expect(statuses(res)).toEqual(['AMOUNT_MISMATCH', 'IGNORED', 'LATE', 'MATCHED', 'UNMATCHED']);
      const matched = res.body.data.find((row: { verificationStatus: string }) => row.verificationStatus === 'MATCHED');
      expect(matched).toMatchObject({
        provider: 'sepay',
        amountVnd: 730_000,
        amountUsd: expect.any(Number),
        paymentAttempt: {
          transferCode: paid.qr.transferContent,
          amountVnd: 730_000,
          order: { id: paid.order.id, status: 'confirmed', paymentStatus: 'paid', totalVnd: 730_000, totalUsd: expect.any(Number) },
        },
      });
      const unmatched = res.body.data.find((row: { verificationStatus: string }) => row.verificationStatus === 'UNMATCHED');
      expect(unmatched.paymentAttempt).toBeNull();
    });

    it('keeps the original bank payload and the receiving account for reconciliation, which the sessions list deliberately leaves out', async () => {
      const admin = await b.admin();
      const paid = await placeAndPayOrder(t, b);

      const transactions = await list(admin).expect(200);
      const attempts = await t.api.get('/api/admin/payments/attempts').set(bearer(t, admin)).expect(200);

      const row = transactions.body.data[0];
      expect(row.rawPayload).toMatchObject({
        accountNumber: expect.any(String),
        content: expect.stringContaining(paid.qr.transferContent),
      });
      expect(row.paymentAttempt.bankAccount).toEqual(expect.any(String));
      expect(JSON.stringify(attempts.body)).not.toContain('rawPayload');
      expect(attempts.body.data[0]).not.toHaveProperty('bankAccount');
    });

    it('filters by verification status, order id and search text', async () => {
      const { admin, paid, mismatchQr } = await seed();

      expect(statuses(await list(admin, { verificationStatus: 'LATE' }).expect(200))).toEqual(['LATE']);
      expect(statuses(await list(admin, { orderId: paid.order.id }).expect(200))).toEqual(['MATCHED']);
      expect(statuses(await list(admin, { search: mismatchQr.transferContent.toLowerCase() }).expect(200))).toEqual(['AMOUNT_MISMATCH']);
      expect(statuses(await list(admin, { search: 'tien an' }).expect(200))).toEqual(['UNMATCHED']);
      expect((await list(admin, { search: 'no-such-text' }).expect(200)).body.total).toBe(0);
    });

    it('needsReview keeps only money an admin must handle, and drops it once the order is cancelled', async () => {
      const { admin, mismatch } = await seed();

      const before = await list(admin, { needsReview: true }).expect(200);
      expect(statuses(before)).toEqual(['AMOUNT_MISMATCH', 'LATE', 'UNMATCHED']);

      await t.api.patch(`/api/orders/${mismatch.order.id}/cancel`).set(bearer(t, mismatch.customer)).expect(200);
      const after = await list(admin, { needsReview: true }).expect(200);
      expect(statuses(after)).toEqual(['LATE', 'UNMATCHED']);
      expect((await list(admin, { needsReview: false }).expect(200)).body.total).toBe(5);
    });

    it('sorts by amount and receivedAt and paginates', async () => {
      const { admin } = await seed();

      const byAmount = await list(admin, { sort: '-amount' }).expect(200);
      const amounts = byAmount.body.data.map((row: { amountVnd: number }) => row.amountVnd);
      expect(amounts).toEqual([...amounts].sort((x: number, y: number) => y - x));
      expect(ids(await list(admin, { sort: 'receivedAt' }).expect(200))).toEqual([...ids(await list(admin).expect(200))].reverse());
      const page = await list(admin, { limit: 2, page: 3 }).expect(200);
      expect(page.body).toMatchObject({ total: 5, page: 3, limit: 2, totalPages: 3 });
      expect(page.body.data).toHaveLength(1);
    });

    it.each([
      ['an unknown verification status', { verificationStatus: 'GOOD' }],
      ['a needsReview value that is not true/false', { needsReview: 'maybe' }],
      ['a sort field outside the whitelist', { sort: 'providerTransactionId' }],
      ['a limit above 200', { limit: 201 }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const admin = await b.admin();

      const res = await list(admin, query);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBeUndefined();
    });
  });

  describe('refund requests', () => {
    const list = (admin: Admin, query: object = {}) => t.api.get('/api/admin/refunds').query(query).set(bearer(t, admin));
    const cancelByAdmin = (admin: Admin, orderId: string) =>
      t.api.patch(`/api/admin/orders/${orderId}/status`).set(bearer(t, admin)).send({ status: 'cancelled' }).expect(200);
    const refundOf = async (orderId: string) =>
      (await rows<{ id: string }>('SELECT id FROM refunds WHERE order_id = $1 ORDER BY created_at DESC', [orderId]))[0].id;

    /** Ba đơn đã trả bị huỷ: một khoản hoàn xong, một bị từ chối, một đang chờ */
    async function seed() {
      const admin = await b.admin();
      const [completed, rejected, requested] = [await placeAndPayOrder(t, b), await placeAndPayOrder(t, b), await placeAndPayOrder(t, b)];
      for (const entry of [completed, rejected, requested]) await cancelByAdmin(admin, entry.order.id);
      await t.api
        .post(`/api/admin/refunds/${await refundOf(completed.order.id)}/complete`)
        .set(bearer(t, admin))
        .send({ reference: 'FT-R1', note: 'Đã chuyển' })
        .expect(201);
      await t.api
        .post(`/api/admin/refunds/${await refundOf(rejected.order.id)}/reject`)
        .set(bearer(t, admin))
        .send({ note: 'Khách yêu cầu giữ lại' })
        .expect(201);
      return { admin, completed, rejected, requested };
    }

    describe('GET /api/admin/refunds', () => {
      it('lists refunds with the order, the customer and where the money came from', async () => {
        const { admin, completed } = await seed();

        const res = await list(admin).expect(200);

        expect(res.body).toMatchObject({ total: 3, page: 1, limit: 25, totalPages: 1 });
        const row = res.body.data.find((item: { orderId: string }) => item.orderId === completed.order.id);
        expect(row).toMatchObject({
          status: 'COMPLETED',
          reason: 'ADMIN_CANCELLED',
          returnRequestId: null,
          amountVnd: 730_000,
          amountUsd: expect.any(Number),
          requestedBy: admin.id,
          processedBy: admin.id,
          bankReference: 'FT-R1',
          note: 'Đã chuyển',
          order: {
            id: completed.order.id,
            status: 'cancelled',
            paymentStatus: 'refunded',
            totalVnd: 730_000,
            customer: { fullName: completed.customer.name, phone: '0900000000' },
          },
          payment: {
            transferCode: completed.qr.transferContent,
            paidAmountVnd: 730_000,
            paidAmountUsd: expect.any(Number),
            provider: 'sepay',
          },
        });
      });

      it('filters by status, order id and search text, sorts and paginates', async () => {
        const { admin, completed, rejected, requested } = await seed();
        const orderIds = (res: { body: { data: { orderId: string }[] } }) => res.body.data.map((row) => row.orderId);

        expect(orderIds(await list(admin, { status: 'REQUESTED' }).expect(200))).toEqual([requested.order.id]);
        expect(orderIds(await list(admin, { status: 'REJECTED' }).expect(200))).toEqual([rejected.order.id]);
        expect(orderIds(await list(admin, { orderId: completed.order.id }).expect(200))).toEqual([completed.order.id]);
        expect(orderIds(await list(admin, { search: 'ft-r1' }).expect(200))).toEqual([completed.order.id]);
        expect(orderIds(await list(admin, { search: requested.qr.transferContent }).expect(200))).toEqual([requested.order.id]);
        expect(orderIds(await list(admin, { search: rejected.customer.name }).expect(200))).toEqual([rejected.order.id]);
        expect((await list(admin, { search: 'nothing-like-this' }).expect(200)).body.total).toBe(0);

        const newest = ids(await list(admin).expect(200));
        expect(ids(await list(admin, { sort: 'createdAt' }).expect(200))).toEqual([...newest].reverse());
        const page = await list(admin, { limit: 2, page: 2 }).expect(200);
        expect(page.body).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });
        expect(page.body.data).toHaveLength(1);
      });

      it.each([
        ['an unknown status', { status: 'DONE' }],
        ['a sort field outside the whitelist', { sort: 'bankReference' }],
        ['a limit above 200', { limit: 201 }],
        ['an orderId longer than 16 characters', { orderId: 'x'.repeat(17) }],
      ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
        const admin = await b.admin();

        const res = await list(admin, query);

        expect(res.status).toBe(400);
        expect(res.body.errorCode).toBeUndefined();
      });
    });

    describe('POST /api/admin/refunds', () => {
      const create = (admin: Admin, body: object) => t.api.post('/api/admin/refunds').set(bearer(t, admin)).send(body);

      it('opens a new request for a cancelled paid order whose earlier request was rejected', async () => {
        const { admin, rejected } = await seed();

        const res = await create(admin, { orderId: rejected.order.id }).expect(201);

        expect(res.body.data).toMatchObject({
          orderId: rejected.order.id,
          status: 'REQUESTED',
          reason: 'ADMIN_CANCELLED',
          amountVnd: 730_000,
          requestedBy: admin.id,
          processedAt: null,
        });
        expect(await rows('SELECT status FROM refunds WHERE order_id = $1 ORDER BY created_at', [rejected.order.id])).toEqual([
          { status: 'REJECTED' },
          { status: 'REQUESTED' },
        ]);
      });

      it('refuses an order that is not cancelled, one that was never paid, one already waiting and one already refunded (1712)', async () => {
        const { admin, completed, requested } = await seed();
        const confirmed = await placeAndPayOrder(t, b);
        const unpaid = await placeOrder(t, b);
        await t.api.patch(`/api/orders/${unpaid.order.id}/cancel`).set(bearer(t, unpaid.customer)).expect(200);

        const notCancelled = await create(admin, { orderId: confirmed.order.id });
        const neverPaid = await create(admin, { orderId: unpaid.order.id });
        const waiting = await create(admin, { orderId: requested.order.id });
        const refunded = await create(admin, { orderId: completed.order.id });

        expect(error(notCancelled)).toMatchObject({
          status: 400,
          errorCode: 1712,
          message: 'Only a cancelled order that has been paid and not fully refunded can be refunded',
        });
        expect(error(neverPaid)).toMatchObject({ status: 400, errorCode: 1712 });
        expect(error(waiting)).toMatchObject({ status: 400, errorCode: 1712 });
        expect(error(refunded)).toMatchObject({ status: 400, errorCode: 1712 });
        expect(await rows('SELECT 1 FROM refunds')).toHaveLength(3);
      });

      it('answers 404 / 1301 for an unknown order and a validation error for a bad body', async () => {
        const admin = await b.admin();

        expect(error(await create(admin, { orderId: 'zzzzzzzzzzzzzzzz' }))).toMatchObject({ status: 404, errorCode: 1301 });
        for (const body of [{}, { orderId: '' }, { orderId: 'x'.repeat(17) }, { orderId: 'abc', extra: 1 }]) {
          const res = await create(admin, body);
          expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
        }
      });
    });
  });
});
