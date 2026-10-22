import { type Builders, bearer, createBuilders, createTestApp, sepayWebhook, type TestApp, truncateAll } from '../../support';
import { createQr, placeAndPayOrder, placeOrder } from '../order-payment/steps';

/** Batch 02 (payment): hành động của admin — tạo QR cho đơn bất kỳ và xác nhận thanh toán thủ công. */
describe('Flow: admin payment actions (QR and manual confirmation)', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  type Admin = Awaited<ReturnType<Builders['admin']>>;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const rows = <R>(sql: string, params: unknown[] = []) => t.dataSource.query(sql, params) as Promise<R[]>;
  const orderRow = (id: string) =>
    rows<{ status: string; payment_status: string }>('SELECT status, payment_status FROM orders WHERE id = $1', [id]).then((r) => r[0]);
  const expire = (orderId: string) =>
    t.dataSource.query(`UPDATE payment_attempts SET expires_at = now() - interval '1 minute' WHERE order_id = $1`, [orderId]);
  const adminQr = (admin: Admin, orderId: string) => t.api.post(`/api/admin/payments/orders/${orderId}/qr`).set(bearer(t, admin));
  const confirm = (admin: Admin, orderId: string, body: object) =>
    t.api.post(`/api/admin/payments/orders/${orderId}/confirm`).set(bearer(t, admin)).send(body);
  /** Gửi một khoản tiền vào webhook (đúng chữ ký) và trả id giao dịch vừa lưu */
  async function bankTransfer(content: string, amount: number, over: { transferType?: 'in' | 'out' } = {}) {
    const hook = sepayWebhook({ id: `bank-${Math.random().toString(36).slice(2, 10)}`, amount, content, ...over });
    await t.api.post('/api/webhooks/sepay').set(hook.headers).send(hook.body).expect(200);
    return (await rows<{ id: string }>('SELECT id FROM payment_transactions ORDER BY received_at DESC LIMIT 1'))[0].id;
  }

  describe('POST /api/admin/payments/orders/:orderId/qr', () => {
    it('issues a fresh code, expires the old one and reports the superseded codes', async () => {
      const admin = await b.admin();
      const { customer, order } = await placeOrder(t, b);
      const old = await createQr(t, customer, order.id);

      const res = await adminQr(admin, order.id).expect(201);

      expect(res.body.data).toMatchObject({
        orderId: order.id,
        status: 'PENDING',
        amountVnd: 730_000,
        supersededTransferCodes: [old.transferContent],
      });
      expect(res.body.data.transferContent).not.toBe(old.transferContent);
      expect(await rows('SELECT transfer_code, status, created_by FROM payment_attempts ORDER BY created_at')).toEqual([
        { transfer_code: old.transferContent, status: 'EXPIRED', created_by: null },
        { transfer_code: res.body.data.transferContent, status: 'PENDING', created_by: admin.id },
      ]);
    });

    it('returns an empty superseded list for an order that had no code yet', async () => {
      const admin = await b.admin();
      const { order } = await placeOrder(t, b);

      const res = await adminQr(admin, order.id).expect(201);

      expect(res.body.data.supersededTransferCodes).toEqual([]);
    });

    it('records money sent to a superseded code as LATE and does not pay the order', async () => {
      const admin = await b.admin();
      const { customer, order } = await placeOrder(t, b);
      const old = await createQr(t, customer, order.id);
      await adminQr(admin, order.id).expect(201);

      await bankTransfer(`chuyen khoan ${old.transferContent}`, 730_000);

      expect(await rows('SELECT verification_status FROM payment_transactions')).toEqual([{ verification_status: 'LATE' }]);
      expect((await orderRow(order.id)).payment_status).toBe('unpaid');
    });

    it('answers 404 / 1301 for an unknown order and 400 / 1702 for a paid or a cancelled order', async () => {
      const admin = await b.admin();
      const paid = await placeAndPayOrder(t, b);
      const cancelled = await placeOrder(t, b);
      await t.api.patch(`/api/orders/${cancelled.order.id}/cancel`).set(bearer(t, cancelled.customer)).expect(200);

      expect(error(await adminQr(admin, 'zzzzzzzzzzzzzzzz'))).toMatchObject({ status: 404, errorCode: 1301 });
      expect(error(await adminQr(admin, paid.order.id))).toMatchObject({
        status: 400,
        errorCode: 1702,
        message: 'Order has already been paid',
      });
      expect(error(await adminQr(admin, cancelled.order.id))).toMatchObject({
        status: 400,
        errorCode: 1702,
        message: 'Order has been cancelled',
      });
    });
  });

  describe('POST /api/admin/payments/orders/:orderId/confirm — success', () => {
    it('records a new bank transaction (reference + amount) and pays the order', async () => {
      const admin = await b.admin();
      const { customer, order } = await placeOrder(t, b);
      const qr = await createQr(t, customer, order.id);

      const res = await confirm(admin, order.id, { amountVnd: 730_000, reference: 'FT-123', note: 'Đối chiếu sao kê' }).expect(201);

      expect(res.body.data).toMatchObject({
        orderId: order.id,
        paymentStatus: 'paid',
        transaction: {
          provider: 'sepay',
          providerTransactionId: 'FT-123',
          verificationStatus: 'MANUALLY_CONFIRMED',
          amountVnd: 730_000,
          amountUsd: expect.any(Number),
          confirmNote: 'Đối chiếu sao kê',
          confirmedBy: admin.id,
        },
      });
      expect(await orderRow(order.id)).toEqual({ status: 'confirmed', payment_status: 'paid' });
      expect(await rows('SELECT status, transfer_code FROM payment_attempts')).toEqual([
        { status: 'PAID', transfer_code: qr.transferContent },
      ]);
    });

    it('with only a transfer code the manual provider records the code itself as the reference', async () => {
      const admin = await b.admin();
      const { customer, order } = await placeOrder(t, b);
      const qr = await createQr(t, customer, order.id);

      const res = await confirm(admin, order.id, {
        amountVnd: 730_000,
        transferCode: qr.transferContent.toLowerCase(),
        note: 'Khách trả tại quầy',
      }).expect(201);

      expect(res.body.data.transaction).toMatchObject({ provider: 'manual', providerTransactionId: qr.transferContent });
    });

    it('pays the expired session named by its transfer code', async () => {
      const admin = await b.admin();
      const { customer, order } = await placeOrder(t, b);
      const old = await createQr(t, customer, order.id);
      await expire(order.id);
      await createQr(t, customer, order.id);

      await confirm(admin, order.id, {
        amountVnd: 730_000,
        reference: 'FT-OLD',
        transferCode: old.transferContent,
        note: 'Khách chuyển theo mã cũ',
      }).expect(201);

      expect(await rows('SELECT status, transfer_code FROM payment_attempts ORDER BY created_at')).toEqual([
        { status: 'PAID', transfer_code: old.transferContent },
        { status: 'CANCELLED', transfer_code: expect.any(String) },
      ]);
    });

    it('attaches an existing AMOUNT_MISMATCH transaction by id, but only accepts the wrong amount when told to', async () => {
      const admin = await b.admin();
      const { customer, order } = await placeOrder(t, b);
      const qr = await createQr(t, customer, order.id);
      const transactionId = await bankTransfer(`chuyen khoan ${qr.transferContent}`, 700_000);
      expect(await rows('SELECT verification_status FROM payment_transactions')).toEqual([{ verification_status: 'AMOUNT_MISMATCH' }]);

      const refused = await confirm(admin, order.id, { transactionId, note: 'Đã nhận tiền' });
      const accepted = await confirm(admin, order.id, {
        transactionId,
        note: 'Khách chuyển thiếu, cửa hàng chấp nhận',
        acceptAmountMismatch: true,
      });

      expect(error(refused)).toMatchObject({ status: 400, errorCode: 1710 });
      expect(refused.body.message).toContain('700000');
      expect(accepted.status).toBe(201);
      expect(await rows('SELECT verification_status, amount FROM payment_transactions')).toEqual([
        { verification_status: 'MANUALLY_CONFIRMED', amount: '700000' },
      ]);
      expect(await orderRow(order.id)).toEqual({ status: 'confirmed', payment_status: 'paid' });
    });

    it('attaches a LATE transaction (right amount, expired code) by id and pays the order without any override', async () => {
      const admin = await b.admin();
      const { customer, order } = await placeOrder(t, b);
      const qr = await createQr(t, customer, order.id);
      await expire(order.id);
      const transactionId = await bankTransfer(`chuyen khoan ${qr.transferContent}`, 730_000);
      expect(await rows('SELECT verification_status FROM payment_transactions')).toEqual([{ verification_status: 'LATE' }]);

      await confirm(admin, order.id, { transactionId, note: 'Tiền về trễ nhưng đúng' }).expect(201);

      expect(await rows('SELECT verification_status FROM payment_transactions')).toEqual([{ verification_status: 'MANUALLY_CONFIRMED' }]);
      expect(await rows('SELECT status FROM payment_attempts')).toEqual([{ status: 'PAID' }]);
    });
  });

  describe('POST /api/admin/payments/orders/:orderId/confirm — errors', () => {
    it.each([
      ['neither a transaction nor an amount', { note: 'x' }],
      ['an amount without any reference or transfer code', { amountVnd: 730_000, note: 'x' }],
      ['a transaction id together with an amount', { transactionId: 'abc', amountVnd: 730_000, note: 'x' }],
      ['a transaction id together with a reference', { transactionId: 'abc', reference: 'FT-1', note: 'x' }],
    ])('rejects %s with 400 / 1707 and changes nothing', async (_name, body) => {
      const admin = await b.admin();
      const { order } = await placeOrder(t, b);

      const res = await confirm(admin, order.id, body);

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1707 });
      expect((await orderRow(order.id)).payment_status).toBe('unpaid');
    });

    it.each([
      ['a missing note', { amountVnd: 730_000, reference: 'FT-1' }],
      ['an unknown field', { amountVnd: 730_000, reference: 'FT-1', note: 'x', surprise: true }],
      ['a zero amount', { amountVnd: 0, reference: 'FT-1', note: 'x' }],
      ['a provider outside the allowed list', { amountVnd: 730_000, reference: 'FT-1', note: 'x', provider: 'paypal' }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, body) => {
      const admin = await b.admin();
      const { order } = await placeOrder(t, b);

      const res = await confirm(admin, order.id, body);

      expect(res.status).toBe(400);
      expect(res.body.errorCode).toBeUndefined();
    });

    it('rejects a wrong amount without the explicit acceptance (1710) and a repeated reference (1709)', async () => {
      const admin = await b.admin();
      const { customer, order } = await placeOrder(t, b);
      await createQr(t, customer, order.id);
      const other = await placeOrder(t, b);
      await createQr(t, other.customer, other.order.id);
      await confirm(admin, other.order.id, { amountVnd: 730_000, reference: 'FT-DUP', note: 'ok' }).expect(201);

      const wrongAmount = await confirm(admin, order.id, { amountVnd: 1_000, reference: 'FT-NEW', note: 'ok' });
      const repeated = await confirm(admin, order.id, { amountVnd: 730_000, reference: 'FT-DUP', note: 'ok' });

      expect(error(wrongAmount)).toMatchObject({ status: 400, errorCode: 1710 });
      expect(error(repeated)).toMatchObject({ status: 400, errorCode: 1709 });
      expect((await orderRow(order.id)).payment_status).toBe('unpaid');
    });

    it('answers 404 for an unknown order (1301), an unknown transaction (1708), an unknown code or an order without sessions (1703)', async () => {
      const admin = await b.admin();
      const { customer, order } = await placeOrder(t, b);
      const noSession = await placeOrder(t, b);
      await createQr(t, customer, order.id);

      expect(error(await confirm(admin, 'zzzzzzzzzzzzzzzz', { amountVnd: 1, reference: 'FT-1', note: 'x' }))).toMatchObject({
        status: 404,
        errorCode: 1301,
      });
      expect(error(await confirm(admin, order.id, { transactionId: 'zzzzzzzzzzzzzzzz', note: 'x' }))).toMatchObject({
        status: 404,
        errorCode: 1708,
      });
      expect(error(await confirm(admin, order.id, { amountVnd: 730_000, transferCode: 'DHNOSUCH00', note: 'x' }))).toMatchObject({
        status: 404,
        errorCode: 1703,
      });
      expect(error(await confirm(admin, noSession.order.id, { amountVnd: 730_000, reference: 'FT-2', note: 'x' }))).toMatchObject({
        status: 404,
        errorCode: 1703,
      });
    });

    it('refuses a paid order and a cancelled order (1702), and a transaction that cannot prove a payment (1709)', async () => {
      const admin = await b.admin();
      const paid = await placeAndPayOrder(t, b);
      const cancelled = await placeOrder(t, b);
      await t.api.patch(`/api/orders/${cancelled.order.id}/cancel`).set(bearer(t, cancelled.customer)).expect(200);
      const open = await placeOrder(t, b);
      const outgoing = await bankTransfer('rut tien', 1_000, { transferType: 'out' });

      expect(error(await confirm(admin, paid.order.id, { amountVnd: 730_000, reference: 'FT-3', note: 'x' }))).toMatchObject({
        status: 400,
        errorCode: 1702,
        message: 'Order has already been paid',
      });
      expect(error(await confirm(admin, cancelled.order.id, { amountVnd: 730_000, reference: 'FT-4', note: 'x' }))).toMatchObject({
        status: 400,
        errorCode: 1702,
        message: 'Order has been cancelled',
      });
      expect(error(await confirm(admin, open.order.id, { transactionId: outgoing, note: 'x' }))).toMatchObject({
        status: 400,
        errorCode: 1709,
      });
    });
  });
});
