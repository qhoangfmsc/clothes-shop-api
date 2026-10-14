import { Order } from '../order/order.entity';
import { OrderItem } from '../order/order-item.entity';
import { ReturnRequest } from '../return/return-request.entity';
import { ReturnRequestItem } from '../return/return-request-item.entity';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentTransaction } from './payment-transaction.entity';
import { Refund } from './refund.entity';

type Row = Record<string, any>;

/** EntityManager giả trong bộ nhớ, đủ cho các thao tác findOne/exists/create/save/update mà service payment dùng */
export function createFakeManager(
  seed: {
    orders?: Row[];
    attempts?: Row[];
    transactions?: Row[];
    refunds?: Row[];
    orderItems?: Row[];
    returns?: Row[];
    returnItems?: Row[];
  } = {},
) {
  const tables = new Map<unknown, Row[]>([
    [Order, [...(seed.orders ?? [])]],
    [PaymentAttempt, [...(seed.attempts ?? [])]],
    [PaymentTransaction, [...(seed.transactions ?? [])]],
    [Refund, [...(seed.refunds ?? [])]],
    [OrderItem, [...(seed.orderItems ?? [])]],
    [ReturnRequest, [...(seed.returns ?? [])]],
    [ReturnRequestItem, [...(seed.returnItems ?? [])]],
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
    find: jest.fn(async (entity: any, opts: { where?: Row | Row[]; order?: Record<string, 'ASC' | 'DESC'> } = {}) => {
      const rows = tables.get(entity)!.filter((row) => matches(row, opts.where));
      if (opts.order) {
        const [[key, dir]] = Object.entries(opts.order);
        rows.sort((a, b) => (dir === 'DESC' ? -1 : 1) * (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0));
      }
      return rows;
    }),
    exists: jest.fn(async (entity: any, opts: { where: Row }) => tables.get(entity)!.some((row) => matches(row, opts.where))),
    create: jest.fn((_entity: any, data: Row) => ({ ...data })),
    save: jest.fn(async (...args: any[]) => {
      // save(entity), save(Class, entity) hoặc save([entities]) — không có metadata nên đoán bảng theo field đặc trưng
      const input = args[args.length - 1];
      const saveOne = (data: Row) => {
        const entity =
          'bankReference' in data
            ? Refund
            : 'orderItemId' in data
              ? ReturnRequestItem
              : 'adminNote' in data
                ? ReturnRequest
                : 'transferCode' in data
                  ? PaymentAttempt
                  : 'providerTransactionId' in data
                    ? PaymentTransaction
                    : Order;
        const rows = tables.get(entity)!;
        if (!rows.includes(data)) {
          data.id ??= `row-${++seq}`;
          rows.push(data);
        }
        return data;
      };
      return Array.isArray(input) ? input.map(saveOne) : saveOne(input);
    }),
    update: jest.fn(async (entity: any, where: Row, patch: Row) => {
      for (const row of tables.get(entity)!.filter((r) => matches(r, where))) Object.assign(row, patch);
    }),
  };
  return manager;
}

export const futureDate = (ms = 10 * 60 * 1000) => new Date(Date.now() + ms);
export const pastDate = (ms = 10 * 60 * 1000) => new Date(Date.now() - ms);
