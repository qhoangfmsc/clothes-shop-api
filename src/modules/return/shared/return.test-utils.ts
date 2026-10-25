import { Order } from '../../order/shared/order.entity';
import { createFakeManager } from '../../payment/shared/payment.test-utils';
import { RefundService } from '../../refund/refund.service';
import { ReturnRequest } from './return-request.entity';

export const DAY = 24 * 60 * 60 * 1000;
export const PAID = 4_625_000; // = orders.total (VND)
export const order = (over: Record<string, any> = {}) => ({
  id: 'o1',
  userId: 'u1',
  status: 'delivered',
  paymentStatus: 'paid',
  paidAt: new Date(Date.now() - 10 * DAY),
  deliveredAt: new Date(Date.now() - 5 * DAY),
  subtotal: 4_250_000,
  shippingFee: 375_000,
  total: 4_625_000,
  exchangeRate: 25_000,
  shippingAddress: { fullName: 'Nguyen Van A', phone: '0900000000' },
  ...over,
});
export const orderItems = [
  { id: 'i1', orderId: 'o1', productName: 'Linen Shirt', productImage: 'a.jpg', price: 1_500_000, quantity: 2, size: 'M', color: 'white' },
  { id: 'i2', orderId: 'o1', productName: 'Chino Pants', productImage: 'b.jpg', price: 1_250_000, quantity: 1, size: '32', color: 'navy' },
];
export const attempt = (over: Record<string, any> = {}) => ({
  id: 'a1',
  orderId: 'o1',
  status: 'PAID',
  amount: PAID,
  transferCode: 'DHPAID0000',
  ...over,
});
export const returnRow = (over: Record<string, any> = {}) => ({
  id: 'r1',
  orderId: 'o1',
  status: 'REQUESTED',
  reason: 'WRONG_SIZE',
  note: '',
  adminNote: null,
  requestedBy: 'u1',
  processedBy: null,
  approvedAt: null,
  receivedAt: null,
  shippingRefunded: false,
  createdAt: new Date('2026-01-01'),
  ...over,
});
export const returnItem = (over: Record<string, any> = {}) => ({
  id: 'ri1',
  returnRequestId: 'r1',
  orderItemId: 'i1',
  quantity: 2,
  acceptedQuantity: null,
  ...over,
});

export function buildReturnTestKit(seed: Parameters<typeof createFakeManager>[0] = {}, policyDays = 30) {
  const manager = createFakeManager({ orders: [order()], orderItems, attempts: [attempt()], ...seed });
  const dataSource: any = { transaction: jest.fn(async (fn: any) => fn(manager)), manager };
  const rows = (entity: any) => manager.tables.get(entity)!;
  const calls: { andWhere: [string, any][]; orderBy?: [string, string]; skip?: number; take?: number; findAndCount?: any } = {
    andWhere: [],
  };
  const joined = (r: any) => ({ ...r, order: rows(Order).find((o) => o.id === r.orderId) });
  const qb: any = {
    innerJoin: () => qb,
    addSelect: () => qb,
    andWhere: (sql: string, params: any) => {
      calls.andWhere.push([sql, params]);
      return qb;
    },
    orderBy: (field: string, dir: string) => {
      calls.orderBy = [field, dir];
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
    getManyAndCount: async () => [rows(ReturnRequest).map(joined), rows(ReturnRequest).length],
  };
  const returnRepo: any = {
    findAndCount: jest.fn(async (opts: any) => {
      calls.findAndCount = opts;
      const owned = rows(ReturnRequest).filter(
        (r) =>
          rows(Order).find((o) => o.id === r.orderId)?.userId === opts.where.order.userId &&
          (!opts.where.status || r.status === opts.where.status) &&
          (!opts.where.orderId || r.orderId === opts.where.orderId),
      );
      return [owned, owned.length];
    }),
    createQueryBuilder: () => qb,
  };
  const shipping: any = { get: jest.fn(async () => ({ returnPolicy: { days: policyDays, description: '', conditions: [] } })) };
  const refundService = new RefundService(dataSource, {} as any, {} as any);
  return { dataSource, shipping, refundService, returnRepo, manager, rows, calls };
}

export const items = (...pairs: [string, number][]) => pairs.map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
