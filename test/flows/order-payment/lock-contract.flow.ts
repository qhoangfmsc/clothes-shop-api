import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { requestWhileRowLocked } from '../../support/locks';
import { createQr, placeOrder, sendTransfer } from './steps';

/**
 * Hợp đồng khoá: mỗi thao tác ghi trạng thái đơn phải khoá dòng `orders` rồi mới đọc. Giữ khoá từ bên ngoài, đổi đơn, nhả khoá:
 * thao tác đúng sẽ thấy đơn đã đổi; thao tác bỏ khoá sẽ quyết định trên dữ liệu cũ.
 */
describe('Flow: order row-lock contract', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  const order = (id: string) =>
    t.dataSource
      .query('SELECT status, payment_status FROM orders WHERE id = $1', [id])
      .then((rows: { status: string; payment_status: string }[]) => rows[0]);
  const markPaid = (id: string) => (runner: { query: (sql: string, params: unknown[]) => Promise<unknown> }) =>
    runner.query(`UPDATE orders SET payment_status = 'paid', paid_at = now(), status = 'confirmed' WHERE id = $1`, [id]);
  const markCancelled = (id: string) => (runner: { query: (sql: string, params: unknown[]) => Promise<unknown> }) =>
    runner.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [id]);

  it('customer cancel waits for the lock and then refuses an order that got paid meanwhile (1307)', async () => {
    const { customer, order: placed } = await placeOrder(t, b);

    const res = await requestWhileRowLocked(
      t.dataSource,
      { table: 'orders', id: placed.id },
      () => t.api.patch(`/api/orders/${placed.id}/cancel`).set(bearer(t, customer)),
      markPaid(placed.id),
    );

    expect({ status: res.status, errorCode: res.body.errorCode }).toEqual({ status: 400, errorCode: 1307 });
    expect(await order(placed.id)).toEqual({ status: 'confirmed', payment_status: 'paid' });
  });

  it('admin status change waits for the lock and then rejects a transition from the new state (1302)', async () => {
    const admin = await b.admin();
    const { order: placed } = await placeOrder(t, b);

    const res = await requestWhileRowLocked(
      t.dataSource,
      { table: 'orders', id: placed.id },
      () => t.api.patch(`/api/admin/orders/${placed.id}/status`).set(bearer(t, admin)).send({ status: 'confirmed' }),
      markCancelled(placed.id),
    );

    expect({ status: res.status, errorCode: res.body.errorCode }).toEqual({ status: 400, errorCode: 1302 });
    expect((await order(placed.id)).status).toBe('cancelled');
  });

  it('creating a QR waits for the lock and then refuses an order cancelled meanwhile (1702)', async () => {
    const { customer, order: placed } = await placeOrder(t, b);

    const res = await requestWhileRowLocked(
      t.dataSource,
      { table: 'orders', id: placed.id },
      () => t.api.post('/api/payments/qr').set(bearer(t, customer)).send({ orderId: placed.id }),
      markCancelled(placed.id),
    );

    expect({ status: res.status, errorCode: res.body.errorCode }).toEqual({ status: 400, errorCode: 1702 });
    expect(await t.dataSource.query('SELECT 1 FROM payment_attempts')).toHaveLength(0);
  });

  it('a bank transfer waits for the lock and is recorded as NOT_PAYABLE for an order cancelled meanwhile', async () => {
    const { customer, order: placed } = await placeOrder(t, b);
    const qr = await createQr(t, customer, placed.id);

    await requestWhileRowLocked(t.dataSource, { table: 'orders', id: placed.id }, () => sendTransfer(t, qr), markCancelled(placed.id));

    expect(await t.dataSource.query('SELECT verification_status FROM payment_transactions')).toEqual([
      { verification_status: 'NOT_PAYABLE' },
    ]);
    expect(await order(placed.id)).toEqual({ status: 'cancelled', payment_status: 'unpaid' });
  });
});
