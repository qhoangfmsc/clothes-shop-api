import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { requestWhileRowLocked } from '../../support/locks';
import { deliveredPaidOrder } from '../order-payment/steps';
import { writeReview } from './steps';

/** Batch 11–12 (review, admin): danh sách, chi tiết, ẩn, hiện lại, đặt và xoá phản hồi. */
describe('Flow: reviews (admin)', () => {
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
  const adminList = (admin: User, query: object = {}) => t.api.get('/api/admin/reviews').query(query).set(bearer(t, admin));
  const adminGet = (admin: User, reviewId: string) => t.api.get(`/api/admin/reviews/${reviewId}`).set(bearer(t, admin));
  const hide = (admin: User, reviewId: string, body: object = { note: 'Chứa liên kết quảng cáo' }) =>
    t.api.post(`/api/admin/reviews/${reviewId}/hide`).set(bearer(t, admin)).send(body);
  const publish = (admin: User, reviewId: string) => t.api.post(`/api/admin/reviews/${reviewId}/publish`).set(bearer(t, admin));
  const reply = (admin: User, reviewId: string, body: object = { content: 'Cảm ơn bạn!' }) =>
    t.api.put(`/api/admin/reviews/${reviewId}/reply`).set(bearer(t, admin)).send(body);
  const removeReply = (admin: User, reviewId: string) => t.api.delete(`/api/admin/reviews/${reviewId}/reply`).set(bearer(t, admin));
  const ids = (res: { body: { data: { id: string }[] } }) => res.body.data.map((row) => row.id);
  const day = (offset: number) => new Date(Date.UTC(2026, 9, 1 + offset, 12));
  const productRating = (id: string) =>
    rows<{ rating_average: string | null; rating_count: number }>('SELECT rating_average, rating_count FROM products WHERE id = $1', [
      id,
    ]).then((r) => ({ average: r[0].rating_average === null ? null : Number(r[0].rating_average), count: r[0].rating_count }));
  const publicList = (productId: string) => t.api.get(`/api/reviews/${productId}`).expect(200);

  describe('GET /api/admin/reviews', () => {
    it('lists every review of every customer, hidden ones too, with the admin view', async () => {
      const admin = await b.admin();
      const [user, product] = [await b.user(), await b.product()];
      const [shown, hidden] = [
        await b.review(product, { userId: user.id, createdAt: day(2), reply: 'Cảm ơn', repliedBy: admin.id, repliedAt: day(3) }),
        await b.review(await b.product(), {
          createdAt: day(1),
          status: 'HIDDEN',
          moderationNote: 'Spam',
          moderatedBy: admin.id,
          moderatedAt: day(2),
        }),
      ];

      const res = await adminList(admin).expect(200);

      expect(ids(res)).toEqual([shown.id, hidden.id]);
      expect(res.body).toMatchObject({ total: 2, page: 1, limit: 25, totalPages: 1 });
      expect(res.body.data[0]).toMatchObject({
        id: shown.id,
        productId: product.id,
        orderItemId: null,
        userId: user.id,
        status: 'PUBLISHED',
        moderationNote: null,
        moderatedBy: null,
        moderatedAt: null,
        editedAt: null,
        repliedBy: admin.id,
        reply: { content: 'Cảm ơn' },
        product: { id: product.id, slug: product.slug, category: { id: expect.any(String) }, subcategory: { id: expect.any(String) } },
      });
      expect(res.body.data[1]).toMatchObject({ status: 'HIDDEN', moderationNote: 'Spam', moderatedBy: admin.id });
    });

    it('filters by status, rating, fit, photos, reply, product slug and reviewer', async () => {
      const admin = await b.admin();
      const [user, p1, p2] = [await b.user(), await b.product(), await b.product()];
      const a = await b.review(p1, { rating: 5, fit: 'small', images: ['https://x.test/a.jpg'], createdAt: day(1), userId: user.id });
      const c = await b.review(p1, { rating: 2, fit: 'large', status: 'HIDDEN', moderationNote: 'Spam', createdAt: day(2) });
      const d = await b.review(p2, { rating: 4, reply: 'Cảm ơn', repliedBy: admin.id, repliedAt: day(4), createdAt: day(3) });

      expect(ids(await adminList(admin, { status: 'HIDDEN' }).expect(200))).toEqual([c.id]);
      expect(ids(await adminList(admin, { rating: 4 }).expect(200))).toEqual([d.id]);
      expect(ids(await adminList(admin, { fit: 'small' }).expect(200))).toEqual([a.id]);
      expect(ids(await adminList(admin, { hasImages: true }).expect(200))).toEqual([a.id]);
      expect(ids(await adminList(admin, { hasImages: false }).expect(200))).toEqual([d.id, c.id]);
      expect(ids(await adminList(admin, { replied: true }).expect(200))).toEqual([d.id]);
      expect(ids(await adminList(admin, { replied: false }).expect(200))).toEqual([c.id, a.id]);
      expect(ids(await adminList(admin, { product: p1.slug }).expect(200))).toEqual([c.id, a.id]);
      expect(ids(await adminList(admin, { product: 'khong-co-slug-nay' }).expect(200))).toEqual([]);
      expect(ids(await adminList(admin, { userId: user.id }).expect(200))).toEqual([a.id]);
      expect(ids(await adminList(admin, { status: 'PUBLISHED', replied: false }).expect(200))).toEqual([a.id]);
    });

    it('searches the title, content, author and product name, and sorts and paginates', async () => {
      const admin = await b.admin();
      const [shirt, hat] = [await b.product({ name: 'Áo thun Mây' }), await b.product({ name: 'Mũ len' })];
      const a = await b.review(shirt, {
        title: 'Rất đẹp',
        content: 'Vải mát',
        author: 'Lan',
        rating: 5,
        helpfulCount: 1,
        createdAt: day(1),
      });
      const c = await b.review(hat, {
        title: 'Tạm',
        content: 'Hơi chật mùa hè',
        author: 'Minh',
        rating: 3,
        helpfulCount: 9,
        createdAt: day(2),
      });
      const d = await b.review(hat, { title: 'Ổn', content: 'ok', author: 'Hùng', rating: 4, helpfulCount: 5, createdAt: day(3) });

      expect(ids(await adminList(admin, { search: 'đẹp' }).expect(200))).toEqual([a.id]);
      expect(ids(await adminList(admin, { search: 'MÙA hè' }).expect(200))).toEqual([c.id]);
      expect(ids(await adminList(admin, { search: 'minh' }).expect(200))).toEqual([c.id]);
      expect(ids(await adminList(admin, { search: 'mũ len' }).expect(200))).toEqual([d.id, c.id]);
      expect(ids(await adminList(admin, { search: 'khong-co' }).expect(200))).toEqual([]);
      expect(ids(await adminList(admin, { sort: 'rating' }).expect(200))).toEqual([c.id, d.id, a.id]);
      expect(ids(await adminList(admin, { sort: '-helpfulCount' }).expect(200))).toEqual([c.id, d.id, a.id]);
      expect(ids(await adminList(admin, { sort: 'createdAt' }).expect(200))).toEqual([a.id, c.id, d.id]);
      const page = await adminList(admin, { limit: 2, page: 2 }).expect(200);
      expect(ids(page)).toEqual([a.id]);
      expect(page.body).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });
    });

    it('is empty without reviews', async () => {
      const res = await adminList(await b.admin()).expect(200);

      expect(res.body).toMatchObject({ data: [], total: 0, totalPages: 0 });
    });

    it.each([
      ['an unknown status', { status: 'DELETED' }],
      ['a rating of 6', { rating: 6 }],
      ['an unknown fit', { fit: 'tight' }],
      ['hasImages that is not a boolean', { hasImages: 'yes' }],
      ['replied that is not a boolean', { replied: 'yes' }],
      ['a product longer than 255 characters', { product: 'x'.repeat(256) }],
      ['a userId longer than 16 characters', { userId: 'x'.repeat(17) }],
      ['a search longer than 255 characters', { search: 'x'.repeat(256) }],
      ['a sort field outside the whitelist', { sort: 'author' }],
      ['the removed `sorts` parameter', { sorts: 'rating' }],
      ['a limit above 200', { limit: 201 }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const res = await adminList(await b.admin(), query);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('GET /api/admin/reviews/:reviewId', () => {
    it('shows one review in the admin view, including a hidden one', async () => {
      const admin = await b.admin();
      const hidden = await b.review(await b.product(), {
        status: 'HIDDEN',
        moderationNote: 'Spam',
        moderatedBy: admin.id,
        moderatedAt: day(1),
      });

      const res = await adminGet(admin, hidden.id).expect(200);

      expect(res.body.data).toMatchObject({
        id: hidden.id,
        status: 'HIDDEN',
        moderationNote: 'Spam',
        moderatedBy: admin.id,
        product: { id: hidden.productId },
      });
    });

    it('answers 404 / 1901 for an unknown review', async () => {
      const res = await adminGet(await b.admin(), 'zzzzzzzzzzzzzzzz');

      expect(error(res)).toMatchObject({ status: 404, errorCode: 1901 });
    });
  });

  describe('POST /api/admin/reviews/:reviewId/hide', () => {
    it('hides with the reason (trimmed), removes it from the public list, the summary and the product rating, and tells the author', async () => {
      const admin = await b.admin();
      const entry = await deliveredPaidOrder(t, b);
      await b.review(entry.product, { rating: 3 });
      const review = await writeReview(t, entry, { rating: 5 });
      expect(await productRating(entry.product.id)).toEqual({ average: 4, count: 2 });

      const res = await hide(admin, review.id, { note: '  Chứa số điện thoại ' }).expect(201);

      expect(res.body.data).toMatchObject({
        status: 'HIDDEN',
        moderationNote: 'Chứa số điện thoại',
        moderatedBy: admin.id,
        moderatedAt: expect.any(String),
      });
      expect(await productRating(entry.product.id)).toEqual({ average: 3, count: 1 });
      expect((await publicList(entry.product.id)).body.total).toBe(1);
      const summary = await t.api.get(`/api/reviews/${entry.product.id}/summary`).expect(200);
      expect(summary.body.data).toMatchObject({ ratingCount: 1, ratingAverage: 3 });
      const mine = await t.api.get('/api/my-reviews').set(bearer(t, entry.customer)).expect(200);
      expect(mine.body.data[0]).toMatchObject({ id: review.id, status: 'HIDDEN', moderationNote: 'Chứa số điện thoại', canEdit: false });
      const vote = await t.api.post(`/api/reviews/${review.id}/helpful`).set(bearer(t, await b.user()));
      expect(error(vote)).toMatchObject({ status: 404, errorCode: 1901 });
    });

    it('hiding the last published review empties the product rating', async () => {
      const admin = await b.admin();
      const entry = await deliveredPaidOrder(t, b);
      const review = await writeReview(t, entry, { rating: 2 });

      await hide(admin, review.id).expect(201);

      expect(await productRating(entry.product.id)).toEqual({ average: null, count: 0 });
    });

    it('refuses a review that is already hidden (400 / 1906) and an unknown one (404 / 1901)', async () => {
      const admin = await b.admin();
      const review = await b.review(await b.product(), { status: 'HIDDEN', moderationNote: 'Spam' });

      const again = await hide(admin, review.id);
      const unknown = await hide(admin, 'zzzzzzzzzzzzzzzz');

      expect(error(again)).toMatchObject({ status: 400, errorCode: 1906 });
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1901 });
      expect(await rows('SELECT moderation_note FROM reviews')).toEqual([{ moderation_note: 'Spam' }]);
    });

    it.each([
      ['a missing note', {}],
      ['an empty note', { note: '   ' }],
      ['a note longer than 500 characters', { note: 'x'.repeat(501) }],
      ['an unknown field', { note: 'Lý do', status: 'PUBLISHED' }],
    ])('rejects %s with a validation error (no errorCode) and keeps the review published', async (_name, body) => {
      const admin = await b.admin();
      const review = await b.review(await b.product());

      const res = await hide(admin, review.id, body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await rows('SELECT status FROM reviews')).toEqual([{ status: 'PUBLISHED' }]);
    });

    it('lets exactly one of two simultaneous hides through, and waits for the review lock', async () => {
      const admin = await b.admin();
      const [review, locked] = [await b.review(await b.product()), await b.review(await b.product())];

      const both = await Promise.all([hide(admin, review.id), hide(admin, review.id)]);
      const waited = await requestWhileRowLocked(
        t.dataSource,
        { table: 'reviews', id: locked.id },
        () => hide(admin, locked.id),
        (runner) => runner.query(`UPDATE reviews SET status = 'HIDDEN', moderation_note = 'Đã ẩn' WHERE id = $1`, [locked.id]),
      );

      expect(both.map((res) => res.status).sort()).toEqual([201, 400]);
      expect(both.find((res) => res.status === 400)?.body.errorCode).toBe(1906);
      expect(error(waited)).toMatchObject({ status: 400, errorCode: 1906 });
    });
  });

  describe('POST /api/admin/reviews/:reviewId/publish', () => {
    it('shows a hidden review again: clears the note, keeps the votes, restores the product rating', async () => {
      const admin = await b.admin();
      const entry = await deliveredPaidOrder(t, b);
      const review = await writeReview(t, entry, { rating: 4 });
      const voter = await b.user();
      await t.api.post(`/api/reviews/${review.id}/helpful`).set(bearer(t, voter)).expect(201);
      await hide(admin, review.id).expect(201);
      expect(await productRating(entry.product.id)).toEqual({ average: null, count: 0 });

      const res = await publish(admin, review.id).expect(201);

      expect(res.body.data).toMatchObject({ status: 'PUBLISHED', moderationNote: null, moderatedBy: admin.id, helpfulCount: 1 });
      expect(await productRating(entry.product.id)).toEqual({ average: 4, count: 1 });
      expect((await publicList(entry.product.id)).body.total).toBe(1);
      expect(await rows('SELECT 1 FROM review_votes')).toHaveLength(1);
    });

    it('refuses a review that is already published (400 / 1906) and an unknown one (404 / 1901)', async () => {
      const admin = await b.admin();
      const review = await b.review(await b.product());

      const again = await publish(admin, review.id);
      const unknown = await publish(admin, 'zzzzzzzzzzzzzzzz');

      expect(error(again)).toMatchObject({ status: 400, errorCode: 1906 });
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1901 });
    });
  });

  describe('PUT /api/admin/reviews/:reviewId/reply', () => {
    it('sets the shop reply (trimmed) with who and when, shows it publicly and replaces it on the next call', async () => {
      const admin = await b.admin();
      const entry = await deliveredPaidOrder(t, b);
      const review = await writeReview(t, entry);

      const first = await reply(admin, review.id, { content: '  Cảm ơn bạn đã ủng hộ! ' }).expect(200);
      const publicShown = (await publicList(entry.product.id)).body.data[0];
      const second = await reply(admin, review.id, { content: 'Shop xin lỗi vì sự bất tiện.' }).expect(200);

      expect(first.body.data).toMatchObject({
        reply: { content: 'Cảm ơn bạn đã ủng hộ!', repliedAt: expect.any(String) },
        repliedBy: admin.id,
      });
      expect(publicShown.reply).toMatchObject({ content: 'Cảm ơn bạn đã ủng hộ!' });
      expect(second.body.data.reply.content).toBe('Shop xin lỗi vì sự bất tiện.');
      expect(await rows('SELECT reply, replied_by FROM reviews')).toEqual([
        { reply: 'Shop xin lỗi vì sự bất tiện.', replied_by: admin.id },
      ]);
    });

    it('does not change the product rating or the review’s edit right', async () => {
      const admin = await b.admin();
      const entry = await deliveredPaidOrder(t, b);
      const review = await writeReview(t, entry, { rating: 4 });

      const res = await reply(admin, review.id).expect(200);

      expect(res.body.data).toMatchObject({ rating: 4, edited: false });
      expect(await productRating(entry.product.id)).toEqual({ average: 4, count: 1 });
      await t.api.patch(`/api/reviews/${review.id}`).set(bearer(t, entry.customer)).send({ title: 'Sửa được' }).expect(200);
    });

    it('answers 404 / 1901 for an unknown review', async () => {
      const res = await reply(await b.admin(), 'zzzzzzzzzzzzzzzz');

      expect(error(res)).toMatchObject({ status: 404, errorCode: 1901 });
    });

    it.each([
      ['a missing content', {}],
      ['an empty content', { content: '   ' }],
      ['a content longer than 1000 characters', { content: 'x'.repeat(1001) }],
      ['a non-string content', { content: 5 }],
      ['an unknown field', { content: 'Cảm ơn', repliedBy: 'x' }],
    ])('rejects %s with a validation error (no errorCode) and sets no reply', async (_name, body) => {
      const admin = await b.admin();
      const review = await b.review(await b.product());

      const res = await reply(admin, review.id, body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await rows('SELECT reply, replied_at FROM reviews')).toEqual([{ reply: null, replied_at: null }]);
    });
  });

  describe('DELETE /api/admin/reviews/:reviewId/reply', () => {
    it('removes the reply, who and when, and hides it from the public list', async () => {
      const admin = await b.admin();
      const entry = await deliveredPaidOrder(t, b);
      const review = await writeReview(t, entry);
      await reply(admin, review.id).expect(200);

      const res = await removeReply(admin, review.id).expect(200);

      expect(res.body.data).toMatchObject({ reply: null, repliedBy: null });
      expect((await publicList(entry.product.id)).body.data[0].reply).toBeNull();
      expect(await rows('SELECT reply, replied_by, replied_at FROM reviews')).toEqual([
        { reply: null, replied_by: null, replied_at: null },
      ]);
    });

    it('is idempotent for a review without a reply and answers 404 / 1901 for an unknown one', async () => {
      const admin = await b.admin();
      const review = await b.review(await b.product());

      const none = await removeReply(admin, review.id).expect(200);
      const unknown = await removeReply(admin, 'zzzzzzzzzzzzzzzz');

      expect(none.body.data.reply).toBeNull();
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1901 });
    });
  });
});
