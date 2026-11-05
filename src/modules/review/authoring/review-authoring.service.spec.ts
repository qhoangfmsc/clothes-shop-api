import { ValidationPipe } from '@nestjs/common';
import { Product } from '../../product/shared/product.entity';
import { Review } from '../shared/review.entity';
import { daysAgo, IMG, order, orderItem, type Row, rejects, review, user } from '../shared/review.test-utils';
import { setupAuthoring } from './authoring.test-utils';
import { CreateReviewDto } from './dtos/create-review.dto';
import { UpdateReviewDto } from './dtos/update-review.dto';

describe('ReviewService.create', () => {
  const dto = (over: Row = {}) => ({ orderItemId: 'i1', rating: 5, ...over }) as CreateReviewDto;

  it('creates a verified review with the purchase snapshot', async () => {
    const { service, rows } = setupAuthoring();
    const { data } = await service.create(user, dto({ title: 'Great', content: 'Fits well', fit: 'true_to_size' }));

    expect(rows(Review)).toHaveLength(1);
    expect(rows(Review)[0]).toMatchObject({
      productId: 'p1',
      userId: 'u1',
      orderItemId: 'i1',
      author: 'Nguyen Van A',
      avatar: 'a.png',
      rating: 5,
      verified: true,
      size: 'M',
      color: 'white',
      fit: 'true_to_size',
      status: 'PUBLISHED',
      helpfulCount: 0,
    });
    expect(rows(Review)[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data).toMatchObject({ status: 'PUBLISHED', canEdit: true, edited: false, reply: null, moderationNote: null });
    expect(data).not.toHaveProperty('userId');
  });

  it('falls back to a generic author name and empty avatar', async () => {
    const { service, rows } = setupAuthoring();
    await service.create({ id: 'u1', name: null, image: null } as any, dto());
    expect(rows(Review)[0]).toMatchObject({ author: 'Customer', avatar: '', title: '', content: '', fit: null });
  });

  it('rejects an order item of someone else or one that does not exist with 404', async () => {
    const { service, rows } = setupAuthoring({ orders: [order({ userId: 'someone-else' })] });
    await rejects(service.create(user, dto()), { errorCode: 1902, status: 404 });
    await rejects(service.create(user, dto({ orderItemId: 'nope' })), { errorCode: 1902, status: 404 });
    expect(rows(Review)).toHaveLength(0);
  });

  it.each([
    ['unpaid order', { paymentStatus: 'unpaid' }],
    ['order not delivered', { status: 'shipping', deliveredAt: null }],
    ['review window over', { deliveredAt: daysAgo(31) }],
  ])('rejects: %s', async (_name, over) => {
    const { service, rows } = setupAuthoring({ orders: [order(over)] });
    await rejects(service.create(user, dto()), { errorCode: 1902, status: 400 });
    expect(rows(Review)).toHaveLength(0);
  });

  it('rejects an item whose product was deleted', async () => {
    const { service } = setupAuthoring({ orderItems: [orderItem({ productId: null })] });
    await rejects(service.create(user, dto()), { errorCode: 1902, status: 400 });
  });

  it('rejects a second review for the same order item with 409', async () => {
    const { service, rows } = setupAuthoring({ reviews: [review()] });
    await rejects(service.create(user, dto()), { errorCode: 1903, status: 409 });
    expect(rows(Review)).toHaveLength(1);
  });

  it('maps a UNIQUE violation from a concurrent request to the same 409', async () => {
    const { service, manager } = setupAuthoring();
    manager.save.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));
    await rejects(service.create(user, dto()), { errorCode: 1903, status: 409 });
  });

  it('rethrows other database errors untouched', async () => {
    const { service, manager } = setupAuthoring();
    manager.save.mockRejectedValueOnce(new Error('connection lost'));
    await expect(service.create(user, dto())).rejects.toThrow('connection lost');
  });

  it('rejects links in title or content before touching the database', async () => {
    const { service, manager } = setupAuthoring();
    await rejects(service.create(user, dto({ content: 'buy at www.spam.vn' })), { errorCode: 1905, status: 400 });
    await rejects(service.create(user, dto({ title: 'https://spam.vn' })), { errorCode: 1905, status: 400 });
    expect(manager.findOne).not.toHaveBeenCalled();
  });
});

describe('ReviewService.update', () => {
  it('edits the review once and marks it edited', async () => {
    const { service, rows, manager } = setupAuthoring({ reviews: [review()] });
    const { data } = await service.update('u1', 'r1', { rating: 2, content: 'Shrunk after washing' } as UpdateReviewDto);

    expect(rows(Review)[0]).toMatchObject({ rating: 2, content: 'Shrunk after washing', title: '' });
    expect(rows(Review)[0].editedAt).toBeInstanceOf(Date);
    expect(data).toMatchObject({ edited: true, canEdit: false, editableUntil: null });
    expect(manager.locks).toContain('Review');
  });

  it('refuses a second edit, an expired edit and an edit of a hidden review', async () => {
    const edited = setupAuthoring({ reviews: [review({ editedAt: new Date() })] });
    await rejects(edited.service.update('u1', 'r1', { rating: 1 }), { errorCode: 1904, status: 400 });

    const expired = setupAuthoring({ reviews: [review({ createdAt: daysAgo(31) })] });
    await rejects(expired.service.update('u1', 'r1', { rating: 1 }), { errorCode: 1904, status: 400 });

    const hidden = setupAuthoring({ reviews: [review({ status: 'HIDDEN', moderationNote: 'spam' })] });
    await rejects(hidden.service.update('u1', 'r1', { rating: 1 }), { errorCode: 1904, status: 400 });
    expect(hidden.rows(Review)[0].rating).toBe(4);
  });

  it("404s on someone else's or an unknown review", async () => {
    const { service } = setupAuthoring({ reviews: [review({ userId: 'other' })] });
    await rejects(service.update('u1', 'r1', { rating: 1 }), { errorCode: 1901, status: 404 });
    await rejects(service.update('u1', 'nope', { rating: 1 }), { errorCode: 1901, status: 404 });
  });

  it('rejects an empty payload (1909) and links (1905)', async () => {
    const { service } = setupAuthoring({ reviews: [review()] });
    await rejects(service.update('u1', 'r1', {}), { errorCode: 1909, status: 400 });
    await rejects(service.update('u1', 'r1', { content: 'www.spam.vn' }), { errorCode: 1905, status: 400 });
  });
});

describe('review DTOs', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const run = (metatype: new () => object, body: unknown) => pipe.transform(body, { type: 'body', metatype });

  it('CreateReviewDto trims text and accepts a minimal body', async () => {
    await expect(run(CreateReviewDto, { orderItemId: 'i1', rating: 5, title: '  Nice  ', fit: 'large' })).resolves.toMatchObject({
      title: 'Nice',
      fit: 'large',
    });
    await expect(run(CreateReviewDto, { orderItemId: 'i1', rating: 3 })).resolves.toMatchObject({ rating: 3 });
  });

  it.each([
    [{ rating: 5 }],
    [{ orderItemId: 'i1' }],
    [{ orderItemId: 'i1', rating: 0 }],
    [{ orderItemId: 'i1', rating: 6 }],
    [{ orderItemId: 'i1', rating: 4.5 }],
    [{ orderItemId: 'i1', rating: 5, fit: 'huge' }],
    [{ orderItemId: 'i1', rating: 5, content: 'x'.repeat(2001) }],
    [{ orderItemId: 'i1', rating: 5, title: 'x'.repeat(256) }],
    [{ orderItemId: 'i1', rating: 5, status: 'HIDDEN' }],
  ])('CreateReviewDto rejects %j', async (body) => {
    await expect(run(CreateReviewDto, body)).rejects.toMatchObject({ status: 400 });
  });

  it('UpdateReviewDto takes partial bodies and rejects unknown fields', async () => {
    await expect(run(UpdateReviewDto, { content: 'ok' })).resolves.toMatchObject({ content: 'ok' });
    await expect(run(UpdateReviewDto, { orderItemId: 'i2' })).rejects.toMatchObject({ status: 400 });
    await expect(run(UpdateReviewDto, { rating: 9 })).rejects.toMatchObject({ status: 400 });
  });
});

describe('ReviewService images', () => {
  const dto = (over: Row = {}) => ({ orderItemId: 'i1', rating: 5, ...over }) as CreateReviewDto;

  it('stores the resolved image URLs on the review and exposes them publicly', async () => {
    const { service, rows, mediaService } = setupAuthoring();
    const images = [IMG('u1', 'a.jpg'), IMG('u1', 'b.jpg')];
    const { data } = await service.create(user, dto({ images }));

    expect(mediaService.resolveReviewImageUrls).toHaveBeenCalledWith('u1', images);
    expect(rows(Review)[0].images).toEqual(images);
    expect(data.images).toEqual(images);
  });

  it('defaults to no images and does not call the media service', async () => {
    const { service, rows, mediaService } = setupAuthoring();
    await service.create(user, dto());
    expect(rows(Review)[0].images).toEqual([]);
    expect(mediaService.resolveReviewImageUrls).not.toHaveBeenCalled();
  });

  it("rejects images that are not the user's own uploads with 1908 and saves nothing", async () => {
    const { service, rows } = setupAuthoring();
    await rejects(service.create(user, dto({ images: [IMG('someone-else')] })), { errorCode: 1908, status: 400 });
    await rejects(service.create(user, dto({ images: ['https://evil.test/x.jpg'] })), { errorCode: 1908, status: 400 });
    expect(rows(Review)).toHaveLength(0);
  });

  it('update replaces the images, and an empty array clears them', async () => {
    const { service, rows } = setupAuthoring({ reviews: [review({ images: [IMG('u1', 'old.jpg')] })] });
    const next = [IMG('u1', 'new.jpg')];
    expect((await service.update('u1', 'r1', { images: next })).data.images).toEqual(next);
    expect(rows(Review)[0].images).toEqual(next);

    const cleared = setupAuthoring({ reviews: [review({ images: [IMG('u1', 'old.jpg')] })] });
    expect((await cleared.service.update('u1', 'r1', { images: [] })).data.images).toEqual([]);
  });

  it('update rejects foreign images and does not consume the single edit', async () => {
    const { service, rows } = setupAuthoring({ reviews: [review()] });
    await rejects(service.update('u1', 'r1', { images: [IMG('other')] }), { errorCode: 1908, status: 400 });
    expect(rows(Review)[0].editedAt).toBeNull();
  });

  it('uploadImage hands the file to the media service as a REVIEW image owned by the user', async () => {
    const { service, mediaService } = setupAuthoring();
    const file = { size: 100 } as Express.Multer.File;
    expect(await service.uploadImage('u1', file)).toEqual({ data: { url: 'https://cdn.test/x.jpg', mimeType: 'image/jpeg', size: 10 } });
    expect(mediaService.upload).toHaveBeenCalledWith(file, { purpose: 'REVIEW', uploadedBy: 'u1' });
  });

  it('uploadImage refuses files over the review image limit (413)', async () => {
    const { service, mediaService } = setupAuthoring();
    await rejects(service.uploadImage('u1', { size: 5 * 1024 * 1024 + 1 } as Express.Multer.File), { errorCode: 1606, status: 413 });
    expect(mediaService.upload).not.toHaveBeenCalled();
  });
});

describe('ReviewAuthoringService keeps products.rating_* in sync', () => {
  const productRow = (rows: (e: any) => Row[]) => rows(Product)[0];

  it('create refreshes the product rating, locking the product before the review is inserted', async () => {
    const { service, rows, manager } = setupAuthoring();
    await service.create(user, { orderItemId: 'i1', rating: 4 } as CreateReviewDto);

    expect(productRow(rows)).toMatchObject({ ratingCount: 1, ratingAverage: 4 });
    const lockCall = manager.findOne.mock.calls.findIndex(([entity, opts]: any) => entity === Product && opts.lock);
    expect(lockCall).toBeGreaterThanOrEqual(0);
    expect(manager.findOne.mock.invocationCallOrder[lockCall]).toBeLessThan(manager.save.mock.invocationCallOrder[0]);
  });

  it('the average covers every published review of the product and is rounded to one decimal', async () => {
    const { service, rows } = setupAuthoring({
      reviews: [review({ id: 'a', orderItemId: 'x1', rating: 5 }), review({ id: 'b', orderItemId: 'x2', rating: 4 })],
      orderItems: [orderItem(), orderItem({ id: 'i2' })],
    });
    await service.create(user, { orderItemId: 'i1', rating: 4 } as CreateReviewDto); // 5 + 4 + 4 = 13 / 3 = 4.33…
    expect(productRow(rows)).toMatchObject({ ratingCount: 3, ratingAverage: 4.3 });
  });

  it('update refreshes the rating only when the stars change', async () => {
    const changed = setupAuthoring({ reviews: [review({ rating: 4 })] });
    await changed.service.update('u1', 'r1', { rating: 2 });
    expect(productRow(changed.rows)).toMatchObject({ ratingCount: 1, ratingAverage: 2 });

    const same = setupAuthoring({ reviews: [review({ rating: 4 })] });
    await same.service.update('u1', 'r1', { content: 'only text' });
    expect(productRow(same.rows)).toMatchObject({ ratingCount: 0, ratingAverage: null });
    expect(same.manager.locks).not.toContain('Product');
  });
});

describe('ReviewAuthoringQueryService product summary', () => {
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

  it('own list shows the product summary, with category/subcategory for links', async () => {
    const own = setupAuthoring();
    own.result.many = [review({ product })];
    own.result.total = 1;
    expect((await own.queries.findMine('u1', {})).data[0].product).toEqual(summary);
  });
});

describe('ReviewService.findPending', () => {
  it('returns the current product summary next to the order snapshot', async () => {
    const ctx = setupAuthoring();
    const deliveredAt = daysAgo(2);
    ctx.result.many = [
      {
        id: 'i1',
        orderId: 'o1',
        productId: 'p1',
        productName: 'Tên lúc đặt',
        productImage: 'old.jpg',
        size: 'M',
        color: 'white',
        quantity: 1,
        order: { deliveredAt },
        product: {
          id: 'p1',
          name: 'Tên hiện tại',
          slug: 'ao',
          images: ['new.jpg'],
          badge: null,
          category: { id: 'c1', slug: 'ao', title: 'Áo' },
          subcategory: { id: 's1', slug: 'thun', label: 'Thun' },
        },
      },
    ];
    ctx.result.total = 1;
    const { data } = await ctx.queries.findPending('u1', {});
    expect(data[0]).toMatchObject({ productName: 'Tên lúc đặt', productImage: 'old.jpg' });
    expect(data[0].product).toEqual({
      id: 'p1',
      name: 'Tên hiện tại',
      slug: 'ao',
      image: 'new.jpg',
      badge: null,
      category: { id: 'c1', slug: 'ao', title: 'Áo' },
      subcategory: { id: 's1', slug: 'thun', label: 'Thun' },
    });
  });
});

describe('review image DTO rules', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const run = (metatype: new () => object, body: unknown) => pipe.transform(body, { type: 'body', metatype });

  it('accepts up to 5 unique image URLs on create and update', async () => {
    const images = ['a', 'b', 'c', 'd', 'e'].map((n) => IMG('u1', `${n}.jpg`));
    await expect(run(CreateReviewDto, { orderItemId: 'i1', rating: 5, images })).resolves.toMatchObject({ images });
    await expect(run(UpdateReviewDto, { images })).resolves.toMatchObject({ images });
    await expect(run(UpdateReviewDto, { images: [] })).resolves.toMatchObject({ images: [] });
  });

  it.each([
    [{ images: ['a', 'b', 'c', 'd', 'e', 'f'] }],
    [{ images: ['a', 'a'] }],
    [{ images: [1] }],
    [{ images: 'a' }],
    [{ images: ['x'.repeat(1001)] }],
  ])('rejects %j', async (extra) => {
    await expect(run(CreateReviewDto, { orderItemId: 'i1', rating: 5, ...extra })).rejects.toMatchObject({ status: 400 });
    await expect(run(UpdateReviewDto, extra)).rejects.toMatchObject({ status: 400 });
  });
});
