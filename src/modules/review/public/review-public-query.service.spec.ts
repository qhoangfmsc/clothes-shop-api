import { review } from '../shared/review.test-utils';
import { setupPublic } from './public.test-utils';

describe('ReviewService public list and summary', () => {
  it('lists only published reviews, applies filters and hides internal fields', async () => {
    const ctx = setupPublic();
    ctx.result.many = [
      review({
        author: 'A',
        avatar: '',
        date: '2026-01-01',
        verified: true,
        size: 'M',
        color: 'white',
        reply: 'Hi',
        repliedAt: new Date(),
      }),
    ];
    ctx.result.total = 1;

    const res = await ctx.queries.findByProductId('p1', { rating: 5, fit: 'large', sort: '-helpfulCount', page: 2, limit: 10 });

    expect(ctx.calls.where).toEqual(
      expect.arrayContaining([
        ['r.productId = :productId', { productId: 'p1' }],
        ['r.status = :status', { status: 'PUBLISHED' }],
        ['r.rating = :rating', { rating: 5 }],
        ['r.fit = :fit', { fit: 'large' }],
      ]),
    );
    expect(ctx.calls.orderBy).toEqual(['r.helpfulCount', 'DESC']);
    expect([ctx.calls.skip, ctx.calls.take]).toEqual([10, 10]);
    expect(res).toMatchObject({ total: 1, page: 2, limit: 10, totalPages: 1 });
    expect(res.data[0]).toMatchObject({ id: 'r1', reply: { content: 'Hi' }, helpfulCount: 0 });
    for (const key of ['userId', 'orderItemId', 'status', 'moderationNote']) expect(res.data[0]).not.toHaveProperty(key);
  });

  it('defaults to newest first and does not filter rating/fit when not given', async () => {
    const ctx = setupPublic();
    await ctx.queries.findByProductId('p1');
    expect(ctx.calls.orderBy).toEqual(['r.createdAt', 'DESC']);
    expect(ctx.calls.where.map(([sql]) => sql)).toEqual(['r.productId = :productId', 'r.status = :status']);
  });

  it('summarises average, distribution and fit', async () => {
    const ctx = setupPublic();
    ctx.result.raw = [
      [
        { rating: 5, count: '3' },
        { rating: 4, count: '1' },
        { rating: 1, count: '1' },
      ],
      [
        { fit: 'true_to_size', count: '2' },
        { fit: 'small', count: '1' },
      ],
    ];
    const { data } = await ctx.queries.getSummary('p1');
    expect(data).toEqual({
      productId: 'p1',
      ratingCount: 5,
      ratingAverage: 4,
      withImages: 0,
      distribution: { 1: 1, 2: 0, 3: 0, 4: 1, 5: 3 },
      fit: { small: 1, true_to_size: 2, large: 0, total: 3 },
    });
  });

  it('rounds the average to one decimal and returns null with no reviews', async () => {
    const ctx = setupPublic();
    ctx.result.raw = [
      [
        { rating: 5, count: '1' },
        { rating: 4, count: '2' },
      ],
      [],
    ];
    expect((await ctx.queries.getSummary('p1')).data.ratingAverage).toBe(4.3);

    const empty = await setupPublic().queries.getSummary('p1');
    expect(empty.data).toMatchObject({ ratingCount: 0, ratingAverage: null, fit: { total: 0 } });
  });
});

describe('ReviewPublicQueryService images', () => {
  it('hasImages filters the public list and the summary counts photo reviews, using the shared SQL', async () => {
    const ctx = setupPublic();
    await ctx.queries.findByProductId('p1', { hasImages: true });
    expect(ctx.calls.where.map(([sql]) => sql)).toContain('jsonb_array_length(r.images) > 0');

    const none = setupPublic();
    await none.queries.findByProductId('p1', { hasImages: false });
    expect(none.calls.where.map(([sql]) => sql)).toContain('jsonb_array_length(r.images) = 0');

    const summary = setupPublic();
    summary.result.total = 3;
    expect((await summary.queries.getSummary('p1')).data.withImages).toBe(3);
  });
});

describe('ReviewPublicQueryService product summary rounding', () => {
  it('summary rounds half-up exactly like Postgres ROUND (87 / 20 = 4.35 → 4.4)', async () => {
    const ctx = setupPublic();
    ctx.result.raw = [
      [
        { rating: 5, count: '7' },
        { rating: 4, count: '13' },
      ],
      [],
    ];
    expect((await ctx.queries.getSummary('p1')).data.ratingAverage).toBe(4.4);
  });
});
