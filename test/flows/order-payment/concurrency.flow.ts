import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { createQr, placeOrder, sendTransfer } from './steps';

/** Các khoá dòng `Order` phải giữ được bất biến khi request đến cùng lúc; kiểm bất biến, không kiểm ai thắng cuộc đua. */
describe('Flow: concurrent requests on one order', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  const rows = <R>(sql: string, params: unknown[] = []) => t.dataSource.query(sql, params) as Promise<R[]>;

  it('creates exactly one pending QR session when the same order asks for a QR at once', async () => {
    const { customer, order } = await placeOrder(t, b);

    const responses = await Promise.all(
      Array.from({ length: 6 }, () => t.api.post('/api/payments/qr').set(bearer(t, customer)).send({ orderId: order.id })),
    );

    expect(responses.map((res) => res.status)).toEqual(Array(6).fill(201));
    expect(new Set(responses.map((res) => res.body.data.transferContent)).size).toBe(1);
    expect(await rows('SELECT status FROM payment_attempts')).toEqual([{ status: 'PENDING' }]);
  });

  it('records one bank transaction and pays the order once when the same webhook arrives twice at once', async () => {
    const { customer, order } = await placeOrder(t, b);
    const qr = await createQr(t, customer, order.id);

    const responses = await Promise.all([sendTransfer(t, qr, { id: 'race-same' }), sendTransfer(t, qr, { id: 'race-same' })]);

    expect(responses.map((res) => res.status)).toEqual([200, 200]);
    expect(await rows('SELECT verification_status FROM payment_transactions')).toEqual([{ verification_status: 'MATCHED' }]);
    expect(await rows('SELECT status, payment_status FROM orders')).toEqual([{ status: 'confirmed', payment_status: 'paid' }]);
  });

  it('pays once and flags the second transfer as a duplicate when two different transfers hit one order at once', async () => {
    const { customer, order } = await placeOrder(t, b);
    const qr = await createQr(t, customer, order.id);

    await Promise.all([sendTransfer(t, qr, { id: 'race-a' }), sendTransfer(t, qr, { id: 'race-b' })]);

    const statuses = (await rows<{ verification_status: string }>('SELECT verification_status FROM payment_transactions')).map(
      (row) => row.verification_status,
    );
    expect(statuses.sort()).toEqual(['DUPLICATE_PAYMENT', 'MATCHED']);
    expect(await rows('SELECT status FROM payment_attempts')).toEqual([{ status: 'PAID' }]);
  });

  it('smoke: cancel and payment racing (repeated) never leave an order both cancelled and paid', async () => {
    for (let round = 0; round < 8; round++) {
      const { customer, order } = await placeOrder(t, b);
      const qr = await createQr(t, customer, order.id);

      await Promise.all([t.api.patch(`/api/orders/${order.id}/cancel`).set(bearer(t, customer)), sendTransfer(t, qr)]);

      const [final] = await rows<{ status: string; payment_status: string }>('SELECT status, payment_status FROM orders WHERE id = $1', [
        order.id,
      ]);
      const paidAttempts = await rows('SELECT 1 FROM payment_attempts WHERE order_id = $1 AND status = $2', [order.id, 'PAID']);
      // Hoặc thanh toán thắng (đơn paid + confirmed, khách không huỷ được), hoặc huỷ thắng (cancelled + unpaid, tiền về thành NOT_PAYABLE)
      expect([final.status, final.payment_status]).toEqual(
        final.payment_status === 'paid' ? ['confirmed', 'paid'] : ['cancelled', 'unpaid'],
      );
      expect(paidAttempts).toHaveLength(final.payment_status === 'paid' ? 1 : 0);
    }
  });
});
