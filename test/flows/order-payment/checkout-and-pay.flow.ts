import { type Builders, bearer, createBuilders, createTestApp, sepayWebhook, type TestApp, truncateAll } from '../../support';
import { createQr, placeAndPayOrder, placeOrder, sendTransfer } from './steps';

/** Luồng: giỏ → báo giá → checkout → QR → webhook SePay → đơn paid + confirmed. */
describe('Flow: checkout and pay', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  const orderRow = (id: string) =>
    t.dataSource.query('SELECT status, payment_status FROM orders WHERE id = $1', [id]).then((rows) => rows[0]);
  const transactions = () => t.dataSource.query('SELECT verification_status FROM payment_transactions ORDER BY received_at');

  describe('guards', () => {
    it('rejects a request without a token (401)', async () => {
      await t.api.get('/api/orders').expect(401);
    });

    it('rejects a logged-in user who lacks the permission (403)', async () => {
      const noPermission = await b.user({ permissions: [] });
      await t.api.get('/api/orders').set(bearer(t, noPermission)).expect(403);
    });
  });

  it('takes a cart through quote, checkout, QR and webhook to a paid, confirmed order', async () => {
    const customer = await b.user();
    const product = await b.product({ price: 350_000 });
    await b.cart(customer, [{ product, quantity: 2 }]);
    const address = await b.address(customer);

    // 2 × 350.000 + 30.000 phí ship (dưới ngưỡng miễn phí)
    const quote = await t.api.post('/api/orders/quote').set(bearer(t, customer)).send({}).expect(200);
    expect(quote.body.data).toMatchObject({ subtotalVnd: 700_000, shippingFeeVnd: 30_000, totalVnd: 730_000 });

    const checkout = await t.api.post('/api/orders').set(bearer(t, customer)).send({ addressId: address.id }).expect(201);
    const order = checkout.body.data;
    expect(order).toMatchObject({ status: 'pending', paymentStatus: 'unpaid', totalVnd: 730_000 });
    expect(order.items).toHaveLength(1);
    // giỏ đã dọn
    expect(await t.dataSource.query('SELECT 1 FROM cart_items')).toHaveLength(0);

    const qr = await createQr(t, customer, order.id);
    expect(qr).toMatchObject({ amountVnd: 730_000, status: 'PENDING' });
    expect(qr.transferContent).toMatch(/^DH[A-Z0-9]{8}$/);

    const hook = await sendTransfer(t, qr).expect(200);
    expect(hook.body).toEqual({ success: true });

    expect(await orderRow(order.id)).toMatchObject({ status: 'confirmed', payment_status: 'paid' });
    const status = await t.api.get(`/api/payments/${order.id}/status`).set(bearer(t, customer)).expect(200);
    expect(status.body.data.status).toBe('PAID');
    expect(await transactions()).toEqual([{ verification_status: 'MATCHED' }]);
  });

  it('is idempotent: the same bank transaction delivered twice is recorded once', async () => {
    const { customer, order } = await placeOrder(t, b);
    const qr = await createQr(t, customer, order.id);

    await sendTransfer(t, qr, { id: 'dup-1' }).expect(200);
    await sendTransfer(t, qr, { id: 'dup-1' }).expect(200);

    expect(await transactions()).toHaveLength(1);
    expect(await orderRow(order.id)).toMatchObject({ payment_status: 'paid' });
  });

  it('rejects a webhook with a bad signature (1704) and records nothing', async () => {
    const { customer, order } = await placeOrder(t, b);
    const qr = await createQr(t, customer, order.id);
    const forged = sepayWebhook({ id: 'forged-1', amount: qr.amountVnd, content: qr.transferContent }, { secret: 'not-the-secret' });

    const res = await t.api.post('/api/webhooks/sepay').set(forged.headers).send(forged.body).expect(401);

    expect(res.body.errorCode).toBe(1704);
    expect(await transactions()).toHaveLength(0);
    expect(await orderRow(order.id)).toMatchObject({ payment_status: 'unpaid' });
  });

  it('keeps the order unpaid and records AMOUNT_MISMATCH when the customer transfers the wrong amount', async () => {
    const { customer, order } = await placeOrder(t, b);
    const qr = await createQr(t, customer, order.id);

    await sendTransfer(t, qr, { amount: qr.amountVnd - 1000 }).expect(200);

    expect(await transactions()).toEqual([{ verification_status: 'AMOUNT_MISMATCH' }]);
    expect(await orderRow(order.id)).toMatchObject({ status: 'pending', payment_status: 'unpaid' });
  });

  it('records DUPLICATE_PAYMENT when money arrives a second time for an already paid order', async () => {
    const { qr, order } = await placeAndPayOrder(t, b);

    await sendTransfer(t, qr, { id: 'second-transfer' }).expect(200);

    expect((await transactions()).map((row: { verification_status: string }) => row.verification_status)).toEqual([
      'MATCHED',
      'DUPLICATE_PAYMENT',
    ]);
    expect(await orderRow(order.id)).toMatchObject({ payment_status: 'paid' });
  });
});
