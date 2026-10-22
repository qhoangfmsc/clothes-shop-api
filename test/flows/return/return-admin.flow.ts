import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { requestWhileRowLocked } from '../../support/locks';
import { deliveredPaidOrder, requestReturn } from './steps';

/** Batch 07 (return, admin): danh sách, chi tiết, duyệt, từ chối, nhận hàng và liên kết với khoản hoàn. */
describe('Flow: returns (admin)', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  type Entry = Awaited<ReturnType<typeof deliveredPaidOrder>>;
  const rows = <R>(sql: string, params: unknown[] = []) => t.dataSource.query(sql, params) as Promise<R[]>;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const act = (entry: Entry, action: 'approve' | 'reject' | 'receive', returnId: string, body: object = {}) =>
    t.api.post(`/api/admin/returns/${returnId}/${action}`).set(bearer(t, entry.admin)).send(body);
  const adminGet = (entry: Entry, path: string, query: object = {}) =>
    t.api.get(`/api/admin/returns${path}`).query(query).set(bearer(t, entry.admin));
  const customerView = (entry: Entry, returnId: string) => t.api.get(`/api/returns/${returnId}`).set(bearer(t, entry.customer)).expect(200);
  const returnRow = (id: string) =>
    rows<{
      status: string;
      admin_note: string | null;
      processed_by: string | null;
      approved_at: Date | null;
      received_at: Date | null;
      shipping_refunded: boolean;
    }>('SELECT status, admin_note, processed_by, approved_at, received_at, shipping_refunded FROM return_requests WHERE id = $1', [
      id,
    ]).then((r) => r[0]);
  const refundsOf = (orderId: string) =>
    rows<{ id: string; amount: string; status: string; reason: string; return_request_id: string }>(
      'SELECT id, amount, status, reason, return_request_id FROM refunds WHERE order_id = $1 ORDER BY created_at',
      [orderId],
    );
  const completeRefund = (entry: Entry, refundId: string, reference: string) =>
    t.api
      .post(`/api/admin/refunds/${refundId}/complete`)
      .set(bearer(t, entry.admin))
      .send({ reference, note: 'Hoàn tiền trả hàng' })
      .expect(201);
  const ids = (res: { body: { data: { id: string }[] } }) => res.body.data.map((row) => row.id);

  /** Yêu cầu đã APPROVED, sẵn sàng nhận hàng */
  async function approvedReturn(entry: Entry, quantity = 2) {
    const request = await requestReturn(t, entry, { quantity });
    await act(entry, 'approve', request.id).expect(201);
    return request;
  }

  describe('GET /api/admin/returns', () => {
    it('lists requests of every customer with the admin view, filters, search, sorting and pagination', async () => {
      const first = await deliveredPaidOrder(t, b);
      const second = await deliveredPaidOrder(t, b);
      const r1 = await requestReturn(t, first, { quantity: 1 });
      const r2 = await requestReturn(t, second, { quantity: 1 });
      await act(first, 'reject', r1.id, { note: 'Quá hạn' }).expect(201);
      const phone = '0987000111';
      await rows(`UPDATE orders SET shipping_address = jsonb_set(shipping_address, '{phone}', to_jsonb($2::text)) WHERE id = $1`, [
        second.order.id,
        phone,
      ]);

      const all = await adminGet(first, '').expect(200);
      expect(ids(all)).toEqual([r2.id, r1.id]);
      expect(all.body).toMatchObject({ total: 2, page: 1, limit: 25, totalPages: 1 });
      expect(all.body.data[0]).toMatchObject({
        id: r2.id,
        status: 'REQUESTED',
        requestedBy: second.customer.id,
        processedBy: null,
        shippingRefunded: false,
        order: {
          id: second.order.id,
          status: 'delivered',
          paymentStatus: 'paid',
          totalVnd: 730_000,
          totalUsd: 29.2,
          shippingFeeVnd: 30_000,
          userId: second.customer.id,
        },
      });
      expect(ids(await adminGet(first, '', { status: 'REJECTED' }).expect(200))).toEqual([r1.id]);
      expect(ids(await adminGet(first, '', { orderId: second.order.id }).expect(200))).toEqual([r2.id]);
      expect(ids(await adminGet(first, '', { search: r1.id.slice(0, 8) }).expect(200))).toEqual([r1.id]);
      expect(ids(await adminGet(first, '', { search: second.order.id }).expect(200))).toEqual([r2.id]);
      expect(ids(await adminGet(first, '', { search: phone }).expect(200))).toEqual([r2.id]);
      expect(ids(await adminGet(first, '', { search: 'khong-ton-tai-xyz' }).expect(200))).toEqual([]);
      expect(ids(await adminGet(first, '', { sort: 'createdAt' }).expect(200))).toEqual([r1.id, r2.id]);
      expect(ids(await adminGet(first, '', { sort: '-updatedAt' }).expect(200))).toEqual([r1.id, r2.id]);
      expect((await adminGet(first, '', { limit: 1, page: 2 }).expect(200)).body).toMatchObject({
        total: 2,
        page: 2,
        limit: 1,
        totalPages: 2,
      });
    });

    it('returns an empty page when there are no requests', async () => {
      const entry = await deliveredPaidOrder(t, b);

      const res = await adminGet(entry, '').expect(200);

      expect(res.body).toMatchObject({ data: [], total: 0, page: 1, limit: 25, totalPages: 0 });
    });

    it.each([
      ['an unknown status', { status: 'DONE' }],
      ['a sort field outside the whitelist', { sort: 'status' }],
      ['the removed `sorts` parameter', { sorts: 'createdAt' }],
      ['a limit above 200', { limit: 201 }],
      ['a page below 1', { page: 0 }],
      ['an orderId longer than 16 characters', { orderId: 'x'.repeat(17) }],
      ['a search longer than 255 characters', { search: 'x'.repeat(256) }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const admin = await b.admin();

      const res = await t.api.get('/api/admin/returns').query(query).set(bearer(t, admin));

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('GET /api/admin/returns/:returnId', () => {
    it('shows the request with lines, order summary and customer, and 404 / 1801 for an unknown id', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await requestReturn(t, entry, { quantity: 1, reason: 'DEFECTIVE', note: 'Rách đường may' });
      const [{ full_name }] = await rows<{ full_name: string }>(
        `SELECT shipping_address->>'fullName' AS full_name FROM orders WHERE id = $1`,
        [entry.order.id],
      );

      const res = await adminGet(entry, `/${request.id}`).expect(200);
      const unknown = await adminGet(entry, '/zzzzzzzzzzzzzzzz');

      expect(res.body.data).toMatchObject({
        id: request.id,
        status: 'REQUESTED',
        reason: 'DEFECTIVE',
        note: 'Rách đường may',
        refund: null,
        items: [{ orderItemId: entry.items[0].id, quantity: 1, acceptedQuantity: null, priceVnd: 350_000 }],
        order: {
          id: entry.order.id,
          exchangeRate: 25_000,
          deliveredAt: expect.any(String),
          customer: { fullName: full_name, phone: expect.any(String) },
        },
      });
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1801 });
    });
  });

  describe('POST /api/admin/returns/:returnId/approve', () => {
    it('approves with a note the customer can see and records who and when', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await requestReturn(t, entry);

      const res = await act(entry, 'approve', request.id, { note: '  Gửi về kho Q1 ' }).expect(201);

      expect(res.body.data).toMatchObject({
        status: 'APPROVED',
        adminNote: 'Gửi về kho Q1',
        processedBy: entry.admin.id,
        approvedAt: expect.any(String),
      });
      expect((await customerView(entry, request.id)).body.data).toMatchObject({ status: 'APPROVED', adminNote: 'Gửi về kho Q1' });
    });

    it('approves without a note (adminNote stays null)', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await requestReturn(t, entry);

      await act(entry, 'approve', request.id).expect(201);

      expect(await returnRow(request.id)).toMatchObject({ status: 'APPROVED', admin_note: null, processed_by: entry.admin.id });
    });

    it('refuses a request that is not REQUESTED (1804) and an unknown id (404 / 1801)', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const approved = await requestReturn(t, entry, { quantity: 1 });
      const rejected = await requestReturn(t, entry, { quantity: 1 });
      await act(entry, 'approve', approved.id).expect(201);
      await act(entry, 'reject', rejected.id, { note: 'Không đủ điều kiện' }).expect(201);

      const again = await act(entry, 'approve', approved.id);
      const afterReject = await act(entry, 'approve', rejected.id);
      const unknown = await act(entry, 'approve', 'zzzzzzzzzzzzzzzz');

      expect(error(again)).toMatchObject({ status: 400, errorCode: 1804 });
      expect(error(afterReject)).toMatchObject({ status: 400, errorCode: 1804 });
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1801 });
      expect((await returnRow(rejected.id)).status).toBe('REJECTED');
    });

    it.each([
      ['a note longer than 500 characters', { note: 'x'.repeat(501) }],
      ['an unknown field', { status: 'RECEIVED' }],
    ])('rejects %s with a validation error (no errorCode) and changes nothing', async (_name, body) => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await requestReturn(t, entry);

      const res = await act(entry, 'approve', request.id, body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect((await returnRow(request.id)).status).toBe('REQUESTED');
    });

    it('waits for the order lock and then refuses a request cancelled meanwhile (1804)', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await requestReturn(t, entry);

      const res = await requestWhileRowLocked(
        t.dataSource,
        { table: 'orders', id: entry.order.id },
        () => act(entry, 'approve', request.id),
        (runner) => runner.query(`UPDATE return_requests SET status = 'CANCELLED' WHERE id = $1`, [request.id]),
      );

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1804 });
      expect((await returnRow(request.id)).status).toBe('CANCELLED');
    });

    it('lets exactly one of two simultaneous approvals through', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await requestReturn(t, entry);

      const results = await Promise.all([act(entry, 'approve', request.id), act(entry, 'approve', request.id)]);

      expect(results.map((res) => res.status).sort()).toEqual([201, 400]);
      expect(results.find((res) => res.status === 400)?.body.errorCode).toBe(1804);
    });
  });

  describe('POST /api/admin/returns/:returnId/reject', () => {
    it('rejects a REQUESTED or an APPROVED request with a reason the customer sees, and frees the quantity', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const requested = await requestReturn(t, entry, { quantity: 1 });
      const approved = await requestReturn(t, entry, { quantity: 1 });
      await act(entry, 'approve', approved.id).expect(201);

      const first = await act(entry, 'reject', requested.id, { note: ' Quá hạn đổi trả ' }).expect(201);
      const second = await act(entry, 'reject', approved.id, { note: 'Hàng đã qua sử dụng' }).expect(201);

      expect(first.body.data).toMatchObject({ status: 'REJECTED', adminNote: 'Quá hạn đổi trả', processedBy: entry.admin.id });
      expect(second.body.data).toMatchObject({ status: 'REJECTED', adminNote: 'Hàng đã qua sử dụng' });
      expect((await customerView(entry, requested.id)).body.data.adminNote).toBe('Quá hạn đổi trả');
      const eligibility = await t.api.get(`/api/returns/eligibility/${entry.order.id}`).set(bearer(t, entry.customer)).expect(200);
      expect(eligibility.body.data.items[0].returnableQuantity).toBe(2);
    });

    it('refuses a request that is already rejected, cancelled or received (1804) and an unknown id (404 / 1801)', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const rejected = await requestReturn(t, entry, { quantity: 1 });
      await act(entry, 'reject', rejected.id, { note: 'Lý do' }).expect(201);
      const cancelled = await requestReturn(t, entry, { quantity: 1 });
      await t.api.patch(`/api/returns/${cancelled.id}/cancel`).set(bearer(t, entry.customer)).expect(200);
      const received = await approvedReturn(entry, 1);
      await act(entry, 'receive', received.id).expect(201);

      for (const id of [rejected.id, cancelled.id, received.id])
        expect(error(await act(entry, 'reject', id, { note: 'Lý do' }))).toMatchObject({ status: 400, errorCode: 1804 });
      expect(error(await act(entry, 'reject', 'zzzzzzzzzzzzzzzz', { note: 'Lý do' }))).toMatchObject({ status: 404, errorCode: 1801 });
      expect((await returnRow(received.id)).status).toBe('RECEIVED');
    });

    it.each([
      ['a missing note', {}],
      ['an empty note', { note: '   ' }],
      ['a note longer than 500 characters', { note: 'x'.repeat(501) }],
      ['an unknown field', { note: 'Lý do', status: 'APPROVED' }],
    ])('rejects %s with a validation error (no errorCode) and changes nothing', async (_name, body) => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await requestReturn(t, entry);

      const res = await act(entry, 'reject', request.id, body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect((await returnRow(request.id)).status).toBe('REQUESTED');
    });
  });

  describe('POST /api/admin/returns/:returnId/receive', () => {
    it('accepts everything by default and creates a refund for the items only (700.000đ of 730.000đ)', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await approvedReturn(entry);

      const res = await act(entry, 'receive', request.id, { note: 'Hàng nguyên vẹn' }).expect(201);

      expect(res.body.data).toMatchObject({
        status: 'RECEIVED',
        adminNote: 'Hàng nguyên vẹn',
        shippingRefunded: false,
        receivedAt: expect.any(String),
        processedBy: entry.admin.id,
        items: [{ quantity: 2, acceptedQuantity: 2 }],
        refund: { id: expect.any(String), amountVnd: 700_000, amountUsd: 28, status: 'REQUESTED', bankReference: null, processedAt: null },
      });
      expect(await refundsOf(entry.order.id)).toEqual([
        { id: expect.any(String), amount: '700000', status: 'REQUESTED', reason: 'RETURN', return_request_id: request.id },
      ]);
      expect((await customerView(entry, request.id)).body.data.refund).toEqual({
        amountVnd: 700_000,
        amountUsd: 28,
        status: 'REQUESTED',
        bankReference: null,
        processedAt: null,
      });
    });

    it('refunds only the accepted quantity and keeps the earlier note when none is given', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await requestReturn(t, entry, { quantity: 2 });
      await act(entry, 'approve', request.id, { note: 'Gửi về kho' }).expect(201);

      const res = await act(entry, 'receive', request.id, { items: [{ returnItemId: request.items[0].id, acceptedQuantity: 1 }] }).expect(
        201,
      );

      expect(res.body.data).toMatchObject({
        adminNote: 'Gửi về kho',
        items: [{ quantity: 2, acceptedQuantity: 1 }],
        refund: { amountVnd: 350_000, amountUsd: 14 },
      });
    });

    it('adds the shipping fee when refundShipping is true, which refunds the full 730.000đ', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await approvedReturn(entry);

      const res = await act(entry, 'receive', request.id, { refundShipping: true }).expect(201);

      expect(res.body.data).toMatchObject({ shippingRefunded: true, refund: { amountVnd: 730_000, amountUsd: 29.2 } });
      expect((await returnRow(request.id)).shipping_refunded).toBe(true);
    });

    it('sums several returns of one order to what was paid: 350.000đ then 380.000đ with shipping, and refuses shipping twice (1805)', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const [first, second] = [await requestReturn(t, entry, { quantity: 1 }), await requestReturn(t, entry, { quantity: 1 })];
      await act(entry, 'approve', first.id).expect(201);
      await act(entry, 'approve', second.id).expect(201);

      const one = await act(entry, 'receive', first.id).expect(201);
      expect(one.body.data.refund.amountVnd).toBe(350_000);
      await completeRefund(entry, one.body.data.refund.id, 'FT-RETURN-1');
      const two = await act(entry, 'receive', second.id, { refundShipping: true }).expect(201);
      expect(two.body.data.refund.amountVnd).toBe(380_000);
      await completeRefund(entry, two.body.data.refund.id, 'FT-RETURN-2');

      const third = await deliveredPaidOrder(t, b);
      const [a, c] = [await requestReturn(t, third, { quantity: 1 }), await requestReturn(t, third, { quantity: 1 })];
      await act(third, 'approve', a.id).expect(201);
      await act(third, 'approve', c.id).expect(201);
      const withShipping = await act(third, 'receive', a.id, { refundShipping: true }).expect(201);
      await completeRefund(third, withShipping.body.data.refund.id, 'FT-RETURN-3');
      const again = await act(third, 'receive', c.id, { refundShipping: true });

      expect(error(again)).toMatchObject({
        status: 400,
        errorCode: 1805,
        message: 'The shipping fee of this order has already been refunded',
      });
      expect((await returnRow(c.id)).status).toBe('APPROVED');
      expect(await rows(`SELECT 1 FROM refunds WHERE return_request_id = $1`, [c.id])).toHaveLength(0);
    });

    it('rounds cumulatively when the bank received less than the order total, so the refunds add up exactly', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const [first, second] = [await requestReturn(t, entry, { quantity: 1 }), await requestReturn(t, entry, { quantity: 1 })];
      await act(entry, 'approve', first.id).expect(201);
      await act(entry, 'approve', second.id).expect(201);
      await rows(
        `UPDATE payment_transactions SET amount = 300000 WHERE payment_attempt_id IN (SELECT id FROM payment_attempts WHERE order_id = $1)`,
        [entry.order.id],
      );

      const one = await act(entry, 'receive', first.id).expect(201);
      await completeRefund(entry, one.body.data.refund.id, 'FT-ROUND-1');
      const two = await act(entry, 'receive', second.id).expect(201);

      expect([one.body.data.refund.amountVnd, two.body.data.refund.amountVnd]).toEqual([143_836, 143_835]);
    });

    it('refuses a second receive while the first refund is still waiting, and rolls everything back', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const [first, second] = [await requestReturn(t, entry, { quantity: 1 }), await requestReturn(t, entry, { quantity: 1 })];
      await act(entry, 'approve', first.id).expect(201);
      await act(entry, 'approve', second.id).expect(201);
      await act(entry, 'receive', first.id).expect(201);

      const res = await act(entry, 'receive', second.id);

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1712 });
      expect(await returnRow(second.id)).toMatchObject({ status: 'APPROVED', received_at: null });
      expect(await rows(`SELECT accepted_quantity FROM return_request_items WHERE return_request_id = $1`, [second.id])).toEqual([
        { accepted_quantity: null },
      ]);
      expect(await refundsOf(entry.order.id)).toHaveLength(1);
    });

    it('refuses a request that is not APPROVED (1804) and an unknown id (404 / 1801)', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const requested = await requestReturn(t, entry, { quantity: 1 });
      const received = await approvedReturn(entry, 1);
      await act(entry, 'receive', received.id).expect(201);

      expect(error(await act(entry, 'receive', requested.id))).toMatchObject({ status: 400, errorCode: 1804 });
      expect(error(await act(entry, 'receive', received.id))).toMatchObject({ status: 400, errorCode: 1804 });
      expect(error(await act(entry, 'receive', 'zzzzzzzzzzzzzzzz'))).toMatchObject({ status: 404, errorCode: 1801 });
      expect((await returnRow(requested.id)).status).toBe('REQUESTED');
    });

    it('refuses when the order is no longer paid (1805)', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await approvedReturn(entry);
      await rows(`UPDATE orders SET payment_status = 'refunded' WHERE id = $1`, [entry.order.id]);

      const res = await act(entry, 'receive', request.id);

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1805 });
      expect((await returnRow(request.id)).status).toBe('APPROVED');
    });

    it('refuses to accept nothing (1805), a foreign / repeated / oversized line (1805), and items worth more than the order (1805)', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await approvedReturn(entry);
      const line = request.items[0].id;

      const none = await act(entry, 'receive', request.id, { items: [{ returnItemId: line, acceptedQuantity: 0 }] });
      const foreign = await act(entry, 'receive', request.id, { items: [{ returnItemId: 'zzzzzzzzzzzzzzzz', acceptedQuantity: 1 }] });
      const repeated = await act(entry, 'receive', request.id, {
        items: [
          { returnItemId: line, acceptedQuantity: 1 },
          { returnItemId: line, acceptedQuantity: 1 },
        ],
      });
      const oversized = await act(entry, 'receive', request.id, { items: [{ returnItemId: line, acceptedQuantity: 3 }] });
      await rows(`UPDATE order_items SET price = 500000 WHERE order_id = $1`, [entry.order.id]);
      const overTotal = await act(entry, 'receive', request.id);

      const messages = [none, foreign, repeated, oversized, overTotal].map((res) =>
        error(res).errorCode === 1805 ? error(res).message : `unexpected ${res.status}`,
      );
      expect(messages).toEqual([
        expect.stringContaining('At least one item must be accepted'),
        expect.stringContaining('is not part of this return request'),
        expect.stringContaining('appears more than once'),
        expect.stringContaining('but only 2 were requested'),
        expect.stringContaining('worth more than the order total'),
      ]);
      expect((await returnRow(request.id)).status).toBe('APPROVED');
      expect(await refundsOf(entry.order.id)).toHaveLength(0);
    });

    it.each([
      ['a negative accepted quantity', (line: string) => ({ items: [{ returnItemId: line, acceptedQuantity: -1 }] })],
      ['an accepted quantity above 1000', (line: string) => ({ items: [{ returnItemId: line, acceptedQuantity: 1001 }] })],
      ['a fractional accepted quantity', (line: string) => ({ items: [{ returnItemId: line, acceptedQuantity: 1.5 }] })],
      ['a missing returnItemId', () => ({ items: [{ acceptedQuantity: 1 }] })],
      ['a non-boolean refundShipping', () => ({ refundShipping: 'yes' })],
      ['a note longer than 500 characters', () => ({ note: 'x'.repeat(501) })],
      ['an unknown field', () => ({ refundVnd: 1 })],
      ['an unknown field inside an item', (line: string) => ({ items: [{ returnItemId: line, acceptedQuantity: 1, price: 1 }] })],
    ])('rejects %s with a validation error (no errorCode) and changes nothing', async (_name, body) => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await approvedReturn(entry);

      const res = await act(entry, 'receive', request.id, body(request.items[0].id));

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect((await returnRow(request.id)).status).toBe('APPROVED');
    });

    it('waits for the order lock and then refuses a request rejected meanwhile (1804)', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await approvedReturn(entry);

      const res = await requestWhileRowLocked(
        t.dataSource,
        { table: 'orders', id: entry.order.id },
        () => act(entry, 'receive', request.id),
        (runner) => runner.query(`UPDATE return_requests SET status = 'REJECTED' WHERE id = $1`, [request.id]),
      );

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1804 });
      expect(await refundsOf(entry.order.id)).toHaveLength(0);
    });
  });

  describe('linkage with the refund of a return', () => {
    it('completing the refund moves the return to REFUNDED and shows the bank reference to the customer', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await approvedReturn(entry);
      const received = await act(entry, 'receive', request.id).expect(201);

      await completeRefund(entry, received.body.data.refund.id, 'FT-LINK-1');

      expect((await returnRow(request.id)).status).toBe('REFUNDED');
      expect((await customerView(entry, request.id)).body.data).toMatchObject({
        status: 'REFUNDED',
        refund: { amountVnd: 700_000, status: 'COMPLETED', bankReference: 'FT-LINK-1' },
      });
      expect(
        (await rows<{ payment_status: string }>('SELECT payment_status FROM orders WHERE id = $1', [entry.order.id]))[0].payment_status,
      ).toBe('paid');
    });

    it('rejecting the refund sends the return back to APPROVED, and a second receive creates a new refund', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const request = await approvedReturn(entry);
      const received = await act(entry, 'receive', request.id, { refundShipping: true }).expect(201);

      await t.api
        .post(`/api/admin/refunds/${received.body.data.refund.id}/reject`)
        .set(bearer(t, entry.admin))
        .send({ note: 'Chưa xác minh' })
        .expect(201);

      expect(await returnRow(request.id)).toMatchObject({ status: 'APPROVED', received_at: null, shipping_refunded: false });
      expect(await rows(`SELECT accepted_quantity FROM return_request_items WHERE return_request_id = $1`, [request.id])).toEqual([
        { accepted_quantity: null },
      ]);

      const again = await act(entry, 'receive', request.id, { items: [{ returnItemId: request.items[0].id, acceptedQuantity: 1 }] }).expect(
        201,
      );

      expect(again.body.data).toMatchObject({ status: 'RECEIVED', refund: { amountVnd: 350_000, status: 'REQUESTED' } });
      expect((await refundsOf(entry.order.id)).map((refund) => refund.status)).toEqual(['REJECTED', 'REQUESTED']);
    });
  });
});
