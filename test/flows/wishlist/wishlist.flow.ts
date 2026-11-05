import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';

/** Batch 19 (wishlist): danh sách, thêm, bỏ và kiểm tra sản phẩm yêu thích. */
describe('Flow: wishlist', () => {
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
  const list = (user: User) => t.api.get('/api/wishlist').set(bearer(t, user));
  const add = (user: User, productId: string) => t.api.post(`/api/wishlist/${productId}`).set(bearer(t, user));
  const remove = (user: User, productId: string) => t.api.delete(`/api/wishlist/${productId}`).set(bearer(t, user));
  const check = (user: User, productId: string) => t.api.get(`/api/wishlist/check/${productId}`).set(bearer(t, user));
  const entries = () => rows<{ user_id: string; product_id: string }>('SELECT user_id, product_id FROM wishlists ORDER BY product_id');

  describe('POST /api/wishlist/:productId', () => {
    it('adds the product for me and answers created: true', async () => {
      const [me, product] = [await b.user(), await b.product()];

      const res = await add(me, product.id).expect(201);

      expect(res.body).toMatchObject({
        created: true,
        data: { id: expect.any(String), userId: me.id, productId: product.id, createdAt: expect.any(String) },
      });
      expect(await entries()).toEqual([{ user_id: me.id, product_id: product.id }]);
    });

    it('is idempotent under a double click: simultaneous adds all succeed, one entry exists and only one answer says created: true', async () => {
      const [me, product] = [await b.user(), await b.product()];

      const results = await Promise.all(Array.from({ length: 4 }, () => add(me, product.id)));

      expect(results.map((res) => res.status)).toEqual([201, 201, 201, 201]);
      expect(results.filter((res) => res.body.created === true)).toHaveLength(1);
      expect(new Set(results.map((res) => res.body.data.id)).size).toBe(1);
      expect(await entries()).toHaveLength(1);
    });

    it('is idempotent: adding again answers created: false with the same entry and adds no row', async () => {
      const [me, product] = [await b.user(), await b.product()];
      const first = await add(me, product.id).expect(201);

      const again = await add(me, product.id).expect(201);

      expect(again.body).toMatchObject({ created: false, data: { id: first.body.data.id, productId: product.id } });
      expect(await entries()).toHaveLength(1);
    });

    it('lets different users keep the same product, and does not check the product status', async () => {
      const [a, c] = [await b.user(), await b.user()];
      const [product, disabled] = [await b.product(), await b.product({ status: 'disabled' })];

      await add(a, product.id).expect(201);
      await add(c, product.id).expect(201);
      await add(a, disabled.id).expect(201);

      expect(await entries()).toHaveLength(3);
    });

    it('answers 404 / 1001 for an unknown product and adds nothing', async () => {
      const me = await b.user();

      const res = await add(me, 'zzzzzzzzzzzzzzzz');

      expect(error(res)).toMatchObject({ status: 404, errorCode: 1001 });
      expect(await entries()).toHaveLength(0);
    });
  });

  describe('GET /api/wishlist', () => {
    it('lists only my products, newest first, with the standard product shape and Vnd/Usd prices', async () => {
      const [me, other] = [await b.user(), await b.user()];
      const [first, second] = [await b.product({ price: 350_000, originalPrice: 500_000 }), await b.product({ price: 120_000 })];
      await add(me, first.id).expect(201);
      await add(me, second.id).expect(201);
      await add(other, first.id).expect(201);
      await rows(`UPDATE wishlists SET created_at = now() - interval '1 day' WHERE user_id = $1 AND product_id = $2`, [me.id, first.id]);

      const res = await list(me).expect(200);

      expect(res.body.total).toBe(2);
      expect(res.body.data.map((item: { productId: string }) => item.productId)).toEqual([second.id, first.id]);
      expect(res.body.data[1]).toMatchObject({
        userId: me.id,
        productId: first.id,
        product: {
          id: first.id,
          priceVnd: 350_000,
          priceUsd: 14,
          originalPriceVnd: 500_000,
          originalPriceUsd: 20,
          category: { id: first.category.id },
          subcategory: { id: first.subcategory.id },
        },
      });
      expect(res.body.data[1].product).not.toHaveProperty('price');
      expect(res.body.data[1].product.category).not.toHaveProperty('subcategories');
    });

    it('is empty for a user without favourites', async () => {
      const res = await list(await b.user()).expect(200);

      expect(res.body).toEqual({ data: [], total: 0 });
    });

    it('keeps disabled products in the list', async () => {
      const [me, product] = [await b.user(), await b.product()];
      await add(me, product.id).expect(201);
      await rows(`UPDATE products SET status = 'disabled' WHERE id = $1`, [product.id]);

      const res = await list(me).expect(200);

      expect(res.body.data[0].product).toMatchObject({ id: product.id, status: 'disabled' });
    });
  });

  describe('GET /api/wishlist/check/:productId', () => {
    it('tells whether the product is in my wishlist, not someone else’s', async () => {
      const [me, other, product, absent] = [await b.user(), await b.user(), await b.product(), await b.product()];
      await add(other, product.id).expect(201);
      expect((await check(me, product.id).expect(200)).body).toEqual({ inWishlist: false });
      await add(me, product.id).expect(201);

      const yes = await check(me, product.id).expect(200);
      const no = await check(me, absent.id).expect(200);
      const unknown = await check(me, 'zzzzzzzzzzzzzzzz').expect(200);

      expect(yes.body).toEqual({ inWishlist: true });
      expect(no.body).toEqual({ inWishlist: false });
      expect(unknown.body).toEqual({ inWishlist: false });
    });

    it('is not mistaken for a product id on DELETE and follows add and remove', async () => {
      const [me, product] = [await b.user(), await b.product()];
      await add(me, product.id).expect(201);
      expect((await check(me, product.id).expect(200)).body.inWishlist).toBe(true);

      await remove(me, product.id).expect(200);

      expect((await check(me, product.id).expect(200)).body.inWishlist).toBe(false);
    });
  });

  describe('DELETE /api/wishlist/:productId', () => {
    it('removes my entry only and leaves other users’ entries and other products', async () => {
      const [me, other] = [await b.user(), await b.user()];
      const [product, kept] = [await b.product(), await b.product()];
      await add(me, product.id).expect(201);
      await add(me, kept.id).expect(201);
      await add(other, product.id).expect(201);

      const res = await remove(me, product.id).expect(200);

      expect(res.body).toEqual({ success: true });
      expect(await rows('SELECT user_id, product_id FROM wishlists ORDER BY user_id, product_id')).toHaveLength(2);
      expect((await check(me, kept.id).expect(200)).body.inWishlist).toBe(true);
      expect((await check(other, product.id).expect(200)).body.inWishlist).toBe(true);
    });

    it('is idempotent: removing something that is not there still answers success and changes nothing', async () => {
      const [me, other, product] = [await b.user(), await b.user(), await b.product()];
      await add(other, product.id).expect(201);

      const res = await remove(me, product.id).expect(200);
      const unknown = await remove(me, 'zzzzzzzzzzzzzzzz').expect(200);

      expect(res.body).toEqual({ success: true });
      expect(unknown.body).toEqual({ success: true });
      expect(await entries()).toEqual([{ user_id: other.id, product_id: product.id }]);
    });

    it('is cleaned up when the product is deleted', async () => {
      const [me, admin, product] = [await b.user(), await b.admin(), await b.product()];
      await add(me, product.id).expect(201);

      await t.api.delete(`/api/admin/products/${product.id}`).set(bearer(t, admin)).expect(200);

      expect((await list(me).expect(200)).body).toEqual({ data: [], total: 0 });
    });
  });
});
