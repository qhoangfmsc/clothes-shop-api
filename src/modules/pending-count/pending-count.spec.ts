import { Permission } from '@common/permissions/permissions.constant';
import { ValidationPipe } from '@nestjs/common';
import { AdminOrderQueryDto } from '../order/dtos/admin-order-query.dto';
import { OrderService } from '../order/order.service';
import { ORDER_NEEDS_ACTION_SQL } from '../order/order-needs-action.util';
import { AdminPaymentTransactionQueryDto } from '../payment/dtos/admin-payment-transaction-query.dto';
import { PaymentService } from '../payment/payment.service';
import { TRANSACTION_NEEDS_REVIEW_SQL } from '../payment/payment-needs-review.util';
import { PendingCountService } from './pending-count.service';

/** Query builder giả ghi lại các điều kiện được thêm vào */
function fakeQb(count = 7) {
  const wheres: [string, any?][] = [];
  const qb: any = {
    wheres,
    leftJoinAndSelect: () => qb,
    leftJoin: () => qb,
    addSelect: () => qb,
    where: (sql: string, params?: any) => {
      wheres.push([sql, params]);
      return qb;
    },
    andWhere: (sql: string, params?: any) => {
      wheres.push([sql, params]);
      return qb;
    },
    orderBy: () => qb,
    skip: () => qb,
    take: () => qb,
    getManyAndCount: async () => [[], 0],
    getCount: async () => count,
  };
  return qb;
}

describe('PendingCountService — permissions decide which keys exist and which COUNTs run', () => {
  const make = () => {
    const orderService: any = { countNeedsAction: jest.fn(async () => 3) };
    const paymentService: any = { countNeedsReview: jest.fn(async () => 2) };
    const refundService: any = { countRequested: jest.fn(async () => 1) };
    const returnService: any = { countRequested: jest.fn(async () => 4) };
    const reviewService: any = { countAwaitingReply: jest.fn(async () => 6) };
    return {
      service: new PendingCountService(orderService, paymentService, refundService, returnService, reviewService),
      orderService,
      paymentService,
      refundService,
      returnService,
      reviewService,
    };
  };
  const user = (permissions: number[], role = 'user') => ({ role, permissions });

  it('an admin gets all five numbers', async () => {
    const { service } = make();
    expect(await service.get(user([], 'admin'))).toEqual({ data: { orders: 3, payments: 2, refunds: 1, returns: 4, reviews: 6 } });
  });

  it('a user with every view permission gets all five numbers', async () => {
    const { service } = make();
    const all = [Permission.ORDER_ADMIN_VIEW, Permission.PAYMENT_ADMIN_VIEW, Permission.RETURN_ADMIN_VIEW, Permission.REVIEW_ADMIN_VIEW];
    expect((await service.get(user(all))).data).toEqual({ orders: 3, payments: 2, refunds: 1, returns: 4, reviews: 6 });
  });

  it('only RETURN_ADMIN_VIEW → only `returns`; the other COUNTs are never run', async () => {
    const h = make();
    expect(await h.service.get(user([Permission.RETURN_ADMIN_VIEW]))).toEqual({ data: { returns: 4 } });
    expect(h.orderService.countNeedsAction).not.toHaveBeenCalled();
    expect(h.paymentService.countNeedsReview).not.toHaveBeenCalled();
    expect(h.refundService.countRequested).not.toHaveBeenCalled();
    expect(h.reviewService.countAwaitingReply).not.toHaveBeenCalled();
  });

  it('only REVIEW_ADMIN_VIEW → only `reviews`', async () => {
    const h = make();
    expect(await h.service.get(user([Permission.REVIEW_ADMIN_VIEW]))).toEqual({ data: { reviews: 6 } });
    expect(h.orderService.countNeedsAction).not.toHaveBeenCalled();
    expect(h.returnService.countRequested).not.toHaveBeenCalled();
  });

  it('PAYMENT_ADMIN_VIEW → `payments` and `refunds`', async () => {
    const h = make();
    expect((await h.service.get(user([Permission.PAYMENT_ADMIN_VIEW]))).data).toEqual({ payments: 2, refunds: 1 });
    expect(h.returnService.countRequested).not.toHaveBeenCalled();
  });

  it('ORDER_ADMIN_VIEW → only `orders`', async () => {
    expect((await make().service.get(user([Permission.ORDER_ADMIN_VIEW]))).data).toEqual({ orders: 3 });
  });

  it('a zero count is returned as 0, but a missing permission is a missing key', async () => {
    const h = make();
    h.returnService.countRequested.mockResolvedValue(0);
    const { data } = await h.service.get(user([Permission.RETURN_ADMIN_VIEW]));
    expect(data).toEqual({ returns: 0 });
    expect('orders' in data).toBe(false);
  });

  it('no relevant permission → no keys, no queries; unrelated permissions do not count', async () => {
    const h = make();
    expect(await h.service.get(user([Permission.CART_VIEW]))).toEqual({ data: {} });
    expect(await h.service.get({ role: 'user', permissions: undefined as any })).toEqual({ data: {} });
    expect(h.orderService.countNeedsAction).not.toHaveBeenCalled();
  });

  it('runs the allowed COUNTs in parallel (all started before any finishes)', async () => {
    const h = make();
    const started: string[] = [];
    const slow = (name: string, value: number) =>
      jest.fn(() => {
        started.push(name);
        return new Promise<number>((resolve) => setTimeout(() => resolve(value), 20));
      });
    h.orderService.countNeedsAction = slow('orders', 1);
    h.paymentService.countNeedsReview = slow('payments', 2);
    h.refundService.countRequested = slow('refunds', 3);
    h.returnService.countRequested = slow('returns', 4);
    h.reviewService.countAwaitingReply = slow('reviews', 5);
    const run = h.service.get(user([], 'admin'));
    expect(started).toEqual(['orders', 'payments', 'refunds', 'returns', 'reviews']);
    expect((await run).data).toEqual({ orders: 1, payments: 2, refunds: 3, returns: 4, reviews: 5 });
  });
});

describe('the list filters and the counts share one condition', () => {
  it('orders: needsAction=true adds the shared SQL to the list, and the count uses the same SQL', async () => {
    const listQb = fakeQb();
    const countQb = fakeQb(5);
    const orderRepo: any = { createQueryBuilder: jest.fn().mockReturnValueOnce(listQb).mockReturnValueOnce(countQb) };
    const service = new OrderService(orderRepo, {} as any, {} as any, {} as any, {} as any, {} as any);

    await service.findAllAdmin({ needsAction: true });
    expect(listQb.wheres.map(([sql]: any) => sql)).toContain(ORDER_NEEDS_ACTION_SQL);

    expect(await service.countNeedsAction()).toBe(5);
    expect(countQb.wheres.map(([sql]: any) => sql)).toEqual([ORDER_NEEDS_ACTION_SQL]);
  });

  it.each([[undefined], [false]])('orders: needsAction=%s does not filter', async (needsAction) => {
    const qb = fakeQb();
    const service = new OrderService({ createQueryBuilder: () => qb } as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await service.findAllAdmin({ needsAction });
    expect(qb.wheres.map(([sql]: any) => sql)).not.toContain(ORDER_NEEDS_ACTION_SQL);
  });

  it('orders: combines with the other filters instead of replacing them', async () => {
    const qb = fakeQb();
    const service = new OrderService({ createQueryBuilder: () => qb } as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await service.findAllAdmin({ needsAction: true, status: 'pending', paymentStatus: 'unpaid', search: 'abc', userId: 'u1' });
    const sqls = qb.wheres.map(([sql]: any) => sql);
    expect(sqls).toEqual(
      expect.arrayContaining([ORDER_NEEDS_ACTION_SQL, 'o.status = :status', 'o.payment_status = :paymentStatus', 'o.user_id = :userId']),
    );
    expect(sqls.some((sql: string) => sql.includes('ILIKE :search'))).toBe(true);
  });

  it('transactions: needsReview=true adds the shared SQL to the list, and the count uses the same SQL', async () => {
    const listQb = fakeQb();
    const countQb = fakeQb(2);
    const transactionRepo: any = { createQueryBuilder: jest.fn().mockReturnValueOnce(listQb).mockReturnValueOnce(countQb) };
    const service = new PaymentService({} as any, {} as any, {} as any, transactionRepo, {} as any);

    await service.findTransactionsAdmin({ needsReview: true, verificationStatus: 'LATE' });
    expect(listQb.wheres.map(([sql]: any) => sql)).toEqual(
      expect.arrayContaining([TRANSACTION_NEEDS_REVIEW_SQL, 't.verification_status = :verificationStatus']),
    );

    expect(await service.countNeedsReview()).toBe(2);
    expect(countQb.wheres.map(([sql]: any) => sql)).toEqual([TRANSACTION_NEEDS_REVIEW_SQL]);
  });

  it('transactions: no needsReview → the list is not filtered', async () => {
    const qb = fakeQb();
    const service = new PaymentService({} as any, {} as any, {} as any, { createQueryBuilder: () => qb } as any, {} as any);
    await service.findTransactionsAdmin({});
    expect(qb.wheres.map(([sql]: any) => sql)).not.toContain(TRANSACTION_NEEDS_REVIEW_SQL);
  });

  it('the SQL conditions encode the agreed rules', () => {
    expect(ORDER_NEEDS_ACTION_SQL).toContain("o.status IN ('pending', 'confirmed')");
    expect(ORDER_NEEDS_ACTION_SQL).toContain("pa.status = 'PENDING' AND pa.expires_at > now()");
    expect(ORDER_NEEDS_ACTION_SQL).not.toMatch(/shipping|delivered|completed|cancelled/);
    expect(TRANSACTION_NEEDS_REVIEW_SQL).toContain("'UNMATCHED', 'AMOUNT_MISMATCH', 'LATE', 'NOT_PAYABLE'");
    for (const excluded of ['MATCHED', 'MANUALLY_CONFIRMED', 'DUPLICATE_PAYMENT', 'IGNORED', 'ACCOUNT_MISMATCH']) {
      expect(TRANSACTION_NEEDS_REVIEW_SQL).not.toContain(`'${excluded}'`);
    }
  });
});

describe('boolean filters in the query string', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const parse = (metatype: any, value: any) => pipe.transform(value, { type: 'query', metatype });

  it.each([
    [AdminOrderQueryDto, 'needsAction'],
    [AdminPaymentTransactionQueryDto, 'needsReview'],
  ])('%p.%s: "true" → true, "false" → false (not coerced to true), absent → undefined', async (dto, field) => {
    expect(((await parse(dto, { [field]: 'true' })) as any)[field]).toBe(true);
    expect(((await parse(dto, { [field]: 'false' })) as any)[field]).toBe(false);
    expect(((await parse(dto, {})) as any)[field]).toBeUndefined();
  });

  it.each([
    [AdminOrderQueryDto, 'needsAction'],
    [AdminPaymentTransactionQueryDto, 'needsReview'],
  ])('%p.%s rejects anything other than true/false → 400', async (dto, field) => {
    for (const bad of ['yes', '1', '0', 'TRUE', '']) {
      await expect(parse(dto, { [field]: bad })).rejects.toBeDefined();
    }
  });

  it('combines with the standard list params (defaults 1/25)', async () => {
    expect(await parse(AdminOrderQueryDto, { needsAction: 'true', search: 'x', sort: 'total', page: '2', limit: '10' })).toMatchObject({
      needsAction: true,
      search: 'x',
      sort: 'total',
      page: 2,
      limit: 10,
    });
    expect(await parse(AdminPaymentTransactionQueryDto, { needsReview: 'true' })).toMatchObject({ page: 1, limit: 25 });
  });
});
