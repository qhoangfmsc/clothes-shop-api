import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { placeOrder } from './steps';

describe('Flow: admin order status transitions', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  const setStatus = (admin: Awaited<ReturnType<Builders['admin']>>, orderId: string, status: string) =>
    t.api.patch(`/api/admin/orders/${orderId}/status`).set(bearer(t, admin)).send({ status });
  const row = (id: string) =>
    t.dataSource
      .query('SELECT status, delivered_at FROM orders WHERE id = $1', [id])
      .then((rows: { status: string; delivered_at: Date | null }[]) => rows[0]);

  it('walks pending → confirmed → shipping → delivered → completed and stamps deliveredAt on delivery', async () => {
    const admin = await b.admin();
    const { order } = await placeOrder(t, b);

    for (const status of ['confirmed', 'shipping']) {
      const res = await setStatus(admin, order.id, status).expect(200);
      expect(res.body.data.status).toBe(status);
    }
    expect((await row(order.id)).delivered_at).toBeNull();

    await setStatus(admin, order.id, 'delivered').expect(200);
    expect((await row(order.id)).delivered_at).not.toBeNull();

    await setStatus(admin, order.id, 'completed').expect(200);
    expect((await row(order.id)).status).toBe('completed');
  });

  it('rejects skipping a step with 400 / 1302 and lists the allowed transitions', async () => {
    const admin = await b.admin();
    const { order } = await placeOrder(t, b);

    const res = await setStatus(admin, order.id, 'delivered');

    expect({ status: res.status, errorCode: res.body.errorCode, message: res.body.message }).toEqual({
      status: 400,
      errorCode: 1302,
      message: "Cannot change status from 'pending' to 'delivered'. Allowed transitions: confirmed, cancelled",
    });
    expect((await row(order.id)).status).toBe('pending');
  });

  it('rejects any move out of a terminal state (cancelled) with "Allowed transitions: none"', async () => {
    const admin = await b.admin();
    const { order } = await placeOrder(t, b);
    await setStatus(admin, order.id, 'cancelled').expect(200);

    const res = await setStatus(admin, order.id, 'confirmed');

    expect({ status: res.status, errorCode: res.body.errorCode, message: res.body.message }).toEqual({
      status: 400,
      errorCode: 1302,
      message: "Cannot change status from 'cancelled' to 'confirmed'. Allowed transitions: none",
    });
  });

  it('rejects a status value that does not exist with a validation error', async () => {
    const admin = await b.admin();
    const { order } = await placeOrder(t, b);

    const res = await setStatus(admin, order.id, 'teleported');

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBeUndefined();
    expect(JSON.stringify(res.body.message)).toContain('status');
    expect((await row(order.id)).status).toBe('pending');
  });

  it('answers an unknown order with 400 / 1301 (admin routes do not pass 404 today)', async () => {
    const admin = await b.admin();

    const res = await setStatus(admin, 'zzzzzzzzzzzzzzzz', 'confirmed');

    expect({ status: res.status, errorCode: res.body.errorCode }).toEqual({ status: 400, errorCode: 1301 });
  });
});
