import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';

const UNKNOWN_ID = 'zzzzzzzzzzzzzzzz';

describe('Flow: cart error codes', () => {
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

  it('answers 404 / 2001 when the user has no cart yet (update and remove)', async () => {
    const user = await b.user();

    const update = await t.api.patch(`/api/cart/items/${UNKNOWN_ID}`).set(bearer(t, user)).send({ quantity: 2 });
    const remove = await t.api.delete(`/api/cart/items/${UNKNOWN_ID}`).set(bearer(t, user));

    expect(error(update)).toEqual({ status: 404, errorCode: 2001, message: 'Cart not found' });
    expect(error(remove)).toEqual({ status: 404, errorCode: 2001, message: 'Cart not found' });
  });

  it('answers 404 / 2002 for an unknown cart item, including an item of another cart', async () => {
    const [user, other] = [await b.user(), await b.user()];
    await b.cart(user, [{ product: await b.product() }]);
    const { items } = await b.cart(other, [{ product: await b.product() }]);

    for (const itemId of [UNKNOWN_ID, items[0].id]) {
      const update = await t.api.patch(`/api/cart/items/${itemId}`).set(bearer(t, user)).send({ quantity: 2 });
      const remove = await t.api.delete(`/api/cart/items/${itemId}`).set(bearer(t, user));
      expect(error(update)).toEqual({ status: 404, errorCode: 2002, message: 'Cart item not found' });
      expect(error(remove)).toEqual({ status: 404, errorCode: 2002, message: 'Cart item not found' });
    }
    expect(await t.dataSource.query('SELECT quantity FROM cart_items ORDER BY id')).toHaveLength(2);
  });

  it('answers 400 / 2003 when adding a product that is not active, and adds nothing', async () => {
    const user = await b.user();
    const product = await b.product({ status: 'disabled' });

    const res = await t.api.post('/api/cart/items').set(bearer(t, user)).send({ productId: product.id });

    expect(error(res)).toEqual({ status: 400, errorCode: 2003, message: 'Product is not available' });
    expect(await t.dataSource.query('SELECT 1 FROM cart_items')).toHaveLength(0);
  });
});
