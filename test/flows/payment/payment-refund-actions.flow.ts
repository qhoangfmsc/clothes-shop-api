import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { placeAndPayOrder } from '../order-payment/steps';

/** Batch 03 (payment): admin ghi nhận đã hoàn tiền xong hoặc từ chối hoàn. */
describe('Flow: refund actions (complete and reject)', () => {
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
  const orderRow = (id: string) =>
    rows<{ status: string; payment_status: string }>('SELECT status, payment_status FROM orders WHERE id = $1', [id]).then((r) => r[0]);
  const complete = (admin: Admin, refundId: string, body: object) =>
    t.api.post(`/api/admin/refunds/${refundId}/complete`).set(bearer(t, admin)).send(body);
  const reject = (admin: Admin, refundId: string, body: object) =>
    t.api.post(`/api/admin/refunds/${refundId}/reject`).set(bearer(t, admin)).send(body);

  /** Đơn đã trả bị admin huỷ → có sẵn một yêu cầu hoàn `REQUESTED` đủ 730.000đ */
  async function requestedRefund() {
    const admin = await b.admin();
    const entry = await placeAndPayOrder(t, b);
    await t.api.patch(`/api/admin/orders/${entry.order.id}/status`).set(bearer(t, admin)).send({ status: 'cancelled' }).expect(200);
    const [{ id }] = await rows<{ id: string }>('SELECT id FROM refunds WHERE order_id = $1', [entry.order.id]);
    return { admin, entry, refundId: id };
  }

  describe('POST /api/admin/refunds/:refundId/complete', () => {
    it('records the bank transfer, completes the refund and marks a fully refunded order', async () => {
      const { admin, entry, refundId } = await requestedRefund();

      const res = await complete(admin, refundId, { reference: '  FT-REFUND-1  ', note: ' Chuyển lại tài khoản nguồn ' }).expect(201);

      expect(res.body.data).toMatchObject({
        id: refundId,
        status: 'COMPLETED',
        amountVnd: 730_000,
        bankReference: 'FT-REFUND-1',
        note: 'Chuyển lại tài khoản nguồn',
        processedBy: admin.id,
        processedAt: expect.any(String),
        order: { id: entry.order.id, paymentStatus: 'refunded' },
      });
      expect(await orderRow(entry.order.id)).toEqual({ status: 'cancelled', payment_status: 'refunded' });
    });

    it('keeps the order paid after a partial refund and refunds the rest with a second request', async () => {
      const { admin, entry, refundId } = await requestedRefund();
      await t.dataSource.query('UPDATE refunds SET amount = 300000 WHERE id = $1', [refundId]);

      await complete(admin, refundId, { reference: 'FT-PART-1', note: 'Hoàn một phần' }).expect(201);
      expect(await orderRow(entry.order.id)).toEqual({ status: 'cancelled', payment_status: 'paid' });

      const second = await t.api.post('/api/admin/refunds').set(bearer(t, admin)).send({ orderId: entry.order.id }).expect(201);
      expect(second.body.data.amountVnd).toBe(430_000);
      await complete(admin, second.body.data.id, { reference: 'FT-PART-2', note: 'Hoàn phần còn lại' }).expect(201);
      expect(await orderRow(entry.order.id)).toEqual({ status: 'cancelled', payment_status: 'refunded' });
    });

    it('refuses a refund that is already completed or rejected (1713) and an unknown refund (404 / 1711)', async () => {
      const { admin, refundId } = await requestedRefund();
      await complete(admin, refundId, { reference: 'FT-ONCE', note: 'ok' }).expect(201);
      const other = await requestedRefund();
      await reject(other.admin, other.refundId, { note: 'Không hoàn' }).expect(201);

      const again = await complete(admin, refundId, { reference: 'FT-TWICE', note: 'ok' });
      const afterReject = await complete(other.admin, other.refundId, { reference: 'FT-LATE', note: 'ok' });
      const unknown = await complete(admin, 'zzzzzzzzzzzzzzzz', { reference: 'FT-X', note: 'ok' });

      expect(error(again)).toEqual({ status: 400, errorCode: 1713, message: 'This refund is already COMPLETED' });
      expect(error(afterReject)).toEqual({ status: 400, errorCode: 1713, message: 'This refund is already REJECTED' });
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1711 });
    });

    it('refuses a bank reference used by another refund (1714) and leaves the second refund waiting', async () => {
      const first = await requestedRefund();
      const second = await requestedRefund();
      await complete(first.admin, first.refundId, { reference: 'FT-SAME', note: 'ok' }).expect(201);

      const res = await complete(second.admin, second.refundId, { reference: 'FT-SAME', note: 'ok' });

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1714 });
      expect(await rows('SELECT status FROM refunds WHERE id = $1', [second.refundId])).toEqual([{ status: 'REQUESTED' }]);
    });

    it('refuses to refund more than the customer paid (1712)', async () => {
      const { admin, entry, refundId } = await requestedRefund();
      await t.dataSource.query('UPDATE refunds SET amount = 800000 WHERE id = $1', [refundId]);

      const res = await complete(admin, refundId, { reference: 'FT-TOO-MUCH', note: 'ok' });

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1712 });
      expect(await orderRow(entry.order.id)).toEqual({ status: 'cancelled', payment_status: 'paid' });
    });

    it.each([
      ['a missing reference', { note: 'ok' }],
      ['a missing note', { reference: 'FT-1' }],
      ['an empty reference', { reference: '   ', note: 'ok' }],
      ['a reference longer than 64 characters', { reference: 'x'.repeat(65), note: 'ok' }],
      ['a note longer than 500 characters', { reference: 'FT-1', note: 'x'.repeat(501) }],
      ['an unknown field', { reference: 'FT-1', note: 'ok', amountVnd: 1 }],
    ])('rejects %s with a validation error and leaves the refund waiting', async (_name, body) => {
      const { admin, refundId } = await requestedRefund();

      const res = await complete(admin, refundId, body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await rows('SELECT status FROM refunds WHERE id = $1', [refundId])).toEqual([{ status: 'REQUESTED' }]);
    });

    it('completes a refund once when two admins press the button at the same time', async () => {
      const { admin, refundId } = await requestedRefund();
      const other = await b.admin();

      const [a, c] = await Promise.all([
        complete(admin, refundId, { reference: 'FT-RACE-A', note: 'ok' }),
        complete(other, refundId, { reference: 'FT-RACE-B', note: 'ok' }),
      ]);

      expect([a.status, c.status].sort()).toEqual([201, 400]);
      expect([a, c].find((res) => res.status === 400)?.body.errorCode).toBe(1713);
      expect(await rows('SELECT status FROM refunds WHERE id = $1', [refundId])).toEqual([{ status: 'COMPLETED' }]);
    });

    it('lets only one of two refunds take the same bank reference when they complete at the same time', async () => {
      const first = await requestedRefund();
      const second = await requestedRefund();

      const results = await Promise.all([
        complete(first.admin, first.refundId, { reference: 'FT-RACE-REF', note: 'ok' }),
        complete(second.admin, second.refundId, { reference: 'FT-RACE-REF', note: 'ok' }),
      ]);

      expect(results.map((res) => res.status).sort()).toEqual([201, 400]);
      expect(results.find((res) => res.status === 400)?.body.errorCode).toBe(1714);
      expect(await rows('SELECT bank_reference FROM refunds WHERE status = $1', ['COMPLETED'])).toEqual([
        { bank_reference: 'FT-RACE-REF' },
      ]);
    });
  });

  describe('POST /api/admin/refunds/:refundId/reject', () => {
    it('rejects the refund with the reason, leaves the order paid and allows a new request', async () => {
      const { admin, entry, refundId } = await requestedRefund();

      const res = await reject(admin, refundId, { note: ' Khách đã nhận hàng ' }).expect(201);

      expect(res.body.data).toMatchObject({
        id: refundId,
        status: 'REJECTED',
        note: 'Khách đã nhận hàng',
        processedBy: admin.id,
        processedAt: expect.any(String),
        bankReference: null,
      });
      expect(await orderRow(entry.order.id)).toEqual({ status: 'cancelled', payment_status: 'paid' });
      await t.api.post('/api/admin/refunds').set(bearer(t, admin)).send({ orderId: entry.order.id }).expect(201);
    });

    it('refuses a refund that is no longer waiting (1713) and an unknown refund (404 / 1711)', async () => {
      const { admin, refundId } = await requestedRefund();
      await reject(admin, refundId, { note: 'Lần một' }).expect(201);
      const done = await requestedRefund();
      await complete(done.admin, done.refundId, { reference: 'FT-DONE', note: 'ok' }).expect(201);

      const twice = await reject(admin, refundId, { note: 'Lần hai' });
      const afterComplete = await reject(done.admin, done.refundId, { note: 'Muộn rồi' });
      const unknown = await reject(admin, 'zzzzzzzzzzzzzzzz', { note: 'x' });

      expect(error(twice)).toEqual({ status: 400, errorCode: 1713, message: 'This refund is already REJECTED' });
      expect(error(afterComplete)).toEqual({ status: 400, errorCode: 1713, message: 'This refund is already COMPLETED' });
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1711 });
    });

    it.each([
      ['a missing note', {}],
      ['an empty note', { note: '  ' }],
      ['a note longer than 500 characters', { note: 'x'.repeat(501) }],
      ['an unknown field', { note: 'ok', reference: 'FT-1' }],
    ])('rejects %s with a validation error and leaves the refund waiting', async (_name, body) => {
      const { admin, refundId } = await requestedRefund();

      const res = await reject(admin, refundId, body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await rows('SELECT status FROM refunds WHERE id = $1', [refundId])).toEqual([{ status: 'REQUESTED' }]);
    });
  });
});
