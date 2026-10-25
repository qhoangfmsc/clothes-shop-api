import { ValidationPipe } from '@nestjs/common';
import { Product } from '../../product/product.entity';
import { Review } from '../shared/review.entity';
import { type Row, rejects, review } from '../shared/review.test-utils';
import { HideReviewDto } from './dtos/hide-review.dto';
import { setupModeration } from './moderation.test-utils';

describe('ReviewService admin moderation', () => {
  const adminView = (rows: Row[]) => rows[0];

  it('hides a published review with a note and shows it again', async () => {
    const ctx = setupModeration({ reviews: [review()] });
    const hidden = await ctx.service.hide('admin1', 'r1', { note: 'Contains personal info' } as HideReviewDto);
    expect(adminView(ctx.rows(Review))).toMatchObject({
      status: 'HIDDEN',
      moderationNote: 'Contains personal info',
      moderatedBy: 'admin1',
    });
    expect(hidden.data).toMatchObject({ status: 'HIDDEN', moderatedBy: 'admin1' });

    await rejects(ctx.service.hide('admin1', 'r1', { note: 'again' }), { errorCode: 1906, status: 400 });

    const shown = await ctx.service.publish('admin2', 'r1');
    expect(adminView(ctx.rows(Review))).toMatchObject({ status: 'PUBLISHED', moderationNote: null, moderatedBy: 'admin2' });
    expect(shown.data.status).toBe('PUBLISHED');
    await rejects(ctx.service.publish('admin2', 'r1'), { errorCode: 1906, status: 400 });
  });

  it('sets, replaces and removes the shop reply', async () => {
    const ctx = setupModeration({ reviews: [review()] });
    const first = await ctx.service.reply('admin1', 'r1', { content: 'Thanks!' });
    expect(first.data.reply).toMatchObject({ content: 'Thanks!' });
    expect(adminView(ctx.rows(Review))).toMatchObject({ reply: 'Thanks!', repliedBy: 'admin1' });

    await ctx.service.reply('admin2', 'r1', { content: 'Updated' });
    expect(adminView(ctx.rows(Review))).toMatchObject({ reply: 'Updated', repliedBy: 'admin2' });

    const removed = await ctx.service.removeReply('r1');
    expect(removed.data.reply).toBeNull();
    expect(adminView(ctx.rows(Review))).toMatchObject({ reply: null, repliedBy: null, repliedAt: null });
  });

  it('404s for unknown reviews', async () => {
    const ctx = setupModeration();
    await rejects(ctx.service.hide('admin1', 'nope', { note: 'x' }), { errorCode: 1901, status: 404 });
    await rejects(ctx.service.reply('admin1', 'nope', { content: 'x' }), { errorCode: 1901, status: 404 });
    await rejects(ctx.queries.findOneAdmin('nope'), { errorCode: 1901, status: 404 });
  });
});

describe('review DTOs', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const run = (metatype: new () => object, body: unknown) => pipe.transform(body, { type: 'body', metatype });

  it('HideReviewDto requires a non-empty note', async () => {
    await expect(run(HideReviewDto, { note: '  spam  ' })).resolves.toMatchObject({ note: 'spam' });
    await expect(run(HideReviewDto, { note: '   ' })).rejects.toMatchObject({ status: 400 });
    await expect(run(HideReviewDto, {})).rejects.toMatchObject({ status: 400 });
  });
});

describe('ReviewModerationQueryService images', () => {
  it('hasImages filters the admin list with the same SQL as the public side', async () => {
    const admin = setupModeration();
    await admin.queries.findAllAdmin({ hasImages: true });
    expect(admin.calls.where.map(([sql]) => sql)).toContain('jsonb_array_length(r.images) > 0');
  });
});

describe('ReviewModerationService keeps products.rating_* in sync', () => {
  const productRow = (rows: (e: any) => Row[]) => rows(Product)[0];

  it('hiding removes a review from the rating, and publishing brings it back', async () => {
    const ctx = setupModeration({
      reviews: [review({ id: 'a', rating: 5, orderItemId: 'x1' }), review({ id: 'b', rating: 3, orderItemId: 'x2' })],
    });
    await ctx.service.hide('admin1', 'b', { note: 'spam' });
    expect(productRow(ctx.rows)).toMatchObject({ ratingCount: 1, ratingAverage: 5 });

    await ctx.service.publish('admin1', 'b');
    expect(productRow(ctx.rows)).toMatchObject({ ratingCount: 2, ratingAverage: 4 });
  });

  it('hiding the last published review resets the product to "no rating"', async () => {
    const ctx = setupModeration({ reviews: [review({ rating: 5 })] });
    await ctx.service.hide('admin1', 'r1', { note: 'spam' });
    expect(productRow(ctx.rows)).toMatchObject({ ratingCount: 0, ratingAverage: null });
  });

  it('replies leave the product rating alone', async () => {
    const ctx = setupModeration({ reviews: [review({ userId: 'author' })] });
    await ctx.service.reply('admin1', 'r1', { content: 'Thanks' });
    expect(ctx.manager.update.mock.calls.some(([entity]: any) => entity === Product)).toBe(false);
  });
});

describe('ReviewService.countAwaitingReply', () => {
  it('counts published reviews without a shop reply — the same condition as the admin list', async () => {
    const ctx = setupModeration();
    ctx.result.total = 9;
    expect(await ctx.queries.countAwaitingReply()).toBe(9);
    expect(ctx.calls.where.map(([sql]) => sql)).toEqual(['r.status = :status', 'r.reply IS NULL']);

    const list = setupModeration();
    await list.queries.findAllAdmin({ status: 'PUBLISHED', replied: false });
    expect(list.calls.where.map(([sql]) => sql)).toEqual(expect.arrayContaining(['r.status = :status', 'r.reply IS NULL']));
  });
});

describe('ReviewModerationQueryService product summary', () => {
  const product = {
    id: 'p1',
    name: 'Áo',
    slug: 'ao',
    images: ['a.jpg'],
    badge: 'sale',
    price: 1,
    category: { id: 'c1', slug: 'ao', title: 'Áo', subcategories: [] },
    subcategory: { id: 's1', slug: 'thun', label: 'Thun', category: {} },
  };
  const summary = {
    id: 'p1',
    name: 'Áo',
    slug: 'ao',
    image: 'a.jpg',
    badge: 'sale',
    category: { id: 'c1', slug: 'ao', title: 'Áo' },
    subcategory: { id: 's1', slug: 'thun', label: 'Thun' },
  };

  it('admin list shows the same product summary, with category/subcategory for links', async () => {
    const admin = setupModeration();
    admin.result.many = [review({ product })];
    admin.result.total = 1;
    expect((await admin.queries.findAllAdmin({})).data[0].product).toEqual(summary);
  });
});
