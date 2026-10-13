import { Order } from '../order/order.entity';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentTransaction } from './payment-transaction.entity';

type Row = Record<string, any>;

/** EntityManager giả trong bộ nhớ, đủ cho các thao tác findOne/exists/create/save/update mà service payment dùng */
export function createFakeManager(seed: { orders?: Row[]; attempts?: Row[]; transactions?: Row[] } = {}) {
  const tables = new Map<unknown, Row[]>([
    [Order, [...(seed.orders ?? [])]],
    [PaymentAttempt, [...(seed.attempts ?? [])]],
    [PaymentTransaction, [...(seed.transactions ?? [])]],
  ]);
  // Hỗ trợ equality, ILike (không phân biệt hoa/thường), In (danh sách) và `where` dạng mảng (OR)
  const matchesValue = (actual: unknown, expected: any) => {
    if (expected && typeof expected === 'object' && expected.type === 'ilike')
      return String(actual).toLowerCase() === String(expected.value).toLowerCase();
    if (expected && typeof expected === 'object' && expected.type === 'in') return (expected.value as unknown[]).includes(actual);
    return actual === expected;
  };
  const matchesOne = (row: Row, where: Row = {}) => Object.entries(where).every(([key, value]) => matchesValue(row[key], value));
  const matches = (row: Row, where: Row | Row[] = {}) =>
    Array.isArray(where) ? where.some((w) => matchesOne(row, w)) : matchesOne(row, where);
  let seq = 0;

  const manager = {
    tables,
    locks: [] as string[],
    findOne: jest.fn(async (entity: any, opts: { where: Row | Row[]; lock?: unknown; order?: Record<string, 'ASC' | 'DESC'> }) => {
      if (opts.lock) manager.locks.push(`${entity.name}:${JSON.stringify(opts.where)}`);
      const rows = tables.get(entity)!.filter((row) => matches(row, opts.where));
      if (opts.order) {
        const [[key, dir]] = Object.entries(opts.order);
        rows.sort((a, b) => (dir === 'DESC' ? -1 : 1) * (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0));
      }
      return rows[0] ?? null;
    }),
    exists: jest.fn(async (entity: any, opts: { where: Row }) => tables.get(entity)!.some((row) => matches(row, opts.where))),
    create: jest.fn((_entity: any, data: Row) => ({ ...data })),
    save: jest.fn(async (...args: any[]) => {
      // save(entity) hoặc save(Class, entity) — không có metadata nên đoán bảng theo field đặc trưng
      const data: Row = args[args.length - 1];
      const entity = 'transferCode' in data ? PaymentAttempt : 'providerTransactionId' in data ? PaymentTransaction : Order;
      const rows = tables.get(entity)!;
      if (!rows.includes(data)) {
        data.id ??= `row-${++seq}`;
        rows.push(data);
      }
      return data;
    }),
    update: jest.fn(async (entity: any, where: Row, patch: Row) => {
      for (const row of tables.get(entity)!.filter((r) => matches(r, where))) Object.assign(row, patch);
    }),
  };
  return manager;
}

export const futureDate = (ms = 10 * 60 * 1000) => new Date(Date.now() + ms);
export const pastDate = (ms = 10 * 60 * 1000) => new Date(Date.now() - ms);
