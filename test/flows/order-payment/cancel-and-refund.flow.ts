import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { createQr, placeAndPayOrder, placeOrder } from './steps';

/**
 * Luồng chính: huỷ đơn và hoàn tiền. Khách chỉ tự huỷ được đơn chưa trả; đơn đã trả do admin huỷ,
 * khi đó hệ thống tự sinh yêu cầu hoàn đủ tiền và admin ghi nhận khi đã chuyển khoản trả khách.
 */
describe('Flow: cancel and refund', () => {
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

  it('lets a customer cancel an unpaid pending order and voids its pending QR', async () => {
    const { customer, order } = await placeOrder(t, b);
    await createQr(t, customer, order.id);

    await t.api.patch(`/api/orders/${order.id}/cancel`).set(bearer(t, customer)).expect(200);

    expect(await orderRow(order.id)).toMatchObject({ status: 'cancelled', payment_status: 'unpaid' });
    expect(await t.dataSource.query('SELECT status FROM payment_attempts')).toEqual([{ status: 'CANCELLED' }]);
  });

  it('refuses a customer cancelling a paid order (1307) and leaves it untouched', async () => {
    const { customer, order } = await placeAndPayOrder(t, b);

    const res = await t.api.patch(`/api/orders/${order.id}/cancel`).set(bearer(t, customer)).expect(400);

    expect(res.body.errorCode).toBe(1307);
    expect(await orderRow(order.id)).toMatchObject({ status: 'confirmed', payment_status: 'paid' });
  });

  it('refunds in full: admin cancels a paid order, a refund is requested, admin completes it, order becomes refunded', async () => {
    const admin = await b.admin();
    const { order } = await placeAndPayOrder(t, b);

    await t.api.patch(`/api/admin/orders/${order.id}/status`).set(bearer(t, admin)).send({ status: 'cancelled' }).expect(200);
    expect(await orderRow(order.id)).toMatchObject({ status: 'cancelled', payment_status: 'paid' });

    // Huỷ đơn đã trả tự sinh yêu cầu hoàn đúng bằng số tiền ngân hàng đã nhận
    const pending = await t.api.get('/api/admin/refunds').query({ status: 'REQUESTED' }).set(bearer(t, admin)).expect(200);
    expect(pending.body.data).toHaveLength(1);
    const refund = pending.body.data[0];
    expect(refund).toMatchObject({ orderId: order.id, amountVnd: order.totalVnd, status: 'REQUESTED' });

    await t.api
      .post(`/api/admin/refunds/${refund.id}/complete`)
      .set(bearer(t, admin))
      .send({ reference: 'FT-FLOW-0001', note: 'Chuyển lại đúng tài khoản nguồn' })
      .expect(201);

    expect(await orderRow(order.id)).toMatchObject({ status: 'cancelled', payment_status: 'refunded' });
    expect(await t.dataSource.query('SELECT status, amount FROM refunds')).toEqual([
      { status: 'COMPLETED', amount: String(order.totalVnd) },
    ]);
  });

  it('rejects completing a refund twice (1713) and a reused bank reference (1714)', async () => {
    const admin = await b.admin();
    const first = await placeAndPayOrder(t, b);
    const second = await placeAndPayOrder(t, b);
    for (const { order } of [first, second]) {
      await t.api.patch(`/api/admin/orders/${order.id}/status`).set(bearer(t, admin)).send({ status: 'cancelled' }).expect(200);
    }
    const list = await t.api.get('/api/admin/refunds').query({ status: 'REQUESTED' }).set(bearer(t, admin)).expect(200);
    const [refundA, refundB] = list.body.data as { id: string }[];
    const complete = (id: string, reference: string) =>
      t.api.post(`/api/admin/refunds/${id}/complete`).set(bearer(t, admin)).send({ reference, note: 'ok' });

    await complete(refundA.id, 'FT-FLOW-0002').expect(201);

    expect((await complete(refundA.id, 'FT-FLOW-0003').expect(400)).body.errorCode).toBe(1713);
    expect((await complete(refundB.id, 'FT-FLOW-0002').expect(400)).body.errorCode).toBe(1714);
  });
});
