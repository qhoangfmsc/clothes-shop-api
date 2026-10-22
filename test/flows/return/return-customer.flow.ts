import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { placeAndPayOrder, placeOrder } from '../order-payment/steps';
import { deliveredPaidOrder, requestReturn } from './steps';

/** Batch 06 (return, khách): điều kiện trả hàng, tạo/xem/huỷ yêu cầu và danh sách. */
describe('Flow: returns (customer)', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  const rows = <R>(sql: string, params: unknown[] = []) => t.dataSource.query(sql, params) as Promise<R[]>;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const eligibility = (entry: { customer: Parameters<typeof bearer>[1]; order: { id: string } }) =>
    t.api.get(`/api/returns/eligibility/${entry.order.id}`).set(bearer(t, entry.customer));
  const create = (customer: Parameters<typeof bearer>[1], body: object) => t.api.post('/api/returns').set(bearer(t, customer)).send(body);
  const ids = (res: { body: { data: { id: string }[] } }) => res.body.data.map((row) => row.id);

  describe('GET /api/returns/eligibility/:orderId', () => {
    it('says a paid, delivered order is returnable with the deadline and the returnable quantities', async () => {
      const entry = await deliveredPaidOrder(t, b);

      const res = await eligibility(entry).expect(200);

      expect(res.body.data).toMatchObject({
        orderId: entry.order.id,
        eligible: true,
        reason: null,
        returnWindowDays: 30,
        items: [{ orderItemId: entry.items[0].id, quantity: 2, returnableQuantity: 2 }],
      });
      const days = (new Date(res.body.data.deadline).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29);
      expect(days).toBeLessThanOrEqual(30);
    });

    it('explains why not, in order: not paid, not delivered, window expired, nothing left to return', async () => {
      const unpaid = await placeOrder(t, b);
      const paidOnly = await placeAndPayOrder(t, b);
      const expired = await deliveredPaidOrder(t, b);
      await rows(`UPDATE orders SET delivered_at = now() - interval '31 days' WHERE id = $1`, [expired.order.id]);
      const used = await deliveredPaidOrder(t, b);
      await requestReturn(t, used, { quantity: 2 });

      expect((await eligibility(unpaid).expect(200)).body.data).toMatchObject({ eligible: false, reason: 'ORDER_NOT_PAID' });
      expect((await eligibility(paidOnly).expect(200)).body.data).toMatchObject({ eligible: false, reason: 'ORDER_NOT_DELIVERED' });
      expect((await eligibility(expired).expect(200)).body.data).toMatchObject({ eligible: false, reason: 'RETURN_WINDOW_EXPIRED' });
      expect((await eligibility(used).expect(200)).body.data).toMatchObject({
        eligible: false,
        reason: 'NOTHING_TO_RETURN',
        items: [{ returnableQuantity: 0 }],
      });
    });

    it('answers 404 / 1301 for an unknown order and for another customer’s order', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const stranger = await b.user();

      const unknown = await t.api.get('/api/returns/eligibility/zzzzzzzzzzzzzzzz').set(bearer(t, stranger));
      const foreign = await t.api.get(`/api/returns/eligibility/${entry.order.id}`).set(bearer(t, stranger));

      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1301 });
      expect(error(foreign)).toMatchObject({ status: 404, errorCode: 1301 });
    });
  });

  describe('POST /api/returns', () => {
    it('creates a REQUESTED return with a product snapshot, no refund yet, and reduces the returnable quantity', async () => {
      const entry = await deliveredPaidOrder(t, b);

      const res = await create(entry.customer, {
        orderId: entry.order.id,
        reason: 'WRONG_SIZE',
        note: ' Hơi chật ',
        items: [{ orderItemId: entry.items[0].id, quantity: 1 }],
      }).expect(201);

      expect(res.body.data).toMatchObject({
        orderId: entry.order.id,
        status: 'REQUESTED',
        reason: 'WRONG_SIZE',
        note: 'Hơi chật',
        adminNote: null,
        approvedAt: null,
        receivedAt: null,
        refund: null,
        items: [
          {
            orderItemId: entry.items[0].id,
            productName: expect.any(String),
            size: 'M',
            color: 'Black',
            priceVnd: 350_000,
            priceUsd: 14,
            quantity: 1,
            acceptedQuantity: null,
          },
        ],
      });
      expect((await eligibility(entry).expect(200)).body.data.items[0].returnableQuantity).toBe(1);
      expect(await rows('SELECT requested_by FROM return_requests')).toEqual([{ requested_by: entry.customer.id }]);
    });

    it('lets the rest be returned in a second request, then refuses more (1802)', async () => {
      const entry = await deliveredPaidOrder(t, b);
      await requestReturn(t, entry, { quantity: 1 });
      await requestReturn(t, entry, { quantity: 1 });

      const res = await create(entry.customer, {
        orderId: entry.order.id,
        reason: 'OTHER',
        items: [{ orderItemId: entry.items[0].id, quantity: 1 }],
      });

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1802 });
    });

    it('refuses an order that is not eligible (1802) and quantities or lines that do not fit (1803)', async () => {
      const unpaid = await placeOrder(t, b);
      const entry = await deliveredPaidOrder(t, b);
      const other = await deliveredPaidOrder(t, b);
      const line = entry.items[0].id;

      const notEligible = await create(unpaid.customer, {
        orderId: unpaid.order.id,
        reason: 'OTHER',
        items: [{ orderItemId: 'aaaaaaaaaaaaaaaa', quantity: 1 }],
      });
      const tooMany = await create(entry.customer, {
        orderId: entry.order.id,
        reason: 'OTHER',
        items: [{ orderItemId: line, quantity: 3 }],
      });
      const unknownLine = await create(entry.customer, {
        orderId: entry.order.id,
        reason: 'OTHER',
        items: [{ orderItemId: 'zzzzzzzzzzzzzzzz', quantity: 1 }],
      });
      const foreignLine = await create(entry.customer, {
        orderId: entry.order.id,
        reason: 'OTHER',
        items: [{ orderItemId: other.items[0].id, quantity: 1 }],
      });
      const duplicated = await create(entry.customer, {
        orderId: entry.order.id,
        reason: 'OTHER',
        items: [
          { orderItemId: line, quantity: 1 },
          { orderItemId: line, quantity: 1 },
        ],
      });

      expect(error(notEligible)).toMatchObject({ status: 400, errorCode: 1802 });
      for (const res of [tooMany, unknownLine, foreignLine, duplicated]) expect(error(res)).toMatchObject({ status: 400, errorCode: 1803 });
      expect(await rows('SELECT 1 FROM return_requests')).toHaveLength(0);
    });

    it('answers 404 / 1301 for another customer’s order', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const stranger = await b.user();

      const res = await create(stranger, {
        orderId: entry.order.id,
        reason: 'OTHER',
        items: [{ orderItemId: entry.items[0].id, quantity: 1 }],
      });

      expect(error(res)).toMatchObject({ status: 404, errorCode: 1301 });
    });

    it.each([
      ['a missing reason', (o: string, i: string) => ({ orderId: o, items: [{ orderItemId: i, quantity: 1 }] })],
      ['an unknown reason', (o: string, i: string) => ({ orderId: o, reason: 'BORED', items: [{ orderItemId: i, quantity: 1 }] })],
      ['no items', (o: string) => ({ orderId: o, reason: 'OTHER', items: [] })],
      ['a zero quantity', (o: string, i: string) => ({ orderId: o, reason: 'OTHER', items: [{ orderItemId: i, quantity: 0 }] })],
      ['a quantity above 1000', (o: string, i: string) => ({ orderId: o, reason: 'OTHER', items: [{ orderItemId: i, quantity: 1001 }] })],
      [
        'a note longer than 500 characters',
        (o: string, i: string) => ({ orderId: o, reason: 'OTHER', note: 'x'.repeat(501), items: [{ orderItemId: i, quantity: 1 }] }),
      ],
      [
        'an unknown field',
        (o: string, i: string) => ({ orderId: o, reason: 'OTHER', refund: true, items: [{ orderItemId: i, quantity: 1 }] }),
      ],
      [
        'an unknown field inside an item',
        (o: string, i: string) => ({ orderId: o, reason: 'OTHER', items: [{ orderItemId: i, quantity: 1, price: 1 }] }),
      ],
    ])('rejects %s with a validation error (no errorCode) and creates nothing', async (_name, body) => {
      const entry = await deliveredPaidOrder(t, b);

      const res = await create(entry.customer, body(entry.order.id, entry.items[0].id));

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await rows('SELECT 1 FROM return_requests')).toHaveLength(0);
    });
  });

  describe('GET /api/returns and GET /api/returns/:returnId', () => {
    it('lists only my requests with status and order filters, sorting and pagination', async () => {
      const mine = await deliveredPaidOrder(t, b);
      const other = await deliveredPaidOrder(t, b);
      const [r1, r2] = [await requestReturn(t, mine, { quantity: 1 }), await requestReturn(t, mine, { quantity: 1 })];
      await requestReturn(t, other);
      await t.api.patch(`/api/returns/${r1.id}/cancel`).set(bearer(t, mine.customer)).expect(200);
      const get = (query: object = {}) => t.api.get('/api/returns').query(query).set(bearer(t, mine.customer));

      const all = await get().expect(200);
      expect(ids(all)).toEqual([r2.id, r1.id]);
      expect(all.body).toMatchObject({ total: 2, page: 1, limit: 25, totalPages: 1 });
      expect(ids(await get({ status: 'CANCELLED' }).expect(200))).toEqual([r1.id]);
      expect(ids(await get({ orderId: mine.order.id }).expect(200))).toEqual([r2.id, r1.id]);
      expect(ids(await get({ orderId: other.order.id }).expect(200))).toEqual([]);
      expect(ids(await get({ sort: 'createdAt' }).expect(200))).toEqual([r1.id, r2.id]);
      const page = await get({ limit: 1, page: 2 }).expect(200);
      expect(page.body).toMatchObject({ total: 2, page: 2, limit: 1, totalPages: 2 });
    });

    it.each([
      ['an unknown status', { status: 'DONE' }],
      ['a sort field outside the whitelist', { sort: 'updatedAt' }],
      ['a limit above 200', { limit: 201 }],
      ['an orderId longer than 16 characters', { orderId: 'x'.repeat(17) }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const customer = await b.user();

      const res = await t.api.get('/api/returns').query(query).set(bearer(t, customer));

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });

    it('shows one request to its owner and answers 404 / 1801 to anyone else or for an unknown id', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await requestReturn(t, entry);
      const stranger = await b.user();

      const own = await t.api.get(`/api/returns/${request.id}`).set(bearer(t, entry.customer)).expect(200);
      const foreign = await t.api.get(`/api/returns/${request.id}`).set(bearer(t, stranger));
      const unknown = await t.api.get('/api/returns/zzzzzzzzzzzzzzzz').set(bearer(t, entry.customer));

      expect(own.body.data).toMatchObject({ id: request.id, status: 'REQUESTED', orderId: entry.order.id });
      expect(error(foreign)).toMatchObject({ status: 404, errorCode: 1801 });
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1801 });
    });
  });

  describe('PATCH /api/returns/:returnId/cancel', () => {
    it('cancels a REQUESTED request and gives the quantity back', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await requestReturn(t, entry, { quantity: 2 });
      expect((await eligibility(entry).expect(200)).body.data.eligible).toBe(false);

      const res = await t.api.patch(`/api/returns/${request.id}/cancel`).set(bearer(t, entry.customer)).expect(200);

      expect(res.body.data.status).toBe('CANCELLED');
      expect((await eligibility(entry).expect(200)).body.data).toMatchObject({ eligible: true, items: [{ returnableQuantity: 2 }] });
    });

    it('also cancels an APPROVED request, but not one that is already cancelled (1804)', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const [approved, cancelled] = [await requestReturn(t, entry, { quantity: 1 }), await requestReturn(t, entry, { quantity: 1 })];
      await t.api.post(`/api/admin/returns/${approved.id}/approve`).set(bearer(t, entry.admin)).send({}).expect(201);
      await t.api.patch(`/api/returns/${cancelled.id}/cancel`).set(bearer(t, entry.customer)).expect(200);

      const ok = await t.api.patch(`/api/returns/${approved.id}/cancel`).set(bearer(t, entry.customer)).expect(200);
      const again = await t.api.patch(`/api/returns/${cancelled.id}/cancel`).set(bearer(t, entry.customer));

      expect(ok.body.data.status).toBe('CANCELLED');
      expect(error(again)).toMatchObject({ status: 400, errorCode: 1804 });
    });

    it('refuses to cancel a request that is rejected or already received (1804) and hides other customers’ requests (404 / 1801)', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const [toReject, toReceive] = [await requestReturn(t, entry, { quantity: 1 }), await requestReturn(t, entry, { quantity: 1 })];
      await t.api.post(`/api/admin/returns/${toReject.id}/reject`).set(bearer(t, entry.admin)).send({ note: 'Quá hạn' }).expect(201);
      await t.api.post(`/api/admin/returns/${toReceive.id}/approve`).set(bearer(t, entry.admin)).send({}).expect(201);
      await t.api.post(`/api/admin/returns/${toReceive.id}/receive`).set(bearer(t, entry.admin)).send({}).expect(201);
      const stranger = await b.user();

      const afterReject = await t.api.patch(`/api/returns/${toReject.id}/cancel`).set(bearer(t, entry.customer));
      const afterReceive = await t.api.patch(`/api/returns/${toReceive.id}/cancel`).set(bearer(t, entry.customer));
      const foreign = await t.api.patch(`/api/returns/${toReceive.id}/cancel`).set(bearer(t, stranger));

      expect(error(afterReject)).toMatchObject({ status: 400, errorCode: 1804 });
      expect(error(afterReceive)).toMatchObject({ status: 400, errorCode: 1804 });
      expect(error(foreign)).toMatchObject({ status: 404, errorCode: 1801 });
    });
  });
});
