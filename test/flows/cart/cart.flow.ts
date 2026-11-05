import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';

/** Batch 08 (cart): xem, thêm, đổi số lượng, xoá dòng, xoá sạch. Mã 2001–2003 còn được ghim ở `cart-errors.flow.ts`. */
describe('Flow: cart', () => {
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
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const getCart = (user: User) => t.api.get('/api/cart').set(bearer(t, user));
  const add = (user: User, body: object) => t.api.post('/api/cart/items').set(bearer(t, user)).send(body);
  const update = (user: User, itemId: string, body: object) => t.api.patch(`/api/cart/items/${itemId}`).set(bearer(t, user)).send(body);
  const remove = (user: User, itemId: string) => t.api.delete(`/api/cart/items/${itemId}`).set(bearer(t, user));
  const lines = () =>
    rows<{ product_id: string; quantity: number; size: string; color: string }>(
      'SELECT product_id, quantity, size, color FROM cart_items ORDER BY created_at, id',
    );
  const EMPTY = { items: [], itemCount: 0, subtotalVnd: 0, subtotalUsd: 0 };

  describe('GET /api/cart', () => {
    it('returns the empty shape when the user has no cart, and creates nothing', async () => {
      const user = await b.user();

      const res = await getCart(user).expect(200);

      expect(res.body.data).toEqual(EMPTY);
      expect(await rows('SELECT 1 FROM carts')).toHaveLength(0);
    });

    it('returns lines with the product, line totals and subtotal as Vnd/Usd pairs, newest rate applied', async () => {
      const user = await b.user();
      const [shirt, hat] = [await b.product({ price: 350_000 }), await b.product({ price: 120_000 })];
      await b.cart(user, [
        { product: shirt, quantity: 2, size: 'M', color: 'Black' },
        { product: hat, quantity: 1, size: 'S', color: 'Red' },
      ]);

      const res = await getCart(user).expect(200);

      expect(res.body.data).toMatchObject({ id: expect.any(String), itemCount: 3, subtotalVnd: 820_000, subtotalUsd: 32.8 });
      expect(res.body.data.items).toHaveLength(2);
      const byProduct = (id: string) => res.body.data.items.find((line: { productId: string }) => line.productId === id);
      expect(byProduct(shirt.id)).toMatchObject({
        quantity: 2,
        size: 'M',
        color: 'Black',
        lineTotalVnd: 700_000,
        lineTotalUsd: 28,
        product: { id: shirt.id, priceVnd: 350_000, priceUsd: 14 },
      });
      expect(byProduct(shirt.id).product.category).toEqual(expect.objectContaining({ slug: expect.any(String) }));
      expect(byProduct(shirt.id).product.subcategory).toEqual(expect.objectContaining({ slug: expect.any(String) }));
      expect(byProduct(hat.id)).toMatchObject({ quantity: 1, size: 'S', color: 'Red', lineTotalVnd: 120_000, lineTotalUsd: 4.8 });
    });

    it('derives the subtotal USD from the VND total, not from the rounded line USD', async () => {
      const user = await b.user();
      const products = [await b.product({ price: 1_100 }), await b.product({ price: 1_100 })];
      await b.cart(
        user,
        products.map((product) => ({ product })),
      );

      const res = await getCart(user).expect(200);

      expect(res.body.data.items.map((line: { lineTotalUsd: number }) => line.lineTotalUsd)).toEqual([0.04, 0.04]);
      expect(res.body.data).toMatchObject({ subtotalVnd: 2_200, subtotalUsd: 0.09 });
    });

    it('prices lines at the product’s current price and shows only my own cart', async () => {
      const [user, other] = [await b.user(), await b.user()];
      const product = await b.product({ price: 350_000 });
      await b.cart(user, [{ product }]);
      await b.cart(other, [{ product: await b.product(), quantity: 5 }]);
      await rows('UPDATE products SET price = 400000 WHERE id = $1', [product.id]);

      const res = await getCart(user).expect(200);

      expect(res.body.data).toMatchObject({ itemCount: 1, subtotalVnd: 400_000 });
      expect(res.body.data.items).toHaveLength(1);
    });
  });

  describe('POST /api/cart/items', () => {
    it('creates the cart and a line with the defaults (quantity 1, empty size and colour)', async () => {
      const user = await b.user();
      const product = await b.product();

      const res = await add(user, { productId: product.id }).expect(201);

      expect(res.body.data).toMatchObject({
        itemCount: 1,
        subtotalVnd: 350_000,
        items: [{ productId: product.id, quantity: 1, size: '', color: '' }],
      });
      expect(await lines()).toEqual([{ product_id: product.id, quantity: 1, size: '', color: '' }]);
      expect(await rows('SELECT user_id FROM carts')).toEqual([{ user_id: user.id }]);
    });

    it('adds up the same product, size and colour, and keeps a different size or colour as another line', async () => {
      const user = await b.user();
      const product = await b.product();
      await add(user, { productId: product.id, quantity: 2, size: 'M', color: 'Black' }).expect(201);

      const same = await add(user, { productId: product.id, quantity: 3, size: 'M', color: 'Black' }).expect(201);
      await add(user, { productId: product.id, size: 'L', color: 'Black' }).expect(201);
      await add(user, { productId: product.id, size: 'M', color: 'White' }).expect(201);

      expect(same.body.data.items).toHaveLength(1);
      expect(same.body.data.items[0].quantity).toBe(5);
      expect((await lines()).map((line) => [line.size, line.color, line.quantity])).toEqual([
        ['M', 'Black', 5],
        ['L', 'Black', 1],
        ['M', 'White', 1],
      ]);
    });

    it('accepts the limits: quantity 1 and 99, size 50 and colour 100 characters', async () => {
      const user = await b.user();
      const product = await b.product();

      await add(user, { productId: product.id, quantity: 99, size: 'x'.repeat(50), color: 'y'.repeat(100) }).expect(201);
      await add(user, { productId: product.id, quantity: 1 }).expect(201);

      expect((await lines()).map((line) => line.quantity)).toEqual([99, 1]);
    });

    describe('quantity limit of 99 per line', () => {
      const quantityOf = (userId: string) =>
        rows<{ quantity: number }>(
          'SELECT quantity FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1) ORDER BY size, color',
          [userId],
        ).then((r) => r.map((row) => row.quantity));

      it('allows the total to reach exactly 99', async () => {
        const [user, product] = [await b.user(), await b.product()];
        await add(user, { productId: product.id, quantity: 98 }).expect(201);

        const res = await add(user, { productId: product.id }).expect(201);

        expect(res.body.data.items[0].quantity).toBe(99);
        expect(await quantityOf(user.id)).toEqual([99]);
      });

      it.each([
        [99, 1],
        [98, 2],
        [50, 50],
        [1, 99],
      ])('refuses to go over 99 when a line holds %i and %i more are added (400 / 2004) and leaves the cart unchanged', async (existing, extra) => {
        const [user, product] = [await b.user(), await b.product()];
        await add(user, { productId: product.id, quantity: existing }).expect(201);

        const res = await add(user, { productId: product.id, quantity: extra });

        expect(error(res)).toEqual({ status: 400, errorCode: 2004, message: 'Cart item quantity limit (99) reached' });
        expect(await quantityOf(user.id)).toEqual([existing]);
      });

      it('counts the limit per line: another size or colour of the same product is a separate line', async () => {
        const [user, product] = [await b.user(), await b.product()];
        await add(user, { productId: product.id, quantity: 99, size: 'M' }).expect(201);

        await add(user, { productId: product.id, quantity: 99, size: 'L' }).expect(201);
        const full = await add(user, { productId: product.id, size: 'M' });

        expect(error(full)).toMatchObject({ status: 400, errorCode: 2004 });
        expect(await quantityOf(user.id)).toEqual([99, 99]);
      });

      it('still lets the quantity be set directly to 99 or lowered afterwards', async () => {
        const [user, product] = [await b.user(), await b.product()];
        const { items } = await b.cart(user, [{ product, quantity: 99 }]);

        await add(user, { productId: product.id, size: 'M', color: 'Black' }).expect(400);
        await update(user, items[0].id, { quantity: 10 }).expect(200);
        await add(user, { productId: product.id, quantity: 89, size: 'M', color: 'Black' }).expect(201);

        expect(await quantityOf(user.id)).toEqual([99]);
      });

      it('never loses an add when requests arrive at the same time: 6 adds of 1 on an existing line make 7', async () => {
        const [user, product] = [await b.user(), await b.product()];
        await add(user, { productId: product.id }).expect(201);

        const results = await Promise.all(Array.from({ length: 6 }, () => add(user, { productId: product.id })));

        expect(results.map((res) => res.status)).toEqual([201, 201, 201, 201, 201, 201]);
        expect(await quantityOf(user.id)).toEqual([7]);
      });

      it('creates the cart and the line once when the first adds arrive together (no 500)', async () => {
        const [user, product] = [await b.user(), await b.product()];

        const results = await Promise.all(Array.from({ length: 4 }, () => add(user, { productId: product.id })));

        expect(results.map((res) => res.status)).toEqual([201, 201, 201, 201]);
        expect(await quantityOf(user.id)).toEqual([4]);
        expect(await rows('SELECT 1 FROM carts')).toHaveLength(1);
      });

      it('lets only one of two simultaneous adds go through when together they would pass 99', async () => {
        const [user, product] = [await b.user(), await b.product()];

        const results = await Promise.all([
          add(user, { productId: product.id, quantity: 60 }),
          add(user, { productId: product.id, quantity: 60 }),
        ]);

        expect(results.map((res) => res.status).sort()).toEqual([201, 400]);
        expect(results.find((res) => res.status === 400)?.body.errorCode).toBe(2004);
        expect(await quantityOf(user.id)).toEqual([60]);
      });
    });

    it('answers 404 / 1001 for an unknown product, 400 / 2003 for a disabled one and 400 / 1303 for sold-out or custom-order badges', async () => {
      const user = await b.user();
      const [disabled, soldOut, custom, onSale] = [
        await b.product({ status: 'disabled' }),
        await b.product({ badge: 'sold_out' }),
        await b.product({ badge: 'custom_order' }),
        await b.product({ badge: 'sale' }),
      ];

      const unknown = await add(user, { productId: 'zzzzzzzzzzzzzzzz' });
      const off = await add(user, { productId: disabled.id });
      const gone = await add(user, { productId: soldOut.id });
      const made = await add(user, { productId: custom.id });

      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1001 });
      expect(error(off)).toMatchObject({ status: 400, errorCode: 2003 });
      expect(error(gone)).toMatchObject({ status: 400, errorCode: 1303 });
      expect(error(made)).toMatchObject({ status: 400, errorCode: 1303 });
      expect(await lines()).toHaveLength(0);
      await add(user, { productId: onSale.id }).expect(201);
    });

    it.each([
      ['a missing productId', () => ({})],
      ['an empty productId', () => ({ productId: '' })],
      ['a productId longer than 16 characters', () => ({ productId: 'x'.repeat(17) })],
      ['a zero quantity', (id: string) => ({ productId: id, ...{ quantity: 0 } })],
      ['a quantity above 99', (id: string) => ({ productId: id, ...{ quantity: 100 } })],
      ['a fractional quantity', (id: string) => ({ productId: id, ...{ quantity: 1.5 } })],
      ['a string quantity', (id: string) => ({ productId: id, ...{ quantity: '2' } })],
      ['a size longer than 50 characters', (id: string) => ({ productId: id, ...{ size: 'x'.repeat(51) } })],
      ['a colour longer than 100 characters', (id: string) => ({ productId: id, ...{ color: 'x'.repeat(101) } })],
      ['an unknown field', (id: string) => ({ productId: id, ...{ price: 1 } })],
    ])('rejects %s with a validation error (no errorCode) and adds nothing', async (_name, body) => {
      const user = await b.user();
      const product = await b.product();

      const res = await add(user, body(product.id));

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await lines()).toHaveLength(0);
    });
  });

  describe('PATCH /api/cart/items/:itemId', () => {
    it('sets the quantity (does not add up) and returns the recalculated cart', async () => {
      const user = await b.user();
      const { items } = await b.cart(user, [{ product: await b.product(), quantity: 2 }]);

      const res = await update(user, items[0].id, { quantity: 5 }).expect(200);
      const same = await update(user, items[0].id, { quantity: 5 }).expect(200);

      expect(res.body.data).toMatchObject({
        itemCount: 5,
        subtotalVnd: 1_750_000,
        items: [{ id: items[0].id, quantity: 5, lineTotalVnd: 1_750_000 }],
      });
      expect(same.body.data.itemCount).toBe(5);
      expect((await lines())[0].quantity).toBe(5);
    });

    it('accepts the limits 1 and 99', async () => {
      const user = await b.user();
      const { items } = await b.cart(user, [{ product: await b.product() }]);

      await update(user, items[0].id, { quantity: 99 }).expect(200);
      await update(user, items[0].id, { quantity: 1 }).expect(200);

      expect((await lines())[0].quantity).toBe(1);
    });

    it('does not touch another user’s line (404 / 2002) or an unknown one, and answers 404 / 2001 without a cart', async () => {
      const [user, other, empty] = [await b.user(), await b.user(), await b.user()];
      await b.cart(user, [{ product: await b.product() }]);
      const { items } = await b.cart(other, [{ product: await b.product(), quantity: 2 }]);

      const foreign = await update(user, items[0].id, { quantity: 9 });
      const unknown = await update(user, 'zzzzzzzzzzzzzzzz', { quantity: 9 });
      const noCart = await update(empty, items[0].id, { quantity: 9 });

      expect(error(foreign)).toMatchObject({ status: 404, errorCode: 2002 });
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 2002 });
      expect(error(noCart)).toMatchObject({ status: 404, errorCode: 2001 });
      expect((await lines()).map((line) => line.quantity)).toEqual([1, 2]);
    });

    it.each([
      ['a missing quantity', {}],
      ['a zero quantity', { quantity: 0 }],
      ['a quantity above 99', { quantity: 100 }],
      ['a fractional quantity', { quantity: 1.5 }],
      ['a string quantity', { quantity: '3' }],
      ['an unknown field', { quantity: 2, size: 'L' }],
    ])('rejects %s with a validation error (no errorCode) and keeps the quantity', async (_name, body) => {
      const user = await b.user();
      const { items } = await b.cart(user, [{ product: await b.product(), quantity: 2 }]);

      const res = await update(user, items[0].id, body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect((await lines())[0].quantity).toBe(2);
    });
  });

  describe('DELETE /api/cart/items/:itemId', () => {
    it('removes one line, keeps the others and returns the recalculated cart', async () => {
      const user = await b.user();
      const [shirt, hat] = [await b.product({ price: 350_000 }), await b.product({ price: 120_000 })];
      const { items } = await b.cart(user, [{ product: shirt, quantity: 2 }, { product: hat }]);

      const res = await remove(user, items[0].id).expect(200);

      expect(res.body.data).toMatchObject({ itemCount: 1, subtotalVnd: 120_000, items: [{ productId: hat.id }] });
      expect(await lines()).toHaveLength(1);
      expect(await rows('SELECT 1 FROM carts')).toHaveLength(1);
    });

    it('removing the last line leaves an empty cart', async () => {
      const user = await b.user();
      const { items } = await b.cart(user, [{ product: await b.product() }]);

      const res = await remove(user, items[0].id).expect(200);

      expect(res.body.data).toMatchObject({ items: [], itemCount: 0, subtotalVnd: 0, subtotalUsd: 0 });
    });

    it('does not remove another user’s line (404 / 2002), an unknown one, and answers 404 / 2001 without a cart', async () => {
      const [user, other, empty] = [await b.user(), await b.user(), await b.user()];
      await b.cart(user, [{ product: await b.product() }]);
      const { items } = await b.cart(other, [{ product: await b.product() }]);

      expect(error(await remove(user, items[0].id))).toMatchObject({ status: 404, errorCode: 2002 });
      expect(error(await remove(user, 'zzzzzzzzzzzzzzzz'))).toMatchObject({ status: 404, errorCode: 2002 });
      expect(error(await remove(empty, items[0].id))).toMatchObject({ status: 404, errorCode: 2001 });
      expect(await lines()).toHaveLength(2);
    });
  });

  describe('DELETE /api/cart/clear', () => {
    it('removes every line but keeps the cart, and leaves other users’ carts alone', async () => {
      const [user, other] = [await b.user(), await b.user()];
      await b.cart(user, [{ product: await b.product() }, { product: await b.product(), quantity: 3 }]);
      await b.cart(other, [{ product: await b.product() }]);

      const res = await t.api.delete('/api/cart/clear').set(bearer(t, user)).expect(200);

      expect(res.body.data).toEqual(EMPTY);
      expect(await rows('SELECT user_id FROM carts ORDER BY user_id')).toHaveLength(2);
      expect(await lines()).toHaveLength(1);
      expect((await getCart(user).expect(200)).body.data).toMatchObject({ items: [], itemCount: 0 });
      expect((await getCart(other).expect(200)).body.data.itemCount).toBe(1);
    });

    it('is a no-op for an empty or missing cart and can be repeated', async () => {
      const user = await b.user();

      const first = await t.api.delete('/api/cart/clear').set(bearer(t, user)).expect(200);
      await add(user, { productId: (await b.product()).id }).expect(201);
      await t.api.delete('/api/cart/clear').set(bearer(t, user)).expect(200);
      const again = await t.api.delete('/api/cart/clear').set(bearer(t, user)).expect(200);

      expect(first.body.data).toEqual(EMPTY);
      expect(again.body.data).toEqual(EMPTY);
      expect(await lines()).toHaveLength(0);
    });
  });
});
