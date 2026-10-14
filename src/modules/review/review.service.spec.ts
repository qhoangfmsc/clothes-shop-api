import { ValidationPipe } from '@nestjs/common';
import { Order } from '../order/order.entity';
import { OrderItem } from '../order/order-item.entity';
import { Product } from '../product/product.entity';
import { CreateReviewDto } from './dtos/create-review.dto';
import { HideReviewDto } from './dtos/hide-review.dto';
import { UpdateReviewDto } from './dtos/update-review.dto';
import { MS_PER_DAY } from './review.constant';
import { Review } from './review.entity';
import { ReviewService } from './review.service';
import { ReviewVote } from './review-vote.entity';

type Row = Record<string, any>;

const daysAgo = (days: number) => new Date(Date.now() - days * MS_PER_DAY);
const user = { id: 'u1', name: 'Nguyen Van A', image: 'a.png' } as any;

const order = (over: Row = {}) => ({
  id: 'o1',
  userId: 'u1',
  status: 'delivered',
  paymentStatus: 'paid',
  deliveredAt: daysAgo(2),
  ...over,
});
const orderItem = (over: Row = {}) => ({ id: 'i1', orderId: 'o1', productId: 'p1', size: 'M', color: 'white', ...over });
const IMG = (userId: string, name = 'a.jpg') => `https://cdn.test/storage/v1/object/public/media/${userId}-${name}`;
const review = (over: Row = {}) => ({
  id: 'r1',
  productId: 'p1',
  userId: 'u1',
  orderItemId: 'i1',
  rating: 4,
  title: '',
  content: '',
  fit: null,
  images: [],
  status: 'PUBLISHED',
  helpfulCount: 0,
  createdAt: daysAgo(1),
  editedAt: null,
  moderationNote: null,
  moderatedBy: null,
  moderatedAt: null,
  reply: null,
  repliedBy: null,
  repliedAt: null,
  ...over,
});

/** EntityManager giả trong bộ nhớ cho Order, OrderItem, Review, ReviewVote */
function setup(seed: { orders?: Row[]; orderItems?: Row[]; reviews?: Row[]; votes?: Row[] } = {}) {
  const tables = new Map<unknown, Row[]>([
    [Order, [...(seed.orders ?? [order()])]],
    [OrderItem, [...(seed.orderItems ?? [orderItem()])]],
    [Review, [...(seed.reviews ?? [])]],
    [ReviewVote, [...(seed.votes ?? [])]],
    [Product, [{ id: 'p1', ratingAverage: null, ratingCount: 0 }]],
  ]);
  const matches = (row: Row, where: Row = {}) => Object.entries(where).every(([key, value]) => row[key] === value);
  let seq = 0;
  const manager: any = {
    tables,
    locks: [] as string[],
    findOne: jest.fn(async (entity: any, opts: { where: Row; lock?: unknown }) => {
      if (opts.lock) manager.locks.push(entity.name);
      return tables.get(entity)!.find((row) => matches(row, opts.where)) ?? null;
    }),
    exists: jest.fn(async (entity: any, opts: { where: Row }) => tables.get(entity)!.some((row) => matches(row, opts.where))),
    count: jest.fn(async (entity: any, opts: { where: Row }) => tables.get(entity)!.filter((row) => matches(row, opts.where)).length),
    create: jest.fn((_entity: any, data: Row) => ({ ...data })),
    save: jest.fn(async (data: Row) => {
      // Review có `rating`, ReviewVote chỉ có reviewId + userId
      const rows = tables.get('rating' in data ? Review : ReviewVote)!;
      if (!rows.includes(data)) {
        data.id ??= `row-${++seq}`;
        data.createdAt ??= new Date();
        rows.push(data);
      }
      return data;
    }),
    update: jest.fn(async (entity: any, where: Row, patch: Row) => {
      for (const row of tables.get(entity)!.filter((r) => matches(r, where))) Object.assign(row, patch);
    }),
    delete: jest.fn(async (entity: any, where: Row) => {
      const rows = tables.get(entity)!;
      tables.set(
        entity,
        rows.filter((row) => !matches(row, where)),
      );
    }),
  };
  // QueryBuilder của manager chỉ phục vụ phép tính điểm trung bình (COUNT + ROUND(AVG)) của đánh giá PUBLISHED theo sản phẩm
  manager.createQueryBuilder = jest.fn(() => {
    let productId = '';
    const q: any = {
      select: () => q,
      addSelect: () => q,
      where: (_sql: string, params: any) => {
        productId = params.productId;
        return q;
      },
      andWhere: () => q,
      getRawOne: async () => {
        const rated = tables.get(Review)!.filter((r) => r.productId === productId && r.status === 'PUBLISHED');
        const sum = rated.reduce((acc, r) => acc + r.rating, 0);
        return { count: String(rated.length), average: rated.length ? (Math.round((sum / rated.length) * 10) / 10).toFixed(1) : null };
      },
    };
    return q;
  });
  const dataSource: any = { transaction: jest.fn(async (fn: any) => fn(manager)), manager };

  // QueryBuilder giả cho các list/summary: ghi lại điều kiện và trả dữ liệu được nạp sẵn
  const calls: { where: [string, any?][]; orderBy?: [string, string]; addOrderBy?: [string, string]; skip?: number; take?: number } = {
    where: [],
  };
  const result = { many: [] as Row[], total: 0, raw: [] as Row[][] };
  const qb: any = {
    where: (sql: string, params?: any) => {
      calls.where.push([sql, params]);
      return qb;
    },
    andWhere: (sql: string, params?: any) => {
      calls.where.push([sql, params]);
      return qb;
    },
    leftJoinAndSelect: () => qb,
    select: () => qb,
    addSelect: () => qb,
    groupBy: () => qb,
    orderBy: (field: string, dir: string) => {
      calls.orderBy = [field, dir];
      return qb;
    },
    addOrderBy: (field: string, dir: string) => {
      calls.addOrderBy = [field, dir];
      return qb;
    },
    skip: (n: number) => {
      calls.skip = n;
      return qb;
    },
    take: (n: number) => {
      calls.take = n;
      return qb;
    },
    getManyAndCount: jest.fn(async () => [result.many, result.total]),
    getCount: jest.fn(async () => result.total),
    getRawMany: jest.fn(async () => result.raw.shift() ?? []),
  };
  const reviewRepo: any = {
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn(async ({ where }: { where: Row }) => tables.get(Review)!.find((r) => r.id === where.id) ?? null),
  };

  const mediaService: any = {
    // Ảnh hợp lệ = URL bắt đầu bằng `${cdn}/${userId}-`
    resolveReviewImageUrls: jest.fn(async (userId: string, urls: string[]) =>
      urls.every((url) => url.startsWith(IMG(userId, ''))) ? urls : null,
    ),
    upload: jest.fn(async () => ({ data: { url: 'https://cdn.test/x.jpg', mimeType: 'image/jpeg', sizeOriginal: 10 } })),
  };
  const service = new ReviewService(dataSource, reviewRepo, mediaService);
  const rows = (entity: any) => tables.get(entity)!;
  return { service, manager, rows, calls, result, mediaService };
}

const rejects = (promise: Promise<unknown>, expected: { errorCode?: number; status: number }) =>
  expect(promise).rejects.toMatchObject({
    status: expected.status,
    response: expect.objectContaining(expected.errorCode ? { errorCode: expected.errorCode } : {}),
  });

describe('ReviewService.create', () => {
  const dto = (over: Row = {}) => ({ orderItemId: 'i1', rating: 5, ...over }) as CreateReviewDto;

  it('creates a verified review with the purchase snapshot', async () => {
    const { service, rows } = setup();
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
    const { service, rows } = setup();
    await service.create({ id: 'u1', name: null, image: null } as any, dto());
    expect(rows(Review)[0]).toMatchObject({ author: 'Customer', avatar: '', title: '', content: '', fit: null });
  });

  it('rejects an order item of someone else or one that does not exist with 404', async () => {
    const { service, rows } = setup({ orders: [order({ userId: 'someone-else' })] });
    await rejects(service.create(user, dto()), { errorCode: 1902, status: 404 });
    await rejects(service.create(user, dto({ orderItemId: 'nope' })), { errorCode: 1902, status: 404 });
    expect(rows(Review)).toHaveLength(0);
  });

  it.each([
    ['unpaid order', { paymentStatus: 'unpaid' }],
    ['order not delivered', { status: 'shipping', deliveredAt: null }],
    ['review window over', { deliveredAt: daysAgo(31) }],
  ])('rejects: %s', async (_name, over) => {
    const { service, rows } = setup({ orders: [order(over)] });
    await rejects(service.create(user, dto()), { errorCode: 1902, status: 400 });
    expect(rows(Review)).toHaveLength(0);
  });

  it('rejects an item whose product was deleted', async () => {
    const { service } = setup({ orderItems: [orderItem({ productId: null })] });
    await rejects(service.create(user, dto()), { errorCode: 1902, status: 400 });
  });

  it('rejects a second review for the same order item with 409', async () => {
    const { service, rows } = setup({ reviews: [review()] });
    await rejects(service.create(user, dto()), { errorCode: 1903, status: 409 });
    expect(rows(Review)).toHaveLength(1);
  });

  it('maps a UNIQUE violation from a concurrent request to the same 409', async () => {
    const { service, manager } = setup();
    manager.save.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));
    await rejects(service.create(user, dto()), { errorCode: 1903, status: 409 });
  });

  it('rethrows other database errors untouched', async () => {
    const { service, manager } = setup();
    manager.save.mockRejectedValueOnce(new Error('connection lost'));
    await expect(service.create(user, dto())).rejects.toThrow('connection lost');
  });

  it('rejects links in title or content before touching the database', async () => {
    const { service, manager } = setup();
    await rejects(service.create(user, dto({ content: 'buy at www.spam.vn' })), { errorCode: 1905, status: 400 });
    await rejects(service.create(user, dto({ title: 'https://spam.vn' })), { errorCode: 1905, status: 400 });
    expect(manager.findOne).not.toHaveBeenCalled();
  });
});

describe('ReviewService.update', () => {
  it('edits the review once and marks it edited', async () => {
    const { service, rows, manager } = setup({ reviews: [review()] });
    const { data } = await service.update('u1', 'r1', { rating: 2, content: 'Shrunk after washing' } as UpdateReviewDto);

    expect(rows(Review)[0]).toMatchObject({ rating: 2, content: 'Shrunk after washing', title: '' });
    expect(rows(Review)[0].editedAt).toBeInstanceOf(Date);
    expect(data).toMatchObject({ edited: true, canEdit: false, editableUntil: null });
    expect(manager.locks).toContain('Review');
  });

  it('refuses a second edit, an expired edit and an edit of a hidden review', async () => {
    const edited = setup({ reviews: [review({ editedAt: new Date() })] });
    await rejects(edited.service.update('u1', 'r1', { rating: 1 }), { errorCode: 1904, status: 400 });

    const expired = setup({ reviews: [review({ createdAt: daysAgo(31) })] });
    await rejects(expired.service.update('u1', 'r1', { rating: 1 }), { errorCode: 1904, status: 400 });

    const hidden = setup({ reviews: [review({ status: 'HIDDEN', moderationNote: 'spam' })] });
    await rejects(hidden.service.update('u1', 'r1', { rating: 1 }), { errorCode: 1904, status: 400 });
    expect(hidden.rows(Review)[0].rating).toBe(4);
  });

  it("404s on someone else's or an unknown review", async () => {
    const { service } = setup({ reviews: [review({ userId: 'other' })] });
    await rejects(service.update('u1', 'r1', { rating: 1 }), { errorCode: 1901, status: 404 });
    await rejects(service.update('u1', 'nope', { rating: 1 }), { errorCode: 1901, status: 404 });
  });

  it('rejects an empty payload and links', async () => {
    const { service } = setup({ reviews: [review()] });
    await rejects(service.update('u1', 'r1', {}), { status: 400 });
    await rejects(service.update('u1', 'r1', { content: 'www.spam.vn' }), { errorCode: 1905, status: 400 });
  });
});

describe('ReviewService votes', () => {
  const others = () => ({ reviews: [review({ userId: 'author' })] });

  it('counts a vote once, even when sent twice', async () => {
    const { service, rows } = setup(others());
    expect((await service.vote('u1', 'r1')).data).toEqual({ reviewId: 'r1', helpfulCount: 1, voted: true });
    expect((await service.vote('u1', 'r1')).data).toEqual({ reviewId: 'r1', helpfulCount: 1, voted: true });
    expect(rows(ReviewVote)).toHaveLength(1);
    expect(rows(Review)[0].helpfulCount).toBe(1);
  });

  it('counts votes from different users and removes only the caller vote', async () => {
    const { service, rows } = setup({ ...others(), votes: [{ id: 'v1', reviewId: 'r1', userId: 'u2' }] });
    expect((await service.vote('u1', 'r1')).data.helpfulCount).toBe(2);
    expect((await service.unvote('u1', 'r1')).data).toEqual({ reviewId: 'r1', helpfulCount: 1, voted: false });
    expect(rows(ReviewVote).map((v) => v.userId)).toEqual(['u2']);
  });

  it('unvote without a vote is a no-op', async () => {
    const { service } = setup(others());
    expect((await service.unvote('u1', 'r1')).data).toMatchObject({ helpfulCount: 0, voted: false });
  });

  it('refuses to vote on your own review', async () => {
    const { service, rows } = setup({ reviews: [review({ userId: 'u1' })] });
    await rejects(service.vote('u1', 'r1'), { errorCode: 1907, status: 400 });
    expect(rows(ReviewVote)).toHaveLength(0);
  });

  it('404s on hidden or unknown reviews and locks the review row', async () => {
    const { service, manager } = setup({ reviews: [review({ userId: 'author', status: 'HIDDEN', moderationNote: 'x' })] });
    await rejects(service.vote('u1', 'r1'), { errorCode: 1901, status: 404 });
    await rejects(service.vote('u1', 'nope'), { errorCode: 1901, status: 404 });
    expect(manager.locks).toEqual(['Review', 'Review']);
  });
});

describe('ReviewService admin moderation', () => {
  const adminView = (rows: Row[]) => rows[0];

  it('hides a published review with a note and shows it again', async () => {
    const ctx = setup({ reviews: [review()] });
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
    const ctx = setup({ reviews: [review()] });
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
    const ctx = setup();
    await rejects(ctx.service.hide('admin1', 'nope', { note: 'x' }), { errorCode: 1901, status: 404 });
    await rejects(ctx.service.reply('admin1', 'nope', { content: 'x' }), { errorCode: 1901, status: 404 });
    await rejects(ctx.service.findOneAdmin('nope'), { errorCode: 1901, status: 404 });
  });
});

describe('ReviewService public list and summary', () => {
  it('lists only published reviews, applies filters and hides internal fields', async () => {
    const ctx = setup();
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

    const res = await ctx.service.findByProductId('p1', { rating: 5, fit: 'large', sort: '-helpfulCount', page: 2, limit: 10 });

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
    const ctx = setup();
    await ctx.service.findByProductId('p1');
    expect(ctx.calls.orderBy).toEqual(['r.createdAt', 'DESC']);
    expect(ctx.calls.where.map(([sql]) => sql)).toEqual(['r.productId = :productId', 'r.status = :status']);
  });

  it('summarises average, distribution and fit', async () => {
    const ctx = setup();
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
    const { data } = await ctx.service.getSummary('p1');
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
    const ctx = setup();
    ctx.result.raw = [
      [
        { rating: 5, count: '1' },
        { rating: 4, count: '2' },
      ],
      [],
    ];
    expect((await ctx.service.getSummary('p1')).data.ratingAverage).toBe(4.3);

    const empty = await setup().service.getSummary('p1');
    expect(empty.data).toMatchObject({ ratingCount: 0, ratingAverage: null, fit: { total: 0 } });
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

  it('HideReviewDto requires a non-empty note', async () => {
    await expect(run(HideReviewDto, { note: '  spam  ' })).resolves.toMatchObject({ note: 'spam' });
    await expect(run(HideReviewDto, { note: '   ' })).rejects.toMatchObject({ status: 400 });
    await expect(run(HideReviewDto, {})).rejects.toMatchObject({ status: 400 });
  });
});

describe('ReviewService images', () => {
  const dto = (over: Row = {}) => ({ orderItemId: 'i1', rating: 5, ...over }) as CreateReviewDto;

  it('stores the resolved image URLs on the review and exposes them publicly', async () => {
    const { service, rows, mediaService } = setup();
    const images = [IMG('u1', 'a.jpg'), IMG('u1', 'b.jpg')];
    const { data } = await service.create(user, dto({ images }));

    expect(mediaService.resolveReviewImageUrls).toHaveBeenCalledWith('u1', images);
    expect(rows(Review)[0].images).toEqual(images);
    expect(data.images).toEqual(images);
  });

  it('defaults to no images and does not call the media service', async () => {
    const { service, rows, mediaService } = setup();
    await service.create(user, dto());
    expect(rows(Review)[0].images).toEqual([]);
    expect(mediaService.resolveReviewImageUrls).not.toHaveBeenCalled();
  });

  it("rejects images that are not the user's own uploads with 1908 and saves nothing", async () => {
    const { service, rows } = setup();
    await rejects(service.create(user, dto({ images: [IMG('someone-else')] })), { errorCode: 1908, status: 400 });
    await rejects(service.create(user, dto({ images: ['https://evil.test/x.jpg'] })), { errorCode: 1908, status: 400 });
    expect(rows(Review)).toHaveLength(0);
  });

  it('update replaces the images, and an empty array clears them', async () => {
    const { service, rows } = setup({ reviews: [review({ images: [IMG('u1', 'old.jpg')] })] });
    const next = [IMG('u1', 'new.jpg')];
    expect((await service.update('u1', 'r1', { images: next })).data.images).toEqual(next);
    expect(rows(Review)[0].images).toEqual(next);

    const cleared = setup({ reviews: [review({ images: [IMG('u1', 'old.jpg')] })] });
    expect((await cleared.service.update('u1', 'r1', { images: [] })).data.images).toEqual([]);
  });

  it('update rejects foreign images and does not consume the single edit', async () => {
    const { service, rows } = setup({ reviews: [review()] });
    await rejects(service.update('u1', 'r1', { images: [IMG('other')] }), { errorCode: 1908, status: 400 });
    expect(rows(Review)[0].editedAt).toBeNull();
  });

  it('uploadImage hands the file to the media service as a REVIEW image owned by the user', async () => {
    const { service, mediaService } = setup();
    const file = { size: 100 } as Express.Multer.File;
    expect(await service.uploadImage('u1', file)).toEqual({ data: { url: 'https://cdn.test/x.jpg', mimeType: 'image/jpeg', size: 10 } });
    expect(mediaService.upload).toHaveBeenCalledWith(file, { purpose: 'REVIEW', uploadedBy: 'u1' });
  });

  it('uploadImage refuses files over the review image limit (413)', async () => {
    const { service, mediaService } = setup();
    await rejects(service.uploadImage('u1', { size: 5 * 1024 * 1024 + 1 } as Express.Multer.File), { errorCode: 1606, status: 413 });
    expect(mediaService.upload).not.toHaveBeenCalled();
  });

  it('hasImages filters the public list, the summary counts photo reviews, and both sides use the same SQL', async () => {
    const ctx = setup();
    await ctx.service.findByProductId('p1', { hasImages: true });
    expect(ctx.calls.where.map(([sql]) => sql)).toContain('jsonb_array_length(r.images) > 0');

    const none = setup();
    await none.service.findByProductId('p1', { hasImages: false });
    expect(none.calls.where.map(([sql]) => sql)).toContain('jsonb_array_length(r.images) = 0');

    const admin = setup();
    await admin.service.findAllAdmin({ hasImages: true });
    expect(admin.calls.where.map(([sql]) => sql)).toContain('jsonb_array_length(r.images) > 0');

    const summary = setup();
    summary.result.total = 3;
    expect((await summary.service.getSummary('p1')).data.withImages).toBe(3);
  });
});

describe('ReviewService keeps products.rating_* in sync', () => {
  const productRow = (rows: (e: any) => Row[]) => rows(Product)[0];

  it('create refreshes the product rating, locking the product before the review is inserted', async () => {
    const { service, rows, manager } = setup();
    await service.create(user, { orderItemId: 'i1', rating: 4 } as CreateReviewDto);

    expect(productRow(rows)).toMatchObject({ ratingCount: 1, ratingAverage: 4 });
    const lockCall = manager.findOne.mock.calls.findIndex(([entity, opts]: any) => entity === Product && opts.lock);
    expect(lockCall).toBeGreaterThanOrEqual(0);
    expect(manager.findOne.mock.invocationCallOrder[lockCall]).toBeLessThan(manager.save.mock.invocationCallOrder[0]);
  });

  it('the average covers every published review of the product and is rounded to one decimal', async () => {
    const { service, rows } = setup({
      reviews: [review({ id: 'a', orderItemId: 'x1', rating: 5 }), review({ id: 'b', orderItemId: 'x2', rating: 4 })],
      orderItems: [orderItem(), orderItem({ id: 'i2' })],
    });
    await service.create(user, { orderItemId: 'i1', rating: 4 } as CreateReviewDto); // 5 + 4 + 4 = 13 / 3 = 4.33…
    expect(productRow(rows)).toMatchObject({ ratingCount: 3, ratingAverage: 4.3 });
  });

  it('update refreshes the rating only when the stars change', async () => {
    const changed = setup({ reviews: [review({ rating: 4 })] });
    await changed.service.update('u1', 'r1', { rating: 2 });
    expect(productRow(changed.rows)).toMatchObject({ ratingCount: 1, ratingAverage: 2 });

    const same = setup({ reviews: [review({ rating: 4 })] });
    await same.service.update('u1', 'r1', { content: 'only text' });
    expect(productRow(same.rows)).toMatchObject({ ratingCount: 0, ratingAverage: null });
    expect(same.manager.locks).not.toContain('Product');
  });

  it('hiding removes a review from the rating, and publishing brings it back', async () => {
    const ctx = setup({ reviews: [review({ id: 'a', rating: 5, orderItemId: 'x1' }), review({ id: 'b', rating: 3, orderItemId: 'x2' })] });
    await ctx.service.hide('admin1', 'b', { note: 'spam' });
    expect(productRow(ctx.rows)).toMatchObject({ ratingCount: 1, ratingAverage: 5 });

    await ctx.service.publish('admin1', 'b');
    expect(productRow(ctx.rows)).toMatchObject({ ratingCount: 2, ratingAverage: 4 });
  });

  it('hiding the last published review resets the product to "no rating"', async () => {
    const ctx = setup({ reviews: [review({ rating: 5 })] });
    await ctx.service.hide('admin1', 'r1', { note: 'spam' });
    expect(productRow(ctx.rows)).toMatchObject({ ratingCount: 0, ratingAverage: null });
  });

  it('votes and replies leave the product rating alone', async () => {
    const ctx = setup({ reviews: [review({ userId: 'author' })] });
    await ctx.service.vote('u1', 'r1');
    await ctx.service.reply('admin1', 'r1', { content: 'Thanks' });
    expect(ctx.manager.update.mock.calls.some(([entity]: any) => entity === Product)).toBe(false);
  });

  it('summary rounds half-up exactly like Postgres ROUND (87 / 20 = 4.35 → 4.4)', async () => {
    const ctx = setup();
    ctx.result.raw = [
      [
        { rating: 5, count: '7' },
        { rating: 4, count: '13' },
      ],
      [],
    ];
    expect((await ctx.service.getSummary('p1')).data.ratingAverage).toBe(4.4);
  });
});

describe('ReviewService.countAwaitingReply', () => {
  it('counts published reviews without a shop reply — the same condition as the admin list', async () => {
    const ctx = setup();
    ctx.result.total = 9;
    expect(await ctx.service.countAwaitingReply()).toBe(9);
    expect(ctx.calls.where.map(([sql]) => sql)).toEqual(['r.status = :status', 'r.reply IS NULL']);

    const list = setup();
    await list.service.findAllAdmin({ status: 'PUBLISHED', replied: false });
    expect(list.calls.where.map(([sql]) => sql)).toEqual(expect.arrayContaining(['r.status = :status', 'r.reply IS NULL']));
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
