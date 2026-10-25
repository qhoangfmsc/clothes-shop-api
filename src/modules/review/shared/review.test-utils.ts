import { Order } from '../../order/shared/order.entity';
import { OrderItem } from '../../order/shared/order-item.entity';
import { Product } from '../../product/product.entity';
import { MS_PER_DAY } from './review.constant';
import { Review } from './review.entity';
import { ReviewVote } from './review-vote.entity';

export type Row = Record<string, any>;

export const daysAgo = (days: number) => new Date(Date.now() - days * MS_PER_DAY);
export const user = { id: 'u1', name: 'Nguyen Van A', image: 'a.png' } as any;

export const order = (over: Row = {}) => ({
  id: 'o1',
  userId: 'u1',
  status: 'delivered',
  paymentStatus: 'paid',
  deliveredAt: daysAgo(2),
  ...over,
});
export const orderItem = (over: Row = {}) => ({ id: 'i1', orderId: 'o1', productId: 'p1', size: 'M', color: 'white', ...over });
export const IMG = (userId: string, name = 'a.jpg') => `https://cdn.test/storage/v1/object/public/media/${userId}-${name}`;
export const review = (over: Row = {}) => ({
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
export function buildReviewTestKit(seed: { orders?: Row[]; orderItems?: Row[]; reviews?: Row[]; votes?: Row[] } = {}) {
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
  const dataSource: any = { transaction: jest.fn(async (fn: any) => fn(manager)), manager, createQueryBuilder: jest.fn(() => qb) };

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
    innerJoinAndSelect: () => qb,
    leftJoin: () => qb,
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
  const rows = (entity: any) => tables.get(entity)!;
  return { dataSource, reviewRepo, mediaService, manager, rows, calls, result };
}

export const rejects = (promise: Promise<unknown>, expected: { errorCode?: number; status: number }) =>
  expect(promise).rejects.toMatchObject({
    status: expected.status,
    response: expect.objectContaining(expected.errorCode ? { errorCode: expected.errorCode } : {}),
  });
