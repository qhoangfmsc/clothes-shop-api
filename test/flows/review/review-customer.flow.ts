import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { deliveredPaidOrder, placeAndPayOrder, placeOrder } from '../order-payment/steps';
import { useStorageEnv, writeReview } from './steps';

/** Batch 10 (review, khách): bấm "hữu ích", upload ảnh, đánh giá của tôi, dòng hàng chờ đánh giá, phiếu đã bấm. */
describe('Flow: reviews (customer)', () => {
  let t: TestApp;
  let b: Builders;
  let restoreEnv: () => void;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
    restoreEnv = useStorageEnv();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await truncateAll(t.dataSource);
  });
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
  const vote = (user: User, reviewId: string) => t.api.post(`/api/reviews/${reviewId}/helpful`).set(bearer(t, user));
  const get = (user: User, path: string, query: object = {}) => t.api.get(path).query(query).set(bearer(t, user));
  const ids = (res: { body: { data: { id: string }[] } }) => res.body.data.map((row) => row.id);
  const day = (offset: number) => new Date(Date.UTC(2026, 9, 1 + offset, 12));

  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
  const upload = (user: User, file?: { content: Buffer; filename?: string; contentType?: string }) => {
    const req = t.api.post('/api/reviews/images').set(bearer(t, user));
    return file
      ? req.attach('file', file.content, { filename: file.filename ?? 'photo.jpg', contentType: file.contentType ?? 'image/jpeg' })
      : req;
  };
  const storageOk = () => jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

  describe('POST /api/reviews/:reviewId/helpful', () => {
    it('adds my vote and counts it, repeating changes nothing, and other people’s votes add up', async () => {
      const review = await b.review(await b.product());
      const [me, other] = [await b.user(), await b.user()];

      const first = await vote(me, review.id).expect(201);
      const again = await vote(me, review.id).expect(201);
      const second = await vote(other, review.id).expect(201);

      expect(first.body.data).toEqual({ reviewId: review.id, helpfulCount: 1, voted: true });
      expect(again.body.data.helpfulCount).toBe(1);
      expect(second.body.data.helpfulCount).toBe(2);
      expect(await rows('SELECT user_id FROM review_votes ORDER BY created_at')).toEqual([{ user_id: me.id }, { user_id: other.id }]);
      expect(await rows('SELECT helpful_count FROM reviews')).toEqual([{ helpful_count: 2 }]);
    });

    it('recounts from the votes, not from the stored number', async () => {
      const review = await b.review(await b.product(), { helpfulCount: 40 });
      const user = await b.user();

      const res = await vote(user, review.id).expect(201);

      expect(res.body.data.helpfulCount).toBe(1);
    });

    it('keeps the count right when many people vote at once, and one person voting twice at once counts once', async () => {
      const review = await b.review(await b.product());
      const voters = await Promise.all([b.user(), b.user(), b.user(), b.user()]);

      const results = await Promise.all([...voters.map((user) => vote(user, review.id)), vote(voters[0], review.id)]);

      expect(results.map((res) => res.status)).toEqual([201, 201, 201, 201, 201]);
      expect(await rows('SELECT helpful_count FROM reviews')).toEqual([{ helpful_count: 4 }]);
      expect(await rows('SELECT 1 FROM review_votes')).toHaveLength(4);
    });

    it('refuses to vote my own review (400 / 1907)', async () => {
      const entry = await deliveredPaidOrder(t, b);
      const review = await writeReview(t, entry);

      const res = await vote(entry.customer, review.id);

      expect(error(res)).toMatchObject({ status: 400, errorCode: 1907 });
      expect(await rows('SELECT 1 FROM review_votes')).toHaveLength(0);
    });

    it('answers 404 / 1901 for an unknown or hidden review', async () => {
      const review = await b.review(await b.product(), { status: 'HIDDEN', moderationNote: 'Spam' });
      const user = await b.user();

      const hidden = await vote(user, review.id);
      const unknown = await vote(user, 'zzzzzzzzzzzzzzzz');

      expect(error(hidden)).toMatchObject({ status: 404, errorCode: 1901 });
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1901 });
      expect(await rows('SELECT 1 FROM review_votes')).toHaveLength(0);
    });
  });

  describe('POST /api/reviews/images', () => {
    it('stores the picture in the bucket and records it for the user, with the type taken from the bytes', async () => {
      const user = await b.user();
      const fetchSpy = storageOk();

      const res = await upload(user, { content: PNG, filename: 'ảnh áo.png', contentType: 'application/octet-stream' }).expect(201);

      expect(res.body.data).toEqual({
        url: expect.stringMatching(/^https:\/\/storage\.flow\.test\/storage\/v1\/object\/public\/flow-bucket\//),
        mimeType: 'image/png',
        size: PNG.length,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [target, init] = fetchSpy.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
      expect(target).toMatch(/^https:\/\/storage\.flow\.test\/storage\/v1\/object\/flow-bucket\/[0-9a-f]{12}-/);
      expect(init).toMatchObject({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'image/png',
          'x-upsert': 'false',
          Authorization: 'Bearer flow-key',
          apikey: 'flow-key',
        }),
      });
      expect(await rows('SELECT purpose, uploaded_by, mime_type, size FROM media_files')).toEqual([
        { purpose: 'REVIEW', uploaded_by: user.id, mime_type: 'image/png', size: PNG.length },
      ]);
    });

    it('accepts JPEG and WebP too, and the returned URL can be attached to a review', async () => {
      const entry = await deliveredPaidOrder(t, b);
      storageOk();

      const jpeg = await upload(entry.customer, { content: JPEG }).expect(201);
      const webp = await upload(entry.customer, { content: WEBP, filename: 'a.webp', contentType: 'image/webp' }).expect(201);
      const review = await writeReview(t, entry, { images: [jpeg.body.data.url, webp.body.data.url] });

      expect([jpeg.body.data.mimeType, webp.body.data.mimeType]).toEqual(['image/jpeg', 'image/webp']);
      expect(await rows('SELECT images FROM reviews WHERE id = $1', [review.id])).toEqual([
        { images: [jpeg.body.data.url, webp.body.data.url] },
      ]);
    });

    it('does not show review pictures in the admin media library', async () => {
      const [user, admin] = [await b.user(), await b.admin()];
      storageOk();
      await upload(user, { content: JPEG }).expect(201);

      const res = await t.api.get('/api/admin/media').set(bearer(t, admin)).expect(200);

      expect(res.body.total).toBe(0);
    });

    it('answers 400 / 1602 without a file and 400 / 1603 for a file that is not a picture, whatever the client claims', async () => {
      const user = await b.user();
      const fetchSpy = storageOk();

      const none = await upload(user);
      const text = await upload(user, { content: Buffer.from('<script>alert(1)</script>'), filename: 'x.jpg', contentType: 'image/jpeg' });
      const empty = await upload(user, { content: Buffer.alloc(0) });

      expect(error(none)).toMatchObject({ status: 400, errorCode: 1602 });
      expect(error(text)).toMatchObject({ status: 400, errorCode: 1603 });
      expect(error(empty)).toMatchObject({ status: 400, errorCode: 1602 });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(await rows('SELECT 1 FROM media_files')).toHaveLength(0);
    });

    it('refuses a file over 5 MB with 413 and no errorCode (stopped by the upload interceptor)', async () => {
      const user = await b.user();
      const fetchSpy = storageOk();

      const res = await upload(user, { content: Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]) });

      expect([res.status, res.body.errorCode]).toEqual([413, undefined]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('stops at 30 pictures in 24 hours per user (429 / 1607); older pictures and other users’ do not count', async () => {
      const [user, other] = [await b.user(), await b.user()];
      storageOk();
      const insert = (owner: User, count: number, createdAt: string) =>
        rows(
          `INSERT INTO media_files (id, name, storage_key, mime_type, size, purpose, uploaded_by, created_at, updated_at) SELECT 'm' || substr(md5(random()::text || g::text), 1, 15), 'p.jpg', md5(random()::text || g::text), 'image/jpeg', 10, 'REVIEW', $1, $2::timestamptz, $2::timestamptz FROM generate_series(1, $3) g`,
          [owner.id, createdAt, count],
        );
      await insert(other, 30, new Date().toISOString());
      await insert(user, 29, new Date(Date.now() - 25 * 3_600_000).toISOString());
      await insert(user, 29, new Date().toISOString());

      await upload(user, { content: JPEG }).expect(201);
      const blocked = await upload(user, { content: JPEG });
      await upload(await b.user(), { content: JPEG }).expect(201);

      expect(error(blocked)).toMatchObject({ status: 429, errorCode: 1607 });
      expect(await rows(`SELECT 1 FROM media_files WHERE uploaded_by = $1`, [user.id])).toHaveLength(59);
    });

    it('answers 502 / 1605 when the storage fails or is unreachable and keeps no record; 503 / 1601 when it refuses the key', async () => {
      const user = await b.user();
      const spy = jest.spyOn(globalThis, 'fetch');

      spy.mockResolvedValueOnce(new Response('boom', { status: 500 }));
      const failed = await upload(user, { content: JPEG });
      spy.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
      const unreachable = await upload(user, { content: JPEG });
      spy.mockResolvedValueOnce(new Response('denied', { status: 403 }));
      const denied = await upload(user, { content: JPEG });

      expect(error(failed)).toMatchObject({ status: 502, errorCode: 1605 });
      expect(error(unreachable)).toMatchObject({ status: 502, errorCode: 1605 });
      expect(error(denied)).toMatchObject({ status: 503, errorCode: 1601 });
      expect(await rows('SELECT 1 FROM media_files')).toHaveLength(0);
    });

    it('answers 503 / 1601 naming the missing variables when storage is not configured', async () => {
      const user = await b.user();
      const fetchSpy = storageOk();
      const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = '';

      const res = await upload(user, { content: JPEG });
      process.env.SUPABASE_SERVICE_ROLE_KEY = saved;

      expect(error(res)).toMatchObject({ status: 503, errorCode: 1601, message: expect.stringContaining('SUPABASE_SERVICE_ROLE_KEY') });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/my-reviews', () => {
    it('lists only my reviews, hidden ones too with the moderation note, in the author view', async () => {
      const [me, other] = [await b.user(), await b.user()];
      const [shown, hidden] = [
        await b.review(await b.product(), { userId: me.id, createdAt: day(2), rating: 4 }),
        await b.review(await b.product(), { userId: me.id, createdAt: day(1), status: 'HIDDEN', moderationNote: 'Chứa thông tin cá nhân' }),
      ];
      await b.review(await b.product(), { userId: other.id });
      await b.review(await b.product());

      const res = await get(me, '/api/my-reviews').expect(200);

      expect(ids(res)).toEqual([shown.id, hidden.id]);
      expect(res.body).toMatchObject({ total: 2, page: 1, limit: 25, totalPages: 1 });
      expect(res.body.data[0]).toMatchObject({
        productId: shown.productId,
        status: 'PUBLISHED',
        moderationNote: null,
        canEdit: true,
        edited: false,
        product: { id: shown.productId, category: { id: expect.any(String) }, subcategory: { id: expect.any(String) } },
      });
      expect(res.body.data[0]).not.toHaveProperty('userId');
      expect(res.body.data[1]).toMatchObject({
        status: 'HIDDEN',
        moderationNote: 'Chứa thông tin cá nhân',
        canEdit: false,
        editableUntil: null,
      });
    });

    it('filters by status and product, sorts and paginates', async () => {
      const me = await b.user();
      const products = [await b.product(), await b.product(), await b.product()];
      const made = [
        await b.review(products[0], { userId: me.id, rating: 5, createdAt: day(1) }),
        await b.review(products[1], { userId: me.id, rating: 2, createdAt: day(2), status: 'HIDDEN', moderationNote: 'Spam' }),
        await b.review(products[2], { userId: me.id, rating: 3, createdAt: day(3) }),
      ];

      expect(ids(await get(me, '/api/my-reviews', { status: 'HIDDEN' }).expect(200))).toEqual([made[1].id]);
      expect(ids(await get(me, '/api/my-reviews', { productId: products[2].id }).expect(200))).toEqual([made[2].id]);
      expect(ids(await get(me, '/api/my-reviews', { sort: 'rating' }).expect(200))).toEqual([made[1].id, made[2].id, made[0].id]);
      expect(ids(await get(me, '/api/my-reviews', { sort: 'createdAt' }).expect(200))).toEqual([made[0].id, made[1].id, made[2].id]);
      const page = await get(me, '/api/my-reviews', { limit: 2, page: 2 }).expect(200);
      expect(ids(page)).toEqual([made[0].id]);
      expect(page.body).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });
    });

    it('is empty for someone who has not reviewed anything', async () => {
      const res = await get(await b.user(), '/api/my-reviews').expect(200);

      expect(res.body).toMatchObject({ data: [], total: 0, totalPages: 0 });
    });

    it.each([
      ['an unknown status', { status: 'DELETED' }],
      ['a sort field outside the whitelist', { sort: 'helpfulCount' }],
      ['the removed `sorts` parameter', { sorts: 'rating' }],
      ['a productId longer than 16 characters', { productId: 'x'.repeat(17) }],
      ['a limit above 200', { limit: 201 }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const res = await get(await b.user(), '/api/my-reviews', query);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('GET /api/my-reviews/pending', () => {
    it('lists the delivered, paid lines I have not reviewed, with the deadline, newest delivery first', async () => {
      const me = await b.user();
      const [older, newer] = [await deliveredPaidOrder(t, b, { customer: me }), await deliveredPaidOrder(t, b, { customer: me })];
      await rows(`UPDATE orders SET delivered_at = now() - interval '10 days' WHERE id = $1`, [older.order.id]);

      const res = await get(me, '/api/my-reviews/pending').expect(200);

      expect(res.body.data.map((row: { orderItemId: string }) => row.orderItemId)).toEqual([newer.items[0].id, older.items[0].id]);
      expect(res.body).toMatchObject({ total: 2, page: 1, limit: 25 });
      expect(res.body.data[0]).toMatchObject({
        orderItemId: newer.items[0].id,
        orderId: newer.order.id,
        productId: newer.product.id,
        productName: newer.product.name,
        size: 'M',
        color: 'Black',
        quantity: 2,
        deliveredAt: expect.any(String),
        product: { id: newer.product.id, category: { id: expect.any(String) } },
      });
      const deadline = new Date(res.body.data[1].deliveredAt).getTime() + 30 * 86_400_000;
      expect(new Date(res.body.data[1].reviewDeadline).getTime()).toBe(deadline);
      const asc = await get(me, '/api/my-reviews/pending', { sort: 'deliveredAt' }).expect(200);
      expect(asc.body.data.map((row: { orderItemId: string }) => row.orderItemId)).toEqual([older.items[0].id, newer.items[0].id]);
    });

    it('leaves out lines already reviewed, unpaid or undelivered orders, expired windows, removed products and other people’s lines', async () => {
      const me = await b.user();
      const reviewed = await deliveredPaidOrder(t, b, { customer: me });
      await writeReview(t, reviewed);
      await placeOrder(t, b, { customer: me });
      await placeAndPayOrder(t, b, { customer: me });
      const unpaidDelivered = await placeOrder(t, b, { customer: me });
      await rows(`UPDATE orders SET status = 'delivered', delivered_at = now() WHERE id = $1`, [unpaidDelivered.order.id]);
      const expired = await deliveredPaidOrder(t, b, { customer: me });
      await rows(`UPDATE orders SET delivered_at = now() - interval '31 days' WHERE id = $1`, [expired.order.id]);
      const removed = await deliveredPaidOrder(t, b, { customer: me });
      await rows('UPDATE order_items SET product_id = NULL WHERE order_id = $1', [removed.order.id]);
      await deliveredPaidOrder(t, b);
      const keep = await deliveredPaidOrder(t, b, { customer: me });

      const res = await get(me, '/api/my-reviews/pending').expect(200);

      expect(res.body.data.map((row: { orderItemId: string }) => row.orderItemId)).toEqual([keep.items[0].id]);
      expect(res.body.total).toBe(1);
    });

    it('is empty when nothing waits, and paginates', async () => {
      const me = await b.user();
      expect((await get(me, '/api/my-reviews/pending').expect(200)).body).toMatchObject({ data: [], total: 0 });
      await deliveredPaidOrder(t, b, { customer: me });
      await deliveredPaidOrder(t, b, { customer: me });

      const page = await get(me, '/api/my-reviews/pending', { limit: 1, page: 2 }).expect(200);

      expect(page.body).toMatchObject({ total: 2, page: 2, limit: 1, totalPages: 2 });
      expect(page.body.data).toHaveLength(1);
    });

    it.each([
      ['a sort field outside the whitelist', { sort: 'productName' }],
      ['the removed `sorts` parameter', { sorts: 'deliveredAt' }],
      ['a limit above 200', { limit: 201 }],
      ['a page below 1', { page: 0 }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const res = await get(await b.user(), '/api/my-reviews/pending', query);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('GET /api/my-reviews/votes', () => {
    it('returns the ids of the reviews of that product I voted for, not other products’ or other people’s votes', async () => {
      const [product, otherProduct] = [await b.product(), await b.product()];
      const [me, other] = [await b.user(), await b.user()];
      const [liked, alsoLiked, notLiked, elsewhere] = [
        await b.review(product),
        await b.review(product),
        await b.review(product),
        await b.review(otherProduct),
      ];
      for (const review of [liked, alsoLiked, elsewhere]) await vote(me, review.id).expect(201);
      await vote(other, notLiked.id).expect(201);

      const res = await get(me, '/api/my-reviews/votes', { productId: product.id }).expect(200);
      const none = await get(me, '/api/my-reviews/votes', { productId: 'zzzzzzzzzzzzzzzz' }).expect(200);

      expect([...res.body.data].sort()).toEqual([liked.id, alsoLiked.id].sort());
      expect(none.body).toEqual({ data: [] });
    });

    it('drops a review from the list once I remove my vote', async () => {
      const product = await b.product();
      const review = await b.review(product);
      const me = await b.user();
      await vote(me, review.id).expect(201);
      await t.api.delete(`/api/reviews/${review.id}/helpful`).set(bearer(t, me)).expect(200);

      const res = await get(me, '/api/my-reviews/votes', { productId: product.id }).expect(200);

      expect(res.body.data).toEqual([]);
    });

    it.each([
      ['a missing productId', {}],
      ['an empty productId', { productId: '' }],
      ['a productId longer than 16 characters', { productId: 'x'.repeat(17) }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const res = await get(await b.user(), '/api/my-reviews/votes', query);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });
});
