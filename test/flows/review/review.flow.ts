import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { requestWhileRowLocked } from '../../support/locks';
import { deliveredPaidOrder, placeAndPayOrder, placeOrder } from '../order-payment/steps';
import { storageUrl, uploadedReviewImage, useStorageEnv, writeReview } from './steps';

/** Batch 09 (review): đọc công khai, tổng hợp, viết, sửa một lần và bỏ "hữu ích". */
describe('Flow: reviews (public, write, edit, unvote)', () => {
  let t: TestApp;
  let b: Builders;
  let restoreEnv: () => void;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
    restoreEnv = useStorageEnv();
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(async () => {
    restoreEnv();
    await t.close();
  });

  type User = Awaited<ReturnType<Builders['user']>>;
  const rows = <R>(sql: string, params: unknown[] = []) => t.dataSource.query(sql, params) as Promise<R[]>;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const post = (user: User, body: object) => t.api.post('/api/reviews').set(bearer(t, user)).send(body);
  const patch = (user: User, reviewId: string, body: object) => t.api.patch(`/api/reviews/${reviewId}`).set(bearer(t, user)).send(body);
  const list = (productId: string, query: object = {}) => t.api.get(`/api/reviews/${productId}`).query(query);
  const summary = (productId: string) => t.api.get(`/api/reviews/${productId}/summary`);
  const ids = (res: { body: { data: { id: string }[] } }) => res.body.data.map((row) => row.id);
  const productRating = (id: string) =>
    rows<{ rating_average: string | null; rating_count: number }>('SELECT rating_average, rating_count FROM products WHERE id = $1', [
      id,
    ]).then((r) => ({ average: r[0].rating_average === null ? null : Number(r[0].rating_average), count: r[0].rating_count }));
  const day = (offset: number) => new Date(Date.UTC(2026, 9, 1 + offset, 12));

  describe('POST /api/reviews', () => {
    it('publishes a verified review with a snapshot of the author and the line, and updates the product rating', async () => {
      const entry = await deliveredPaidOrder(t, b);

      const res = await post(entry.customer, {
        orderItemId: entry.items[0].id,
        rating: 4,
        title: '  Vừa vặn ',
        content: ' Vải mềm ',
        fit: 'true_to_size',
      }).expect(201);

      expect(res.body.data).toMatchObject({
        productId: entry.product.id,
        orderItemId: entry.items[0].id,
        author: entry.customer.name,
        avatar: '',
        rating: 4,
        date: new Date().toISOString().slice(0, 10),
        title: 'Vừa vặn',
        content: 'Vải mềm',
        verified: true,
        fit: 'true_to_size',
        images: [],
        size: 'M',
        color: 'Black',
        helpfulCount: 0,
        edited: false,
        reply: null,
        status: 'PUBLISHED',
        moderationNote: null,
        editedAt: null,
        canEdit: true,
        product: {
          id: entry.product.id,
          slug: entry.product.slug,
          category: { id: expect.any(String) },
          subcategory: { id: expect.any(String) },
        },
      });
      const days = (new Date(res.body.data.editableUntil).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThanOrEqual(30);
      expect(await productRating(entry.product.id)).toEqual({ average: 4, count: 1 });
    });

    it('needs only the line and the rating (title and content empty, fit null) and falls back to "Customer" without a name', async () => {
      const entry = await deliveredPaidOrder(t, b);
      await rows(`UPDATE users SET name = '' WHERE id = $1`, [entry.customer.id]);

      const res = await post(entry.customer, { orderItemId: entry.items[0].id, rating: 1 }).expect(201);

      expect(res.body.data).toMatchObject({ author: 'Customer', title: '', content: '', fit: null, rating: 1 });
    });

    it('recomputes the product average over all published reviews (one decimal)', async () => {
      const entry = await deliveredPaidOrder(t, b);
      await b.review(entry.product, { rating: 3 });
      await b.review(entry.product, { rating: 4, status: 'HIDDEN', moderationNote: 'Spam' });

      await post(entry.customer, { orderItemId: entry.items[0].id, rating: 4 }).expect(201);

      expect(await productRating(entry.product.id)).toEqual({ average: 3.5, count: 2 });
    });

    it('accepts a refunded order and stores only the images the user uploaded, rebuilt from the storage key', async () => {
      const entry = await deliveredPaidOrder(t, b);
      await rows(`UPDATE orders SET payment_status = 'refunded' WHERE id = $1`, [entry.order.id]);
      const [first, second] = [await uploadedReviewImage(t, entry.customer), await uploadedReviewImage(t, entry.customer)];

      const res = await post(entry.customer, { orderItemId: entry.items[0].id, rating: 5, images: [first, second] }).expect(201);

      expect(res.body.data.images).toEqual([first, second]);
      expect(await rows('SELECT images FROM reviews')).toEqual([{ images: [first, second] }]);
    });

    it('refuses images that are not the user’s own review uploads (1908) and stores nothing', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const stranger = await b.user();
      const others = await uploadedReviewImage(t, stranger);
      const library = await uploadedReviewImage(t, entry.customer, 'LIBRARY');
      const attempts = [others, library, storageUrl('review/not-uploaded.jpg'), 'https://elsewhere.test/a.jpg'];

      for (const url of attempts) {
        const res = await post(entry.customer, { orderItemId: entry.items[0].id, rating: 5, images: [url] });
        expect(error(res)).toMatchObject({ status: 400, errorCode: 1908 });
      }
      expect(await rows('SELECT 1 FROM reviews')).toHaveLength(0);
    });

    it('answers 404 / 1902 for an unknown line and for another customer’s line', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const stranger = await b.user();

      const unknown = await post(entry.customer, { orderItemId: 'zzzzzzzzzzzzzzzz', rating: 5 });
      const foreign = await post(stranger, { orderItemId: entry.items[0].id, rating: 5 });

      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1902 });
      expect(error(foreign)).toMatchObject({ status: 404, errorCode: 1902 });
    });

    it('explains why a line cannot be reviewed yet: not paid, not delivered, window over, product removed (1902)', async () => {
      const unpaid = await placeOrder(t, b);
      const paidOnly = await placeAndPayOrder(t, b);
      const expired = await deliveredPaidOrder(t, b);
      await rows(`UPDATE orders SET delivered_at = now() - interval '31 days' WHERE id = $1`, [expired.order.id]);
      const removed = await deliveredPaidOrder(t, b);
      await rows('UPDATE order_items SET product_id = NULL WHERE order_id = $1', [removed.order.id]);
      const lineOf = async (entry: { customer: User; order: { id: string } }) => {
        const detail = await t.api.get(`/api/orders/${entry.order.id}`).set(bearer(t, entry.customer)).expect(200);
        return detail.body.data.items[0].id as string;
      };

      const results = [
        await post(unpaid.customer, { orderItemId: await lineOf(unpaid), rating: 5 }),
        await post(paidOnly.customer, { orderItemId: await lineOf(paidOnly), rating: 5 }),
        await post(expired.customer, { orderItemId: expired.items[0].id, rating: 5 }),
        await post(removed.customer, { orderItemId: removed.items[0].id, rating: 5 }),
      ];

      expect(results.map((res) => error(res))).toEqual([
        { status: 400, errorCode: 1902, message: 'Only items of paid orders can be reviewed' },
        { status: 400, errorCode: 1902, message: 'Only items of delivered orders can be reviewed' },
        { status: 400, errorCode: 1902, message: 'The review period for this order has ended' },
        { status: 400, errorCode: 1902, message: 'This product is no longer available for review' },
      ]);
      expect(await rows('SELECT 1 FROM reviews')).toHaveLength(0);
    });

    it('allows one review per line: a second one is 409 / 1903, and two at the same time give one 201 and one 409', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const race = await deliveredPaidOrder(t, b);
      await writeReview(t, entry);

      const again = await post(entry.customer, { orderItemId: entry.items[0].id, rating: 3 });
      const both = await Promise.all([
        post(race.customer, { orderItemId: race.items[0].id, rating: 5 }),
        post(race.customer, { orderItemId: race.items[0].id, rating: 2 }),
      ]);

      expect(error(again)).toMatchObject({ status: 409, errorCode: 1903 });
      expect(both.map((res) => res.status).sort()).toEqual([201, 409]);
      expect(both.find((res) => res.status === 409)?.body.errorCode).toBe(1903);
      expect(await rows('SELECT 1 FROM reviews')).toHaveLength(2);
      expect((await productRating(race.product.id)).count).toBe(1);
    });

    it('refuses links in the title or the content (1905)', async () => {
      const entry = await deliveredPaidOrder(t, b);

      const inContent = await post(entry.customer, { orderItemId: entry.items[0].id, rating: 5, content: 'Xem tại https://shop.test/x' });
      const inTitle = await post(entry.customer, { orderItemId: entry.items[0].id, rating: 5, title: 'www.spam.test' });

      expect(error(inContent)).toMatchObject({ status: 400, errorCode: 1905 });
      expect(error(inTitle)).toMatchObject({ status: 400, errorCode: 1905 });
      expect(await rows('SELECT 1 FROM reviews')).toHaveLength(0);
    });

    it.each([
      ['a missing orderItemId', (_item: string) => ({ rating: 5 })],
      ['an orderItemId longer than 16 characters', () => ({ orderItemId: 'x'.repeat(17), rating: 5 })],
      ['a missing rating', (item: string) => ({ orderItemId: item })],
      ['a rating of 0', (item: string) => ({ orderItemId: item, rating: 0 })],
      ['a rating of 6', (item: string) => ({ orderItemId: item, rating: 6 })],
      ['a fractional rating', (item: string) => ({ orderItemId: item, rating: 4.5 })],
      ['a title longer than 255 characters', (item: string) => ({ orderItemId: item, rating: 5, title: 'x'.repeat(256) })],
      ['a content longer than 2000 characters', (item: string) => ({ orderItemId: item, rating: 5, content: 'x'.repeat(2001) })],
      ['an unknown fit', (item: string) => ({ orderItemId: item, rating: 5, fit: 'tight' })],
      [
        'more than 5 images',
        (item: string) => ({ orderItemId: item, rating: 5, images: ['1', '2', '3', '4', '5', '6'].map((n) => `https://x.test/${n}.jpg`) }),
      ],
      ['repeated images', (item: string) => ({ orderItemId: item, rating: 5, images: ['https://x.test/a.jpg', 'https://x.test/a.jpg'] })],
      [
        'an image URL longer than 1000 characters',
        (item: string) => ({ orderItemId: item, rating: 5, images: [`https://x.test/${'a'.repeat(1000)}`] }),
      ],
      ['an unknown field', (item: string) => ({ orderItemId: item, rating: 5, status: 'HIDDEN' })],
    ])('rejects %s with a validation error (no errorCode) and creates nothing', async (_name, body) => {
      const entry = await deliveredPaidOrder(t, b);

      const res = await post(entry.customer, body(entry.items[0].id));

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await rows('SELECT 1 FROM reviews')).toHaveLength(0);
    });
  });

  describe('GET /api/reviews/:productId', () => {
    it('shows only published reviews in the public shape (no internal fields) with the store reply, newest first', async () => {
      const product = await b.product();
      const [old, recent] = [
        await b.review(product, { createdAt: day(0), rating: 3, helpfulCount: 2 }),
        await b.review(product, { createdAt: day(5), rating: 5, reply: 'Cảm ơn bạn!', repliedAt: day(6), editedAt: day(5) }),
      ];
      await b.review(product, { status: 'HIDDEN', moderationNote: 'Spam' });
      await b.review(await b.product());

      const res = await list(product.id).expect(200);

      expect(ids(res)).toEqual([recent.id, old.id]);
      expect(res.body).toMatchObject({ total: 2, page: 1, limit: 25, totalPages: 1 });
      expect(res.body.data[0]).toEqual({
        id: recent.id,
        author: recent.author,
        avatar: '',
        rating: 5,
        date: '2026-10-01',
        createdAt: day(5).toISOString(),
        title: recent.title,
        content: recent.content,
        verified: true,
        fit: null,
        images: [],
        size: 'M',
        color: 'Black',
        helpfulCount: 0,
        edited: true,
        reply: { content: 'Cảm ơn bạn!', repliedAt: day(6).toISOString() },
      });
      expect(res.body.data[1]).toMatchObject({ edited: false, reply: null, helpfulCount: 2 });
    });

    it('filters by rating, fit and photos, and sorts by rating or helpful count', async () => {
      const product = await b.product();
      const a = await b.review(product, { rating: 5, fit: 'small', images: ['https://x.test/a.jpg'], helpfulCount: 1, createdAt: day(1) });
      const c = await b.review(product, { rating: 3, fit: 'large', helpfulCount: 7, createdAt: day(2) });
      const d = await b.review(product, { rating: 4, fit: 'true_to_size', helpfulCount: 4, createdAt: day(3) });

      expect(ids(await list(product.id, { rating: 5 }).expect(200))).toEqual([a.id]);
      expect(ids(await list(product.id, { rating: 4, fit: 'true_to_size' }).expect(200))).toEqual([d.id]);
      expect(ids(await list(product.id, { fit: 'large' }).expect(200))).toEqual([c.id]);
      expect(ids(await list(product.id, { hasImages: true }).expect(200))).toEqual([a.id]);
      expect(ids(await list(product.id, { hasImages: false }).expect(200))).toEqual([d.id, c.id]);
      expect(ids(await list(product.id, { sort: 'rating' }).expect(200))).toEqual([c.id, d.id, a.id]);
      expect(ids(await list(product.id, { sort: '-helpfulCount' }).expect(200))).toEqual([c.id, d.id, a.id]);
      expect(ids(await list(product.id, { sort: 'createdAt' }).expect(200))).toEqual([a.id, c.id, d.id]);
    });

    it('paginates, and returns an empty list for a product without reviews or that does not exist', async () => {
      const product = await b.product();
      const made = [
        await b.review(product, { createdAt: day(1) }),
        await b.review(product, { createdAt: day(2) }),
        await b.review(product, { createdAt: day(3) }),
      ];

      const second = await list(product.id, { limit: 2, page: 2 }).expect(200);
      const beyond = await list(product.id, { limit: 2, page: 5 }).expect(200);
      const none = await list('zzzzzzzzzzzzzzzz').expect(200);

      expect(ids(second)).toEqual([made[0].id]);
      expect(second.body).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });
      expect(beyond.body).toMatchObject({ data: [], total: 3 });
      expect(none.body).toMatchObject({ data: [], total: 0, totalPages: 0 });
    });

    it('works with or without a token', async () => {
      const product = await b.product();
      await b.review(product);
      const user = await b.user();

      await list(product.id).expect(200);
      await t.api.get(`/api/reviews/${product.id}`).set(bearer(t, user)).expect(200);
    });

    it.each([
      ['a rating of 0', { rating: 0 }],
      ['a rating of 6', { rating: 6 }],
      ['an unknown fit', { fit: 'tight' }],
      ['hasImages that is not a boolean', { hasImages: 'yes' }],
      ['a sort field outside the whitelist', { sort: 'author' }],
      ['the removed `sorts` parameter', { sorts: 'rating' }],
      ['a limit above 200', { limit: 201 }],
      ['a page below 1', { page: 0 }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const product = await b.product();

      const res = await list(product.id, query);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('GET /api/reviews/:productId/summary', () => {
    it('is empty for a product without reviews (average null) and for an unknown product', async () => {
      const product = await b.product();

      const res = await summary(product.id).expect(200);
      const unknown = await summary('zzzzzzzzzzzzzzzz').expect(200);

      const empty = {
        ratingCount: 0,
        ratingAverage: null,
        withImages: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        fit: { small: 0, true_to_size: 0, large: 0, total: 0 },
      };
      expect(res.body.data).toEqual({ productId: product.id, ...empty });
      expect(unknown.body.data).toEqual({ productId: 'zzzzzzzzzzzzzzzz', ...empty });
    });

    it('counts published reviews only: distribution, photos, fit (only reviews that chose one) and a rounded average', async () => {
      const product = await b.product();
      await b.review(product, { rating: 5, fit: 'true_to_size', images: ['https://x.test/a.jpg'] });
      await b.review(product, { rating: 4, fit: 'small' });
      await b.review(product, { rating: 4 });
      await b.review(product, { rating: 4, fit: 'true_to_size' });
      await b.review(product, { rating: 1, status: 'HIDDEN', moderationNote: 'Spam', fit: 'large', images: ['https://x.test/b.jpg'] });
      await b.review(await b.product(), { rating: 1 });

      const res = await summary(product.id).expect(200);

      expect(res.body.data).toEqual({
        productId: product.id,
        ratingCount: 4,
        ratingAverage: 4.3,
        withImages: 1,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 3, 5: 1 },
        fit: { small: 1, true_to_size: 2, large: 0, total: 3 },
      });
    });

    it('rounds half up like the stored product average (4.25 → 4.3, 4.5 stays)', async () => {
      const [first, second] = [await b.product(), await b.product()];
      for (const rating of [5, 4, 4, 4]) await b.review(first, { rating });
      for (const rating of [5, 4]) await b.review(second, { rating });

      expect((await summary(first.id).expect(200)).body.data.ratingAverage).toBe(4.3);
      expect((await summary(second.id).expect(200)).body.data.ratingAverage).toBe(4.5);
    });

    it('works with or without a token', async () => {
      const product = await b.product();
      const user = await b.user();

      await summary(product.id).expect(200);
      await t.api.get(`/api/reviews/${product.id}/summary`).set(bearer(t, user)).expect(200);
    });
  });

  describe('PATCH /api/reviews/:reviewId', () => {
    it('edits the chosen fields once, marks the review edited and closes further edits', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const review = await writeReview(t, entry, { rating: 2, title: 'Cũ', content: 'Nội dung cũ', fit: 'small' });

      const res = await patch(entry.customer, review.id, { title: ' Mới ', fit: 'large' }).expect(200);

      expect(res.body.data).toMatchObject({
        id: review.id,
        rating: 2,
        title: 'Mới',
        content: 'Nội dung cũ',
        fit: 'large',
        edited: true,
        editedAt: expect.any(String),
        canEdit: false,
        editableUntil: null,
      });
      const again = await patch(entry.customer, review.id, { title: 'Lần hai' });
      expect(error(again)).toMatchObject({ status: 400, errorCode: 1904, message: 'A review can only be edited once' });
    });

    it('recomputes the product average when the rating changes', async () => {
      const entry = await deliveredPaidOrder(t, b);
      await b.review(entry.product, { rating: 5 });
      const review = await writeReview(t, entry, { rating: 1 });
      expect(await productRating(entry.product.id)).toEqual({ average: 3, count: 2 });

      await patch(entry.customer, review.id, { rating: 4 }).expect(200);

      expect(await productRating(entry.product.id)).toEqual({ average: 4.5, count: 2 });
    });

    it('replaces the images with the user’s own uploads, or clears them with []', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const [one, two] = [await uploadedReviewImage(t, entry.customer), await uploadedReviewImage(t, entry.customer)];
      const review = await writeReview(t, entry, { images: [one] });

      const res = await patch(entry.customer, review.id, { images: [two] }).expect(200);
      expect(res.body.data.images).toEqual([two]);
      const other = await deliveredPaidOrder(t, b);
      const second = await writeReview(t, other, { images: [await uploadedReviewImage(t, other.customer)] });
      const cleared = await patch(other.customer, second.id, { images: [] }).expect(200);

      expect(cleared.body.data.images).toEqual([]);
    });

    it('a rejected edit (bad images, link, empty body) does not use up the one allowed edit', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const stranger = await b.user();
      const review = await writeReview(t, entry);

      const foreignImage = await patch(entry.customer, review.id, { images: [await uploadedReviewImage(t, stranger)] });
      const link = await patch(entry.customer, review.id, { content: 'xem http://spam.test' });
      const empty = await patch(entry.customer, review.id, {});

      expect(error(foreignImage)).toMatchObject({ status: 400, errorCode: 1908 });
      expect(error(link)).toMatchObject({ status: 400, errorCode: 1905 });
      expect(error(empty)).toMatchObject({ status: 400, errorCode: 1909 });
      await patch(entry.customer, review.id, { title: 'Giờ mới sửa' }).expect(200);
    });

    it('refuses an edit after the 30-day window and on a hidden review (1904)', async () => {
      const [late, hidden] = [await deliveredPaidOrder(t, b), await deliveredPaidOrder(t, b)];
      const lateReview = await writeReview(t, late);
      const hiddenReview = await writeReview(t, hidden);
      await rows(`UPDATE reviews SET created_at = now() - interval '31 days' WHERE id = $1`, [lateReview.id]);
      await rows(`UPDATE reviews SET status = 'HIDDEN', moderation_note = 'Spam' WHERE id = $1`, [hiddenReview.id]);

      const expired = await patch(late.customer, lateReview.id, { title: 'Muộn' });
      const blocked = await patch(hidden.customer, hiddenReview.id, { title: 'Bị ẩn' });

      expect(error(expired)).toMatchObject({ status: 400, errorCode: 1904, message: 'The edit period of this review has ended' });
      expect(error(blocked)).toMatchObject({ status: 400, errorCode: 1904, message: 'A hidden review cannot be edited' });
    });

    it('answers 404 / 1901 for an unknown review and for another customer’s review, which stays unchanged', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const stranger = await b.user();
      const review = await writeReview(t, entry, { title: 'Gốc' });

      const foreign = await patch(stranger, review.id, { title: 'Chiếm' });
      const unknown = await patch(entry.customer, 'zzzzzzzzzzzzzzzz', { title: 'x' });

      expect(error(foreign)).toMatchObject({ status: 404, errorCode: 1901 });
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1901 });
      expect(await rows('SELECT title, edited_at FROM reviews')).toEqual([{ title: 'Gốc', edited_at: null }]);
    });

    it('lets exactly one of two simultaneous edits through', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const review = await writeReview(t, entry);

      const results = await Promise.all([
        patch(entry.customer, review.id, { title: 'A' }),
        patch(entry.customer, review.id, { title: 'B' }),
      ]);

      expect(results.map((res) => res.status).sort()).toEqual([200, 400]);
      expect(results.find((res) => res.status === 400)?.body.errorCode).toBe(1904);
    });

    it.each([
      ['a rating of 6', { rating: 6 }],
      ['a rating of 0', { rating: 0 }],
      ['a title longer than 255 characters', { title: 'x'.repeat(256) }],
      ['a content longer than 2000 characters', { content: 'x'.repeat(2001) }],
      ['an unknown fit', { fit: 'tight' }],
      ['more than 5 images', { images: ['1', '2', '3', '4', '5', '6'].map((n) => `https://x.test/${n}.jpg`) }],
      ['an unknown field', { status: 'HIDDEN' }],
    ])('rejects %s with a validation error (no errorCode) and keeps the review editable', async (_name, body) => {
      const entry = await deliveredPaidOrder(t, b);
      const review = await writeReview(t, entry);

      const res = await patch(entry.customer, review.id, body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await rows('SELECT edited_at FROM reviews')).toEqual([{ edited_at: null }]);
    });
  });

  describe('DELETE /api/reviews/:reviewId/helpful', () => {
    const vote = (user: User, reviewId: string) => t.api.post(`/api/reviews/${reviewId}/helpful`).set(bearer(t, user));
    const unvote = (user: User, reviewId: string) => t.api.delete(`/api/reviews/${reviewId}/helpful`).set(bearer(t, user));

    it('removes only my vote and recounts, so other people’s votes stay', async () => {
      const product = await b.product();
      const review = await b.review(product);
      const [me, other] = [await b.user(), await b.user()];
      await vote(me, review.id).expect(201);
      await vote(other, review.id).expect(201);

      const res = await unvote(me, review.id).expect(200);

      expect(res.body.data).toEqual({ reviewId: review.id, helpfulCount: 1, voted: false });
      expect(await rows('SELECT user_id FROM review_votes')).toEqual([{ user_id: other.id }]);
      expect(await rows('SELECT helpful_count FROM reviews')).toEqual([{ helpful_count: 1 }]);
    });

    it('is idempotent: without a vote it changes nothing and still answers voted false', async () => {
      const review = await b.review(await b.product());
      const user = await b.user();

      const first = await unvote(user, review.id).expect(200);
      const second = await unvote(user, review.id).expect(200);

      expect(first.body.data).toEqual({ reviewId: review.id, helpfulCount: 0, voted: false });
      expect(second.body.data.helpfulCount).toBe(0);
    });

    it('answers 404 / 1901 for an unknown or hidden review (a vote on a hidden review stays)', async () => {
      const review = await b.review(await b.product());
      const user = await b.user();
      await vote(user, review.id).expect(201);
      await rows(`UPDATE reviews SET status = 'HIDDEN', moderation_note = 'Spam' WHERE id = $1`, [review.id]);

      const hidden = await unvote(user, review.id);
      const unknown = await unvote(user, 'zzzzzzzzzzzzzzzz');

      expect(error(hidden)).toMatchObject({ status: 404, errorCode: 1901 });
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1901 });
      expect(await rows('SELECT 1 FROM review_votes')).toHaveLength(1);
    });

    it('waits for the review lock and then counts the votes as committed (hidden meanwhile → 404)', async () => {
      const review = await b.review(await b.product());
      const user = await b.user();
      await vote(user, review.id).expect(201);

      const res = await requestWhileRowLocked(
        t.dataSource,
        { table: 'reviews', id: review.id },
        () => unvote(user, review.id),
        (runner) => runner.query(`UPDATE reviews SET status = 'HIDDEN', moderation_note = 'Spam' WHERE id = $1`, [review.id]),
      );

      expect(error(res)).toMatchObject({ status: 404, errorCode: 1901 });
      expect(await rows('SELECT 1 FROM review_votes')).toHaveLength(1);
    });
  });
});
