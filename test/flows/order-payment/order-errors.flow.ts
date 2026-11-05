import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { placeAndPayOrder, placeOrder } from './steps';

const UNKNOWN_ID = 'zzzzzzzzzzzzzzzz';

describe('Flow: order error codes', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  const error = (res: { status: number; body: { errorCode: number; message: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });

  it('answers 404 / 1301 for an unknown order on detail and cancel', async () => {
    const user = await b.user();

    const detail = await t.api.get(`/api/orders/${UNKNOWN_ID}`).set(bearer(t, user));
    const cancel = await t.api.patch(`/api/orders/${UNKNOWN_ID}/cancel`).set(bearer(t, user));

    expect(error(detail)).toEqual({ status: 404, errorCode: 1301, message: 'Order not found' });
    expect(error(cancel)).toEqual({ status: 404, errorCode: 1301, message: 'Order not found' });
  });

  it("answers 404 / 2101 when checking out with another user's address", async () => {
    const [user, other] = [await b.user(), await b.user()];
    await b.cart(user, [{ product: await b.product() }]);
    const foreign = await b.address(other);

    const res = await t.api.post('/api/orders').set(bearer(t, user)).send({ addressId: foreign.id });

    expect(error(res)).toEqual({ status: 404, errorCode: 2101, message: 'Address not found' });
  });

  it('answers 400 / 1309 when the cart is empty', async () => {
    const user = await b.user();
    const address = await b.address(user);

    const res = await t.api.post('/api/orders').set(bearer(t, user)).send({ addressId: address.id });

    expect(error(res)).toEqual({ status: 400, errorCode: 1309, message: 'Cart is empty' });
  });

  it('answers 400 / 1308 when selected cart items are not in the cart, and keeps the cart', async () => {
    const user = await b.user();
    const address = await b.address(user);
    await b.cart(user, [{ product: await b.product() }]);

    const res = await t.api
      .post('/api/orders')
      .set(bearer(t, user))
      .send({ addressId: address.id, cartItemIds: [UNKNOWN_ID] });

    expect(error(res)).toEqual({ status: 400, errorCode: 1308, message: 'Some selected cart items do not exist in your cart' });
    expect(await t.dataSource.query('SELECT 1 FROM cart_items')).toHaveLength(1);
    expect(await t.dataSource.query('SELECT 1 FROM orders')).toHaveLength(0);
  });

  it('answers 400 / 1310 naming the product when a cart product is no longer active', async () => {
    const user = await b.user();
    const address = await b.address(user);
    const product = await b.product({ status: 'disabled', name: 'Retired Tee' });
    await b.cart(user, [{ product }]);

    const res = await t.api.post('/api/orders').set(bearer(t, user)).send({ addressId: address.id });

    expect(error(res)).toEqual({ status: 400, errorCode: 1310, message: 'Some products are no longer available: Retired Tee' });
    expect(await t.dataSource.query('SELECT 1 FROM orders')).toHaveLength(0);
  });

  it('answers 400 / 1311 when a customer cancels an unpaid order that is no longer pending', async () => {
    const admin = await b.admin();
    const { customer, order } = await placeOrder(t, b);
    await t.api.patch(`/api/admin/orders/${order.id}/status`).set(bearer(t, admin)).send({ status: 'confirmed' }).expect(200);

    const res = await t.api.patch(`/api/orders/${order.id}/cancel`).set(bearer(t, customer));

    expect(error(res)).toEqual({ status: 400, errorCode: 1311, message: 'Only pending orders can be cancelled' });
  });

  it('answers 400 / 1312 when a customer cancels a paid order that the shop already cancelled', async () => {
    const admin = await b.admin();
    const { customer, order } = await placeAndPayOrder(t, b);
    await t.api.patch(`/api/admin/orders/${order.id}/status`).set(bearer(t, admin)).send({ status: 'cancelled' }).expect(200);

    const res = await t.api.patch(`/api/orders/${order.id}/cancel`).set(bearer(t, customer));

    expect(error(res)).toEqual({ status: 400, errorCode: 1312, message: 'Order has already been cancelled' });
  });
});
