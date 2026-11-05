import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';

/** Batch 04 (order): báo giá, đặt hàng, snapshot của đơn và lỗi/validation của danh sách đơn. */
describe('Flow: quote and checkout (customer)', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  type Customer = Awaited<ReturnType<Builders['user']>>;
  const rows = <R>(sql: string, params: unknown[] = []) => t.dataSource.query(sql, params) as Promise<R[]>;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const quote = (customer: Customer, body: object = {}) => t.api.post('/api/orders/quote').set(bearer(t, customer)).send(body);
  const checkout = (customer: Customer, body: object) => t.api.post('/api/orders').set(bearer(t, customer)).send(body);
  /** Giỏ với các dòng 350.000đ × số lượng cho trước */
  async function cartOf(customer: Customer, quantities: number[]) {
    const products = await Promise.all(quantities.map(() => b.product({ price: 350_000 })));
    return b.cart(
      customer,
      quantities.map((quantity, index) => ({ product: products[index], quantity })),
    );
  }

  describe('POST /api/orders/quote', () => {
    it('prices the whole cart in both currencies with the standard fee, without touching anything', async () => {
      const customer = await b.user();
      await cartOf(customer, [2]);

      const res = await quote(customer).expect(200);

      expect(res.body.data).toEqual({
        shippingMethod: 'standard',
        subtotalVnd: 700_000,
        subtotalUsd: 28,
        shippingFeeVnd: 30_000,
        shippingFeeUsd: 1.2,
        totalVnd: 730_000,
        totalUsd: 29.2,
        freeShipping: false,
        freeShippingThresholdVnd: 1_500_000,
        freeShippingThresholdUsd: 60,
        exchangeRate: 25_000,
      });
      expect(await rows('SELECT 1 FROM orders')).toHaveLength(0);
      expect(await rows('SELECT 1 FROM cart_items')).toHaveLength(1);
    });

    it.each([
      ['express', 50_000],
      ['store-pickup', 0],
    ])('charges the %s fee', async (shippingMethod, fee) => {
      const customer = await b.user();
      await cartOf(customer, [1]);

      const res = await quote(customer, { shippingMethod }).expect(200);

      expect(res.body.data).toMatchObject({ shippingMethod, shippingFeeVnd: fee, totalVnd: 350_000 + fee });
    });

    it('waives shipping from the free-shipping threshold, and prices only the selected cart items', async () => {
      const customer = await b.user();
      const { items } = await cartOf(customer, [5, 1]);

      const all = await quote(customer).expect(200);
      const onlySmall = await quote(customer, { cartItemIds: [items[1].id] }).expect(200);

      expect(all.body.data).toMatchObject({ subtotalVnd: 2_100_000, shippingFeeVnd: 0, freeShipping: true, totalVnd: 2_100_000 });
      expect(onlySmall.body.data).toMatchObject({ subtotalVnd: 350_000, shippingFeeVnd: 30_000, freeShipping: false });
    });

    it('waives shipping exactly at the threshold and not one dong below it', async () => {
      const [atThreshold, below] = [await b.user(), await b.user()];
      await b.cart(atThreshold, [{ product: await b.product({ price: 1_500_000 }) }]);
      await b.cart(below, [{ product: await b.product({ price: 1_499_999 }) }]);

      const at = await quote(atThreshold).expect(200);
      const under = await quote(below).expect(200);

      expect(at.body.data).toMatchObject({ freeShipping: true, shippingFeeVnd: 0, totalVnd: 1_500_000 });
      expect(under.body.data).toMatchObject({ freeShipping: false, shippingFeeVnd: 30_000, totalVnd: 1_529_999 });
    });

    it('uses the current exchange rate for the USD values', async () => {
      const customer = await b.user();
      await cartOf(customer, [2]);
      await t.dataSource.query(`INSERT INTO site_configs (id, key, type, value, created_at, updated_at) VALUES ('exrate0000000001', 'EXCHANGE_RATE', 'CURRENCY', '{"vndPerUsd":20000}', now(), now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);

      const res = await quote(customer).expect(200);

      expect(res.body.data).toMatchObject({ exchangeRate: 20_000, totalVnd: 730_000, totalUsd: 36.5 });
    });

    it('refuses what checkout would refuse: empty cart, foreign items, inactive and non-orderable products', async () => {
      const customer = await b.user();
      expect(error(await quote(customer))).toMatchObject({ status: 400, errorCode: 1309 });

      const { items } = await cartOf(customer, [1]);
      expect(error(await quote(customer, { cartItemIds: [items[0].id, 'zzzzzzzzzzzzzzzz'] }))).toMatchObject({
        status: 400,
        errorCode: 1308,
      });

      await rows(`UPDATE products SET status = 'disabled' WHERE id = (SELECT product_id FROM cart_items LIMIT 1)`);
      expect(error(await quote(customer))).toMatchObject({ status: 400, errorCode: 1310 });

      const other = await b.user();
      await b.cart(other, [{ product: await b.product({ badge: 'sold_out' }) }]);
      expect(error(await quote(other))).toMatchObject({ status: 400, errorCode: 1303 });
    });

    it.each([
      ['an unknown shipping method', { shippingMethod: 'teleport' }],
      ['an empty cartItemIds', { cartItemIds: [] }],
      ['duplicate cartItemIds', { cartItemIds: ['abc', 'abc'] }],
      ['a cart item id longer than 16 characters', { cartItemIds: ['x'.repeat(17)] }],
      ['an unknown field', { coupon: 'FREE' }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, body) => {
      const customer = await b.user();
      await cartOf(customer, [1]);

      const res = await quote(customer, body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('POST /api/orders', () => {
    it('creates an express order that snapshots the address and the products, and empties the ordered lines', async () => {
      const customer = await b.user();
      const { items } = await cartOf(customer, [2]);
      const address = await b.address(customer, {
        fullName: 'Nguyen Van A',
        phone: '0911222333',
        city: 'Da Nang',
        addressLine1: '5 Bach Dang',
      });

      const res = await checkout(customer, { addressId: address.id, shippingMethod: 'express', note: 'Giao giờ hành chính' }).expect(201);

      expect(res.body.data).toMatchObject({
        status: 'pending',
        paymentStatus: 'unpaid',
        shippingMethod: 'express',
        note: 'Giao giờ hành chính',
        subtotalVnd: 700_000,
        shippingFeeVnd: 50_000,
        totalVnd: 750_000,
        exchangeRate: 25_000,
        shippingAddress: { fullName: 'Nguyen Van A', phone: '0911222333', city: 'Da Nang', addressLine1: '5 Bach Dang' },
      });
      expect(res.body.data.items).toEqual([
        expect.objectContaining({ quantity: 2, priceVnd: 350_000, priceUsd: 14, size: 'M', color: 'Black', productId: items[0].productId }),
      ]);
      expect(await rows('SELECT 1 FROM cart_items')).toHaveLength(0);
    });

    it('orders only the selected lines and leaves the rest in the cart', async () => {
      const customer = await b.user();
      const { items } = await cartOf(customer, [1, 3]);
      const address = await b.address(customer);

      const res = await checkout(customer, { addressId: address.id, cartItemIds: [items[1].id] }).expect(201);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0]).toMatchObject({ quantity: 3 });
      expect(await rows('SELECT id FROM cart_items')).toEqual([{ id: items[0].id }]);
    });

    it('takes a store-pickup order with only a contact, keeping just name and phone, and also with an address', async () => {
      const customer = await b.user();
      await cartOf(customer, [1]);

      const pickup = await checkout(customer, {
        shippingMethod: 'store-pickup',
        pickupContact: { fullName: ' Tran B ', phone: ' 0900111222 ' },
      }).expect(201);

      expect(pickup.body.data).toMatchObject({
        shippingMethod: 'store-pickup',
        shippingFeeVnd: 0,
        totalVnd: 350_000,
        shippingAddress: { fullName: 'Tran B', phone: '0900111222' },
      });
      expect(Object.keys(pickup.body.data.shippingAddress).sort()).toEqual(['fullName', 'phone']);

      await cartOf(customer, [1]);
      const withAddress = await checkout(customer, { shippingMethod: 'store-pickup', addressId: (await b.address(customer)).id }).expect(
        201,
      );
      expect(withAddress.body.data.shippingAddress).toMatchObject({ city: 'Ho Chi Minh' });
    });

    it('freezes the prices, the product name and the exchange rate at checkout', async () => {
      const customer = await b.user();
      const { items } = await cartOf(customer, [1]);
      const address = await b.address(customer);
      const placed = await checkout(customer, { addressId: address.id }).expect(201);
      const productName = (await rows<{ name: string }>('SELECT name FROM products WHERE id = $1', [items[0].productId]))[0].name;

      await rows(`UPDATE products SET price = 999000, name = 'Renamed' WHERE id = $1`, [items[0].productId]);
      await t.dataSource.query(`INSERT INTO site_configs (id, key, type, value, created_at, updated_at) VALUES ('exrate0000000002', 'EXCHANGE_RATE', 'CURRENCY', '{"vndPerUsd":20000}', now(), now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
      const detail = await t.api.get(`/api/orders/${placed.body.data.id}`).set(bearer(t, customer)).expect(200);

      expect(detail.body.data).toMatchObject({ exchangeRate: 25_000, totalVnd: 380_000, totalUsd: 15.2 });
      expect(detail.body.data.items[0]).toMatchObject({ productName, priceVnd: 350_000, priceUsd: 14 });
      expect(detail.body.data.items[0].product).toMatchObject({ name: 'Renamed' });
    });

    it('refuses wrong combinations of method, address and pickup contact (1304 / 1305 / 1306) and creates nothing', async () => {
      const customer = await b.user();
      await cartOf(customer, [1]);
      const address = await b.address(customer);
      const contact = { fullName: 'A', phone: '1' };

      expect(error(await checkout(customer, {}))).toMatchObject({ status: 400, errorCode: 1304 });
      expect(error(await checkout(customer, { addressId: address.id, pickupContact: contact }))).toMatchObject({
        status: 400,
        errorCode: 1306,
      });
      expect(error(await checkout(customer, { shippingMethod: 'store-pickup' }))).toMatchObject({ status: 400, errorCode: 1305 });
      expect(
        error(await checkout(customer, { shippingMethod: 'store-pickup', addressId: address.id, pickupContact: contact })),
      ).toMatchObject({ status: 400, errorCode: 1306 });
      expect(await rows('SELECT 1 FROM orders')).toHaveLength(0);
      expect(await rows('SELECT 1 FROM cart_items')).toHaveLength(1);
    });

    it('refuses a sold-out product (1303) and bad bodies, creating nothing', async () => {
      const customer = await b.user();
      await b.cart(customer, [{ product: await b.product({ badge: 'custom_order' }) }]);
      const address = await b.address(customer);

      expect(error(await checkout(customer, { addressId: address.id }))).toMatchObject({ status: 400, errorCode: 1303 });
      for (const body of [
        { addressId: address.id, shippingMethod: 'teleport' },
        { addressId: '' },
        { addressId: address.id, pickupContact: { fullName: '', phone: '1' } },
        { addressId: address.id, note: 'x'.repeat(501) },
      ]) {
        const res = await checkout(customer, body);
        expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      }
      expect(await rows('SELECT 1 FROM orders')).toHaveLength(0);
    });
  });

  describe('GET /api/orders (validation)', () => {
    it.each([
      ['an unknown status', { status: 'teleported' }],
      ['a sort field outside the whitelist', { sort: 'total' }],
      ['a limit above 200', { limit: 201 }],
      ['page 0', { page: 0 }],
      ['the removed `sorts` parameter', { sorts: 'createdAt' }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const customer = await b.user();

      const res = await t.api.get('/api/orders').query(query).set(bearer(t, customer));

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });

    it('returns an empty first page for a customer without orders', async () => {
      const customer = await b.user();

      const res = await t.api.get('/api/orders').set(bearer(t, customer)).expect(200);

      expect(res.body).toEqual({ data: [], total: 0, page: 1, limit: 25, totalPages: 0 });
    });
  });
});
