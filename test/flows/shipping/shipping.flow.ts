import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { deliveredPaidOrder } from '../order-payment/steps';

/** Batch 23 (shipping): thông tin giao hàng công khai và việc nó đi theo cấu hình admin. */
describe('Flow: shipping info', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  type User = Awaited<ReturnType<Builders['user']>>;
  const rows = <R>(sql: string, params: unknown[] = []) => t.dataSource.query(sql, params) as Promise<R[]>;
  const shipping = () => t.api.get('/api/shipping');
  const setConfig = (admin: User, key: string, value: object) =>
    t.api
      .put(`/api/admin/site-config/${key}`)
      .set(bearer(t, admin))
      .send({ value: JSON.stringify(value) });
  const method = (id: string, priceVnd: number, icon: string, extra: object = {}) => ({
    id,
    name: `${id} name`,
    description: `${id} description`,
    estimatedDays: '1-2 days',
    priceVnd,
    icon,
    ...extra,
  });
  const config = (extra: object = {}) => ({
    freeShippingThresholdVnd: 500_000,
    methods: [method('standard', 40_000, 'truck'), method('express', 80_000, 'express'), method('store-pickup', 0, 'store')],
    ...extra,
  });

  it('answers the default methods, threshold and return policy with Vnd/Usd pairs when nothing is configured, without a token', async () => {
    const res = await shipping().expect(200);

    expect(res.body.data.methods).toEqual([
      {
        id: 'standard',
        name: 'Standard Shipping',
        description: 'Delivered in eco-friendly packaging',
        estimatedDays: '5-7 business days',
        priceVnd: 30_000,
        priceUsd: 1.2,
        icon: 'truck',
      },
      {
        id: 'express',
        name: 'Express Shipping',
        description: 'Priority handling and faster delivery',
        estimatedDays: '2-3 business days',
        priceVnd: 50_000,
        priceUsd: 2,
        icon: 'express',
      },
      {
        id: 'store-pickup',
        name: 'Store Pickup',
        description: 'Pick up at our flagship store',
        estimatedDays: '1-2 business days',
        priceVnd: 0,
        priceUsd: 0,
        icon: 'store',
      },
    ]);
    expect(res.body.data).toMatchObject({
      freeShippingThresholdVnd: 1_500_000,
      freeShippingThresholdUsd: 60,
      returnPolicy: { days: 30, conditions: expect.any(Array) },
    });
    expect(res.body.data.returnPolicy.conditions).toHaveLength(4);
    expect(Object.keys(res.body.data).sort()).toEqual(['freeShippingThresholdUsd', 'freeShippingThresholdVnd', 'methods', 'returnPolicy']);
    expect(res.body.data.methods[0]).not.toHaveProperty('price');
  });

  it('follows the admin configuration at once: prices, threshold, texts and return policy', async () => {
    const admin = await b.admin();
    await setConfig(
      admin,
      'SHIPPING_CONFIG',
      config({ returnPolicy: { days: 14, description: 'Đổi trả trong 14 ngày', conditions: ['Còn nguyên tem'] } }),
    ).expect(200);

    const res = await shipping().expect(200);

    expect(res.body.data.methods.map((m: { id: string; priceVnd: number; priceUsd: number }) => [m.id, m.priceVnd, m.priceUsd])).toEqual([
      ['standard', 40_000, 1.6],
      ['express', 80_000, 3.2],
      ['store-pickup', 0, 0],
    ]);
    expect(res.body.data.methods[0]).toMatchObject({
      name: 'standard name',
      description: 'standard description',
      estimatedDays: '1-2 days',
      icon: 'truck',
    });
    expect(res.body.data).toMatchObject({
      freeShippingThresholdVnd: 500_000,
      freeShippingThresholdUsd: 20,
      returnPolicy: { days: 14, description: 'Đổi trả trong 14 ngày', conditions: ['Còn nguyên tem'] },
    });
  });

  it('turns free shipping off with a null threshold (both currencies null) and fills the default return policy when it is left out', async () => {
    const admin = await b.admin();
    await setConfig(admin, 'SHIPPING_CONFIG', config({ freeShippingThresholdVnd: null })).expect(200);

    const res = await shipping().expect(200);

    expect(res.body.data).toMatchObject({ freeShippingThresholdVnd: null, freeShippingThresholdUsd: null, returnPolicy: { days: 30 } });
  });

  it('derives every USD amount from the current exchange rate', async () => {
    const admin = await b.admin();
    await setConfig(admin, 'EXCHANGE_RATE', { vndPerUsd: 20_000 }).expect(200);

    const res = await shipping().expect(200);

    expect(res.body.data.methods.map((m: { priceUsd: number }) => m.priceUsd)).toEqual([1.5, 2.5, 0]);
    expect(res.body.data.freeShippingThresholdUsd).toBe(75);
  });

  it('falls back to the defaults when the stored value is broken or the row is deleted, instead of failing', async () => {
    const admin = await b.admin();
    await rows(
      `INSERT INTO site_configs (id, key, type, value, created_at, updated_at) VALUES ('sc00000000000001', 'SHIPPING_CONFIG', 'SHIPPING', '{broken', now(), now())`,
    );
    const broken = await shipping().expect(200);
    await rows(`UPDATE site_configs SET value = '{"freeShippingThresholdVnd":1,"methods":[]}'`);
    const invalid = await shipping().expect(200);
    await setConfig(admin, 'SHIPPING_CONFIG', config()).expect(200);
    await t.api.delete('/api/admin/site-config/SHIPPING_CONFIG').set(bearer(t, admin)).expect(200);
    const deleted = await shipping().expect(200);

    for (const res of [broken, invalid, deleted])
      expect(res.body.data).toMatchObject({
        freeShippingThresholdVnd: 1_500_000,
        methods: [{ priceVnd: 30_000 }, { priceVnd: 50_000 }, { priceVnd: 0 }],
      });
  });

  it('is the same source the checkout quote uses: the fee and the free-shipping threshold follow the configuration', async () => {
    const [admin, customer] = [await b.admin(), await b.user()];
    await setConfig(admin, 'SHIPPING_CONFIG', config({ freeShippingThresholdVnd: 700_000 })).expect(200);
    await b.cart(customer, [{ product: await b.product({ price: 350_000 }), quantity: 1 }]);

    const paid = await t.api.post('/api/orders/quote').set(bearer(t, customer)).send({}).expect(200);
    await b.cart(customer, [{ product: await b.product({ price: 350_000 }), quantity: 1 }]);
    const free = await t.api.post('/api/orders/quote').set(bearer(t, customer)).send({}).expect(200);

    expect(paid.body.data).toMatchObject({ shippingFeeVnd: 40_000, freeShipping: false, freeShippingThresholdVnd: 700_000 });
    expect(free.body.data).toMatchObject({ shippingFeeVnd: 0, freeShipping: true });
  });

  it('sets the return window used by the returns module (days counted from delivery)', async () => {
    const admin = await b.admin();
    const entry = await deliveredPaidOrder(t, b);
    await rows(`UPDATE orders SET delivered_at = now() - interval '3 days' WHERE id = $1`, [entry.order.id]);
    const eligibility = () => t.api.get(`/api/returns/eligibility/${entry.order.id}`).set(bearer(t, entry.customer)).expect(200);
    expect((await eligibility()).body.data).toMatchObject({ eligible: true, returnWindowDays: 30 });

    await setConfig(admin, 'SHIPPING_CONFIG', config({ returnPolicy: { days: 2, description: '', conditions: [] } })).expect(200);

    expect((await eligibility()).body.data).toMatchObject({ eligible: false, reason: 'RETURN_WINDOW_EXPIRED', returnWindowDays: 2 });
  });
});
