import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { deliveredPaidOrder } from '../order-payment/steps';
import { writeReview } from '../review/steps';

/** Batch 13 (admin tạo) và batch 14 (sửa, xoá) của product. */
describe('Flow: products (admin write)', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  type User = Awaited<ReturnType<Builders['user']>>;
  type Category = Awaited<ReturnType<Builders['category']>>;
  const rows = <R>(sql: string, params: unknown[] = []) => t.dataSource.query(sql, params) as Promise<R[]>;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const create = (admin: User, body: object) => t.api.post('/api/admin/products').set(bearer(t, admin)).send(body);
  const productRows = () => rows<{ slug: string }>('SELECT slug FROM products');

  /** Body hợp lệ tối thiểu cho một danh mục; test ghi đè phần khác biệt. */
  const validBody = (category: Category, overrides: object = {}) => ({
    slug: 'ao-thun-may',
    name: 'Áo thun Mây',
    priceVnd: 350_000,
    images: ['https://cdn.flow.test/a.jpg'],
    categoryId: category.id,
    subcategoryId: category.subcategories[0].id,
    description: 'Cotton 100%',
    material: 'Cotton',
    care: 'Giặt máy',
    sizes: ['S', 'M'],
    colors: [{ name: 'Black', hex: '#000000' }],
    tags: ['basic'],
    ...overrides,
  });

  describe('POST /api/admin/products', () => {
    it('creates an active product with a generated SKU, Vnd/Usd prices and the category shape', async () => {
      const [admin, category] = [await b.admin(), await b.category()];

      const res = await create(admin, validBody(category)).expect(201);

      expect(res.body.data).toMatchObject({
        id: expect.any(String),
        slug: 'ao-thun-may',
        sku: `${category.slug}-${category.subcategories[0].slug}-ao-thun-may`,
        name: 'Áo thun Mây',
        priceVnd: 350_000,
        priceUsd: 14,
        originalPriceVnd: null,
        originalPriceUsd: null,
        images: ['https://cdn.flow.test/a.jpg'],
        status: 'active',
        badge: null,
        description: 'Cotton 100%',
        material: 'Cotton',
        care: 'Giặt máy',
        sizes: ['S', 'M'],
        colors: [{ name: 'Black', hex: '#000000' }],
        tags: ['basic'],
        ratingAverage: null,
        ratingCount: 0,
        category: { id: category.id, slug: category.slug },
        subcategory: { id: category.subcategories[0].id },
      });
      expect(res.body.data).not.toHaveProperty('price');
      expect(await rows('SELECT price, original_price, status FROM products')).toEqual([
        { price: '350000', original_price: null, status: 'active' },
      ]);
    });

    it('stores a given SKU, the original price, a badge and a disabled status, which keeps it off the public list', async () => {
      const [admin, category] = [await b.admin(), await b.category()];

      const res = await create(
        admin,
        validBody(category, { sku: 'CUSTOM-1', originalPriceVnd: 500_000, badge: 'sale', status: 'disabled' }),
      ).expect(201);

      expect(res.body.data).toMatchObject({
        sku: 'CUSTOM-1',
        priceVnd: 350_000,
        originalPriceVnd: 500_000,
        originalPriceUsd: 20,
        badge: 'sale',
        status: 'disabled',
      });
      expect((await t.api.get('/api/products').expect(200)).body.total).toBe(0);
      expect((await t.api.get('/api/admin/products').set(bearer(t, admin)).expect(200)).body.total).toBe(1);
    });

    it('accepts the price limits (1 and 1.000.000.000), an original price equal to the price and a null badge', async () => {
      const [admin, category] = [await b.admin(), await b.category()];

      const low = await create(admin, validBody(category, { slug: 'low', priceVnd: 1, originalPriceVnd: 1, badge: null })).expect(201);
      const high = await create(
        admin,
        validBody(category, { slug: 'high', priceVnd: 1_000_000_000, originalPriceVnd: 1_000_000_000 }),
      ).expect(201);

      expect(low.body.data).toMatchObject({ priceVnd: 1, originalPriceVnd: 1, badge: null });
      expect(high.body.data).toMatchObject({ priceVnd: 1_000_000_000, originalPriceVnd: 1_000_000_000, priceUsd: 40_000 });
    });

    it('shows a new active product in the public list and detail', async () => {
      const [admin, category] = [await b.admin(), await b.category()];

      const created = await create(admin, validBody(category)).expect(201);

      expect((await t.api.get('/api/products').expect(200)).body.data[0].id).toBe(created.body.data.id);
      await t.api.get(`/api/products/${created.body.data.id}`).expect(200);
    });

    it('refuses a duplicate slug (400 / 1002) and a duplicate SKU (400 / 1003)', async () => {
      const [admin, category] = [await b.admin(), await b.category()];
      await create(admin, validBody(category, { sku: 'DUP-SKU' })).expect(201);

      const slug = await create(admin, validBody(category, { sku: 'OTHER-SKU' }));
      const sku = await create(admin, validBody(category, { slug: 'khac', sku: 'DUP-SKU' }));

      expect(error(slug)).toMatchObject({ status: 400, errorCode: 1002 });
      expect(error(sku)).toMatchObject({ status: 400, errorCode: 1003 });
      expect(await productRows()).toHaveLength(1);
    });

    it('refuses an original price below the price (400 / 1009)', async () => {
      const [admin, category] = [await b.admin(), await b.category()];

      const res = await create(admin, validBody(category, { priceVnd: 400_000, originalPriceVnd: 399_999 }));

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1009 });
      expect(await productRows()).toHaveLength(0);
    });

    it('refuses an unknown category or subcategory (1004) and a subcategory of another category (1005)', async () => {
      const [admin, category, other] = [await b.admin(), await b.category(), await b.category()];

      const noCategory = await create(admin, validBody(category, { categoryId: 'zzzzzzzzzzzzzzzz' }));
      const noSubcategory = await create(admin, validBody(category, { subcategoryId: 'zzzzzzzzzzzzzzzz' }));
      const mismatch = await create(admin, validBody(category, { subcategoryId: other.subcategories[0].id }));

      expect(error(noCategory)).toMatchObject({ status: 400, errorCode: 1004 });
      expect(error(noSubcategory)).toMatchObject({ status: 400, errorCode: 1004 });
      expect(error(mismatch)).toMatchObject({ status: 400, errorCode: 1005 });
      expect(await productRows()).toHaveLength(0);
    });

    it.each([
      ['a missing slug', (c: Category) => ({ ...validBody(c), slug: undefined })],
      ['an empty slug', (c: Category) => validBody(c, { slug: '' })],
      ['a slug longer than 255 characters', (c: Category) => validBody(c, { slug: 'x'.repeat(256) })],
      ['a SKU longer than 255 characters', (c: Category) => validBody(c, { sku: 'x'.repeat(256) })],
      ['a missing name', (c: Category) => ({ ...validBody(c), name: undefined })],
      ['an empty name', (c: Category) => validBody(c, { name: '' })],
      ['a missing price', (c: Category) => ({ ...validBody(c), priceVnd: undefined })],
      ['a price of 0', (c: Category) => validBody(c, { priceVnd: 0 })],
      ['a price above 1.000.000.000', (c: Category) => validBody(c, { priceVnd: 1_000_000_001 })],
      ['a fractional price', (c: Category) => validBody(c, { priceVnd: 100.5 })],
      ['the legacy `price` field', (c: Category) => validBody(c, { price: 100_000 })],
      ['an original price of 0', (c: Category) => validBody(c, { originalPriceVnd: 0 })],
      ['the legacy `originalPrice` field', (c: Category) => validBody(c, { originalPrice: 100_000 })],
      ['no images', (c: Category) => validBody(c, { images: [] })],
      ['a non-string image', (c: Category) => validBody(c, { images: [1] })],
      ['a missing categoryId', (c: Category) => ({ ...validBody(c), categoryId: undefined })],
      ['an empty subcategoryId', (c: Category) => validBody(c, { subcategoryId: '' })],
      ['an unknown badge', (c: Category) => validBody(c, { badge: 'hot' })],
      ['an empty description', (c: Category) => validBody(c, { description: '' })],
      ['a material longer than 255 characters', (c: Category) => validBody(c, { material: 'x'.repeat(256) })],
      ['a care longer than 500 characters', (c: Category) => validBody(c, { care: 'x'.repeat(501) })],
      ['no sizes', (c: Category) => validBody(c, { sizes: [] })],
      ['no colours', (c: Category) => validBody(c, { colors: [] })],
      ['a colour without a hex', (c: Category) => validBody(c, { colors: [{ name: 'Red' }] })],
      ['a colour with an empty name', (c: Category) => validBody(c, { colors: [{ name: '', hex: '#f00' }] })],
      ['missing tags', (c: Category) => ({ ...validBody(c), tags: undefined })],
      ['non-string tags', (c: Category) => validBody(c, { tags: [1] })],
      ['an unknown status', (c: Category) => validBody(c, { status: 'archived' })],
      ['the rating fields', (c: Category) => validBody(c, { ratingAverage: 5, ratingCount: 1 })],
      ['an unknown field', (c: Category) => validBody(c, { id: 'custom-id' })],
    ])('rejects %s with a validation error (no errorCode) and creates nothing', async (_name, body) => {
      const [admin, category] = [await b.admin(), await b.category()];

      const res = await create(admin, body(category));

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await productRows()).toHaveLength(0);
    });
  });

  describe('PATCH /api/admin/products/:id', () => {
    const patch = (admin: User, id: string, body: object) => t.api.patch(`/api/admin/products/${id}`).set(bearer(t, admin)).send(body);
    const row = (id: string) =>
      rows<{
        slug: string;
        sku: string;
        name: string;
        price: string;
        original_price: string | null;
        badge: string | null;
        status: string;
        rating_average: string | null;
        rating_count: number;
      }>('SELECT slug, sku, name, price, original_price, badge, status, rating_average, rating_count FROM products WHERE id = $1', [
        id,
      ]).then((r) => r[0]);

    it('changes only the fields sent, keeps the SKU, and returns the product with Vnd/Usd prices', async () => {
      const [admin, product] = [await b.admin(), await b.product({ price: 350_000, originalPrice: 500_000 })];

      const res = await patch(admin, product.id, {
        name: 'Tên mới',
        priceVnd: 400_000,
        originalPriceVnd: 450_000,
        badge: 'new',
        sizes: ['M', 'L'],
        tags: ['x'],
      }).expect(200);

      expect(res.body.data).toMatchObject({
        id: product.id,
        name: 'Tên mới',
        priceVnd: 400_000,
        priceUsd: 16,
        originalPriceVnd: 450_000,
        originalPriceUsd: 18,
        badge: 'new',
        sizes: ['M', 'L'],
        tags: ['x'],
        category: { id: product.category.id },
        subcategory: { id: product.subcategory.id },
      });
      expect(await row(product.id)).toMatchObject({
        name: 'Tên mới',
        slug: product.slug,
        sku: product.sku,
        price: '400000',
        original_price: '450000',
        badge: 'new',
      });
      const detail = await t.api.get(`/api/products/${product.id}`).expect(200);
      expect(detail.body.data).toMatchObject({ description: product.description, images: product.images, sizes: ['M', 'L'] });
    });

    it('clears the badge with null, replaces images and colours, and accepts an empty body as no change', async () => {
      const [admin, product] = [await b.admin(), await b.product({ badge: 'sale' })];

      const none = await patch(admin, product.id, {}).expect(200);
      expect(none.body.data.id).toBe(product.id);
      expect(await row(product.id)).toMatchObject({ badge: 'sale', name: product.name });
      const res = await patch(admin, product.id, {
        badge: null,
        images: ['https://cdn.flow.test/new.jpg'],
        colors: [{ name: 'Red', hex: '#f00' }],
      }).expect(200);

      expect(res.body.data).toMatchObject({
        badge: null,
        images: ['https://cdn.flow.test/new.jpg'],
        colors: [{ name: 'Red', hex: '#f00' }],
      });
    });

    it('disables a product, which removes it from the public list while the admin list keeps it, and it can be edited again', async () => {
      const [admin, product] = [await b.admin(), await b.product()];

      await patch(admin, product.id, { status: 'disabled' }).expect(200);

      expect((await t.api.get('/api/products').expect(200)).body.total).toBe(0);
      expect((await t.api.get('/api/admin/products').set(bearer(t, admin)).expect(200)).body.total).toBe(1);
      await patch(admin, product.id, { name: 'Vẫn sửa được' }).expect(200);
      await patch(admin, product.id, { status: 'active' }).expect(200);
      expect((await t.api.get('/api/products').expect(200)).body.total).toBe(1);
    });

    it('leaves the rating figures alone', async () => {
      const [admin, product] = [await b.admin(), await b.product({ ratingAverage: 4.5, ratingCount: 3 })];

      await patch(admin, product.id, { name: 'Đổi tên' }).expect(200);

      expect(await row(product.id)).toMatchObject({ rating_average: '4.5', rating_count: 3 });
    });

    it('treats null on an optional field as not sent, while null on badge or originalPriceVnd still clears it', async () => {
      const [admin, product] = [await b.admin(), await b.product({ badge: 'sale', originalPrice: 500_000, sku: 'KEEP-2' })];

      await patch(admin, product.id, { sku: null, status: null }).expect(200);
      expect(await row(product.id)).toMatchObject({ sku: 'KEEP-2', status: 'active', badge: 'sale' });
      const cleared = await patch(admin, product.id, { badge: null, originalPriceVnd: null }).expect(200);

      expect(cleared.body.data).toMatchObject({ badge: null, originalPriceVnd: null, originalPriceUsd: null });
    });

    it('returns the whole product in the response, not only the fields that were sent', async () => {
      const [admin, product] = [await b.admin(), await b.product({ price: 350_000, originalPrice: 500_000, sku: 'KEEP-1' })];

      const res = await patch(admin, product.id, { name: 'Chỉ đổi tên' }).expect(200);

      expect(res.body.data).toMatchObject({
        id: product.id,
        slug: product.slug,
        sku: 'KEEP-1',
        name: 'Chỉ đổi tên',
        description: product.description,
        material: product.material,
        care: product.care,
        images: product.images,
        sizes: product.sizes,
        colors: product.colors,
        tags: product.tags,
        status: 'active',
        priceVnd: 350_000,
        originalPriceVnd: 500_000,
      });
    });

    it('regenerates the SKU when the slug changes (or uses the SKU sent), but not when only other fields change', async () => {
      const [admin, product] = [await b.admin(), await b.product({ sku: 'CUSTOM' })];

      await patch(admin, product.id, { name: 'Khác' }).expect(200);
      expect((await row(product.id)).sku).toBe('CUSTOM');
      await patch(admin, product.id, { slug: 'slug-moi' }).expect(200);
      expect((await row(product.id)).sku).toBe(`${product.category.slug}-${product.subcategory.slug}-slug-moi`);
      await patch(admin, product.id, { slug: 'slug-moi-2', sku: 'EXPLICIT-1' }).expect(200);
      expect(await row(product.id)).toMatchObject({ slug: 'slug-moi-2', sku: 'EXPLICIT-1' });
    });

    it('moves the product to another category together with its subcategory', async () => {
      const [admin, product, other] = [await b.admin(), await b.product(), await b.category()];

      const res = await patch(admin, product.id, { categoryId: other.id, subcategoryId: other.subcategories[0].id }).expect(200);

      const generated = `${other.slug}-${other.subcategories[0].slug}-${product.slug}`;
      expect(res.body.data).toMatchObject({
        slug: product.slug,
        sku: generated,
        category: { id: other.id },
        subcategory: { id: other.subcategories[0].id },
      });
      expect(await row(product.id)).toMatchObject({ slug: product.slug, sku: generated });
      expect(await rows('SELECT category_id, subcategory_id FROM products')).toEqual([
        { category_id: other.id, subcategory_id: other.subcategories[0].id },
      ]);
    });

    it('accepts its own slug and SKU again, and the prices at their limits', async () => {
      const [admin, product] = [await b.admin(), await b.product({ price: 350_000, originalPrice: 350_000 })];

      await patch(admin, product.id, { slug: product.slug, sku: product.sku }).expect(200);
      const res = await patch(admin, product.id, { priceVnd: 1_000_000_000, originalPriceVnd: 1_000_000_000 }).expect(200);

      expect(res.body.data).toMatchObject({ priceVnd: 1_000_000_000, originalPriceVnd: 1_000_000_000 });
    });

    it('refuses a slug or SKU used by another product (1002 / 1003) and keeps the product', async () => {
      const [admin, product, other] = [await b.admin(), await b.product(), await b.product()];

      const slug = await patch(admin, product.id, { slug: other.slug });
      const sku = await patch(admin, product.id, { sku: other.sku });

      expect(error(slug)).toMatchObject({ status: 400, errorCode: 1002 });
      expect(error(sku)).toMatchObject({ status: 400, errorCode: 1003 });
      expect(await row(product.id)).toMatchObject({ slug: product.slug, sku: product.sku });
    });

    it('checks the original price against the final price (1009): raising the price alone or lowering the original alone', async () => {
      const [admin, product] = [await b.admin(), await b.product({ price: 350_000, originalPrice: 400_000 })];

      const raisePrice = await patch(admin, product.id, { priceVnd: 450_000 });
      const lowerOriginal = await patch(admin, product.id, { originalPriceVnd: 349_999 });
      const both = await patch(admin, product.id, { priceVnd: 450_000, originalPriceVnd: 450_000 }).expect(200);

      expect(error(raisePrice)).toMatchObject({ status: 400, errorCode: 1009 });
      expect(error(lowerOriginal)).toMatchObject({ status: 400, errorCode: 1009 });
      expect(both.body.data).toMatchObject({ priceVnd: 450_000, originalPriceVnd: 450_000 });
      expect(await row(product.id)).toMatchObject({ price: '450000', original_price: '450000' });
    });

    it('refuses an unknown category or subcategory (1004) and a subcategory of another category (1005), changing nothing', async () => {
      const [admin, product, other] = [await b.admin(), await b.product(), await b.category()];

      const noCategory = await patch(admin, product.id, { categoryId: 'zzzzzzzzzzzzzzzz' });
      const noSubcategory = await patch(admin, product.id, { subcategoryId: 'zzzzzzzzzzzzzzzz' });
      const mismatch = await patch(admin, product.id, { subcategoryId: other.subcategories[0].id });
      const onlyCategory = await patch(admin, product.id, { categoryId: other.id });

      expect(error(noCategory)).toMatchObject({ status: 400, errorCode: 1004 });
      expect(error(noSubcategory)).toMatchObject({ status: 400, errorCode: 1004 });
      expect(error(mismatch)).toMatchObject({ status: 400, errorCode: 1005 });
      expect(error(onlyCategory)).toMatchObject({ status: 400, errorCode: 1005 });
      expect(await rows('SELECT category_id, subcategory_id FROM products')).toEqual([
        { category_id: product.category.id, subcategory_id: product.subcategory.id },
      ]);
    });

    it('answers 404 / 1001 for an unknown product', async () => {
      const res = await patch(await b.admin(), 'zzzzzzzzzzzzzzzz', { name: 'x' });

      expect(error(res)).toMatchObject({ status: 404, errorCode: 1001 });
    });

    it.each([
      ['a price of 0', { priceVnd: 0 }],
      ['a price above 1.000.000.000', { priceVnd: 1_000_000_001 }],
      ['a fractional price', { priceVnd: 10.5 }],
      ['the legacy `price` field', { price: 100_000 }],
      ['the legacy `originalPrice` field', { originalPrice: 100_000 }],
      ['an original price of 0', { originalPriceVnd: 0 }],
      ['no images', { images: [] }],
      ['no sizes', { sizes: [] }],
      ['a colour without a hex', { colors: [{ name: 'Red' }] }],
      ['an unknown badge', { badge: 'hot' }],
      ['an unknown status', { status: 'archived' }],
      ['a slug longer than 255 characters', { slug: 'x'.repeat(256) }],
      ['a material longer than 255 characters', { material: 'x'.repeat(256) }],
      ['a care longer than 500 characters', { care: 'x'.repeat(501) }],
      ['non-string tags', { tags: [1] }],
      ['the rating fields', { ratingAverage: 5 }],
      ['an empty slug', { slug: '' }],
      ['an empty name', { name: '' }],
      ['an empty description', { description: '' }],
      ['an empty categoryId', { categoryId: '' }],
      ['a null name', { name: null }],
      ['a null price', { priceVnd: null }],
      ['a null slug', { slug: null }],
      ['null images', { images: null }],
      ['an unknown field', { id: 'other' }],
    ])('rejects %s with a validation error (no errorCode) and changes nothing', async (_name, body) => {
      const [admin, product] = [await b.admin(), await b.product()];
      const before = await row(product.id);

      const res = await patch(admin, product.id, body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await row(product.id)).toEqual(before);
    });
  });

  describe('DELETE /api/admin/products/:id', () => {
    const remove = (admin: User, id: string) => t.api.delete(`/api/admin/products/${id}`).set(bearer(t, admin));

    it('deletes the product, which disappears from the lists and the detail', async () => {
      const [admin, product, kept] = [await b.admin(), await b.product(), await b.product()];

      const res = await remove(admin, product.id).expect(200);

      expect(res.body).toEqual({ message: 'Product deleted successfully' });
      expect(await rows('SELECT id FROM products')).toEqual([{ id: kept.id }]);
      expect((await t.api.get('/api/products').expect(200)).body.total).toBe(1);
      expect(error(await t.api.get(`/api/products/${product.id}`))).toMatchObject({ status: 404, errorCode: 1001 });
    });

    it('removes the product’s cart lines, wishlist entries, reviews and votes, and keeps the order line as a snapshot with no product', async () => {
      const admin = await b.admin();
      const entry = await deliveredPaidOrder(t, b);
      const review = await writeReview(t, entry);
      const voter = await b.user();
      await t.api.post(`/api/reviews/${review.id}/helpful`).set(bearer(t, voter)).expect(201);
      await t.api.post(`/api/wishlist/${entry.product.id}`).set(bearer(t, voter)).expect(201);
      await b.cart(voter, [{ product: entry.product }]);

      await remove(admin, entry.product.id).expect(200);

      expect(await rows('SELECT 1 FROM reviews')).toHaveLength(0);
      expect(await rows('SELECT 1 FROM review_votes')).toHaveLength(0);
      expect(await rows('SELECT 1 FROM cart_items')).toHaveLength(0);
      expect(await rows('SELECT 1 FROM wishlists')).toHaveLength(0);
      expect(await rows('SELECT product_id, product_name, price FROM order_items')).toEqual([
        { product_id: null, product_name: entry.product.name, price: '350000' },
      ]);
      const detail = await t.api.get(`/api/orders/${entry.order.id}`).set(bearer(t, entry.customer)).expect(200);
      expect(detail.body.data.items[0]).toMatchObject({ productName: entry.product.name, priceVnd: 350_000, product: null });
    });

    it('answers 404 / 1001 for an unknown product and for a second delete', async () => {
      const [admin, product] = [await b.admin(), await b.product()];
      await remove(admin, product.id).expect(200);

      const again = await remove(admin, product.id);
      const unknown = await remove(admin, 'zzzzzzzzzzzzzzzz');

      expect(error(again)).toMatchObject({ status: 404, errorCode: 1001 });
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1001 });
    });
  });
});
