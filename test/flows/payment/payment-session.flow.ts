import {
  type Builders,
  bearer,
  createBuilders,
  createTestApp,
  sepayWebhook,
  signSepayBody,
  TEST_ENV,
  type TestApp,
  truncateAll,
} from '../../support';
import { createQr, placeAndPayOrder, placeOrder, sendTransfer } from '../order-payment/steps';

/** Batch 01 (payment): phía khách — trạng thái thanh toán, phiên QR và các kết quả đối soát của webhook SePay. */
describe('Flow: payment session (status, QR, webhook outcomes)', () => {
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
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const transactions = () => t.dataSource.query('SELECT verification_status FROM payment_transactions ORDER BY received_at');
  const orderRow = (id: string) =>
    t.dataSource
      .query('SELECT status, payment_status FROM orders WHERE id = $1', [id])
      .then((rows: { status: string; payment_status: string }[]) => rows[0]);
  const postWebhook = (hook: { body: string; headers: Record<string, string> }) =>
    t.api.post('/api/webhooks/sepay').set(hook.headers).send(hook.body);

  describe('GET /api/payments/:orderId/status', () => {
    it('follows the session: PENDING → EXPIRED once overdue, CANCELLED after cancel, PAID after the transfer', async () => {
      const { customer, order } = await placeOrder(t, b);
      const status = async () => (await t.api.get(`/api/payments/${order.id}/status`).set(bearer(t, customer)).expect(200)).body.data;
      await createQr(t, customer, order.id);

      expect(await status()).toMatchObject({
        orderId: order.id,
        status: 'PENDING',
        amountVnd: 730_000,
        amountUsd: expect.any(Number),
        exchangeRate: expect.any(Number),
      });

      await expire(order.id);
      expect((await status()).status).toBe('EXPIRED');

      await t.api.patch(`/api/orders/${order.id}/cancel`).set(bearer(t, customer)).expect(200);
      expect((await status()).status).toBe('CANCELLED');
    });

    it('reports PAID once the transfer matched, with the amount of the order', async () => {
      const { customer, order } = await placeAndPayOrder(t, b);

      const res = await t.api.get(`/api/payments/${order.id}/status`).set(bearer(t, customer)).expect(200);

      expect(res.body.data).toMatchObject({ orderId: order.id, status: 'PAID', amountVnd: 730_000 });
    });

    it('answers 404 / 1301 for an unknown order or another customer’s order, and 404 / 1703 when no QR was ever created', async () => {
      const [{ customer, order }, stranger] = [await placeOrder(t, b), await b.user()];

      const unknown = await t.api.get('/api/payments/zzzzzzzzzzzzzzzz/status').set(bearer(t, customer));
      const foreign = await t.api.get(`/api/payments/${order.id}/status`).set(bearer(t, stranger));
      const noSession = await t.api.get(`/api/payments/${order.id}/status`).set(bearer(t, customer));

      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1301 });
      expect(error(foreign)).toMatchObject({ status: 404, errorCode: 1301 });
      expect(error(noSession)).toMatchObject({ status: 404, errorCode: 1703 });
    });
  });

  describe('POST /api/payments/qr', () => {
    it('returns the bank details, a VietQR link and a 30-minute expiry, and reuses the pending session', async () => {
      const { customer, order } = await placeOrder(t, b);

      const first = await t.api.post('/api/payments/qr').set(bearer(t, customer)).send({ orderId: order.id }).expect(201);
      const again = await t.api.post('/api/payments/qr').set(bearer(t, customer)).send({ orderId: order.id }).expect(201);

      expect(first.body.data).toMatchObject({
        orderId: order.id,
        status: 'PENDING',
        amountVnd: 730_000,
        bankName: 'Vietcombank',
        accountNumber: TEST_ENV.SEPAY_RECEIVING_ACCOUNT,
        accountName: 'DOOVAN TEST',
        transferContent: expect.stringMatching(/^DH[A-Z0-9]{8}$/),
      });
      expect(first.body.data.qrUrl).toContain(`amount=730000`);
      expect(first.body.data.qrUrl).toContain(`des=${first.body.data.transferContent}`);
      const minutes = (new Date(first.body.data.expiresAt).getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(28);
      expect(minutes).toBeLessThanOrEqual(30);
      expect(again.body.data.transferContent).toBe(first.body.data.transferContent);
      expect(await t.dataSource.query('SELECT 1 FROM payment_attempts')).toHaveLength(1);
    });

    it('issues a new code after the old one expired and marks the old session EXPIRED', async () => {
      const { customer, order } = await placeOrder(t, b);
      const old = await createQr(t, customer, order.id);
      await expire(order.id);

      const fresh = await createQr(t, customer, order.id);

      expect(fresh.transferContent).not.toBe(old.transferContent);
      const rows = await t.dataSource.query('SELECT transfer_code, status FROM payment_attempts ORDER BY created_at');
      expect(rows).toEqual([
        { transfer_code: old.transferContent, status: 'EXPIRED' },
        { transfer_code: fresh.transferContent, status: 'PENDING' },
      ]);
    });

    it('refuses a paid order and a cancelled order with 400 / 1702', async () => {
      const paid = await placeAndPayOrder(t, b);
      const cancelled = await placeOrder(t, b);
      await t.api.patch(`/api/orders/${cancelled.order.id}/cancel`).set(bearer(t, cancelled.customer)).expect(200);

      const paidRes = await t.api.post('/api/payments/qr').set(bearer(t, paid.customer)).send({ orderId: paid.order.id });
      const cancelledRes = await t.api.post('/api/payments/qr').set(bearer(t, cancelled.customer)).send({ orderId: cancelled.order.id });

      expect(error(paidRes)).toEqual({ status: 400, errorCode: 1702, message: 'Order has already been paid' });
      expect(error(cancelledRes)).toEqual({ status: 400, errorCode: 1702, message: 'Order has been cancelled' });
    });

    it('answers 404 / 1301 for another customer’s order and 400 for a missing orderId, creating nothing', async () => {
      const [{ order }, stranger] = [await placeOrder(t, b), await b.user()];

      const foreign = await t.api.post('/api/payments/qr').set(bearer(t, stranger)).send({ orderId: order.id });
      const missing = await t.api.post('/api/payments/qr').set(bearer(t, stranger)).send({});

      expect(error(foreign)).toMatchObject({ status: 404, errorCode: 1301 });
      expect(missing.status).toBe(400);
      expect(missing.body.errorCode).toBeUndefined();
      expect(await t.dataSource.query('SELECT 1 FROM payment_attempts')).toHaveLength(0);
    });
  });

  describe('POST /api/webhooks/sepay', () => {
    const transferFor = (
      qr: { transferContent: string; amountVnd: number },
      over: Parameters<typeof sepayWebhook>[0] extends infer T ? Partial<T> : never = {},
    ) =>
      sepayWebhook({
        id: `wh-${Math.random().toString(36).slice(2, 10)}`,
        amount: qr.amountVnd,
        content: `chuyen khoan ${qr.transferContent}`,
        ...over,
      });

    it.each([
      ['an outgoing transfer as IGNORED', { transferType: 'out' as const }, 'IGNORED'],
      ['a transfer to another account as ACCOUNT_MISMATCH', { accountNumber: '9999999999' }, 'ACCOUNT_MISMATCH'],
      ['a transfer without any DH code as UNMATCHED', { content: 'tien an trua' }, 'UNMATCHED'],
      ['a transfer with a code nobody owns as UNMATCHED', { content: 'chuyen khoan DHZZZZZZZZ' }, 'UNMATCHED'],
    ])('records %s and leaves the order unpaid', async (_name, over, expected) => {
      const { customer, order } = await placeOrder(t, b);
      const qr = await createQr(t, customer, order.id);

      const res = await postWebhook(transferFor(qr, over));

      expect({ status: res.status, body: res.body }).toEqual({ status: 200, body: { success: true } });
      expect(await transactions()).toEqual([{ verification_status: expected }]);
      expect(await orderRow(order.id)).toEqual({ status: 'pending', payment_status: 'unpaid' });
    });

    it('rejects a transfer to an account that is no longer the configured one, even if the session was issued for it', async () => {
      const { customer, order } = await placeOrder(t, b);
      const qr = await createQr(t, customer, order.id);
      await t.dataSource.query(`UPDATE payment_attempts SET bank_account = '9999999999' WHERE order_id = $1`, [order.id]);

      await postWebhook(transferFor(qr, { accountNumber: '9999999999' })).expect(200);

      expect(await transactions()).toEqual([{ verification_status: 'ACCOUNT_MISMATCH' }]);
      expect(await orderRow(order.id)).toEqual({ status: 'pending', payment_status: 'unpaid' });
    });

    it('records a correct transfer for an expired code as LATE, expires the session and does not pay the order', async () => {
      const { customer, order } = await placeOrder(t, b);
      const qr = await createQr(t, customer, order.id);
      await expire(order.id);

      await postWebhook(transferFor(qr)).expect(200);

      expect(await transactions()).toEqual([{ verification_status: 'LATE' }]);
      expect(await t.dataSource.query('SELECT status FROM payment_attempts')).toEqual([{ status: 'EXPIRED' }]);
      expect((await orderRow(order.id)).payment_status).toBe('unpaid');
    });

    it('matches a bank that lower-cases the code and pads the content', async () => {
      const { customer, order } = await placeOrder(t, b);
      const qr = await createQr(t, customer, order.id);

      await postWebhook(transferFor(qr, { content: `MBVCB.123.${qr.transferContent.toLowerCase()}.CT tu NGUYEN VAN A` })).expect(200);

      expect(await transactions()).toEqual([{ verification_status: 'MATCHED' }]);
      expect(await orderRow(order.id)).toEqual({ status: 'confirmed', payment_status: 'paid' });
    });

    it('answers 400 / 1705 to a correctly signed body with the wrong shape, and stores nothing', async () => {
      const body = JSON.stringify({ transferType: 'in', transferAmount: 1000, accountNumber: TEST_ENV.SEPAY_RECEIVING_ACCOUNT });

      const res = await t.api.post('/api/webhooks/sepay').set(signSepayBody(body)).send(body);

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1705 });
      expect(await transactions()).toHaveLength(0);
    });

    it('answers 401 / 1704 to a stale timestamp and to a missing signature', async () => {
      const { customer, order } = await placeOrder(t, b);
      const qr = await createQr(t, customer, order.id);
      const stale = sepayWebhook(
        { id: 'stale', amount: qr.amountVnd, content: qr.transferContent },
        { timestamp: Math.floor(Date.now() / 1000) - 600 },
      );

      const staleRes = await postWebhook(stale);
      const unsigned = await t.api.post('/api/webhooks/sepay').set('Content-Type', 'application/json').send(stale.body);

      expect(error(staleRes)).toMatchObject({ status: 401, errorCode: 1704 });
      expect(error(unsigned)).toMatchObject({ status: 401, errorCode: 1704 });
      expect(await transactions()).toHaveLength(0);
      expect((await orderRow(order.id)).payment_status).toBe('unpaid');
    });

    it('still reports success for a matched transfer and for the repeat of the same id', async () => {
      const { customer, order } = await placeOrder(t, b);
      const qr = await createQr(t, customer, order.id);

      const first = await sendTransfer(t, qr, { id: 'once' });
      const repeat = await sendTransfer(t, qr, { id: 'once' });

      expect([first.status, first.body, repeat.status, repeat.body]).toEqual([200, { success: true }, 200, { success: true }]);
      expect(await transactions()).toEqual([{ verification_status: 'MATCHED' }]);
    });
  });
});
