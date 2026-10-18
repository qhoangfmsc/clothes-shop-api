import { PaymentService } from './payment.service';
import { futureDate, pastDate } from './payment.test-utils';

/** Query builder giả: ghi lại các điều kiện và trả danh sách cho trước */
function setup(attempts: any[], transactions: any[] = []) {
  const calls = { where: [] as Array<[string, any]>, orderBy: [] as any[], skip: 0, take: 0 };
  const qb: any = {
    innerJoin: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    andWhere: jest.fn((sql: string, params: any) => {
      calls.where.push([sql, params]);
      return qb;
    }),
    orderBy: jest.fn((...args: any[]) => {
      calls.orderBy.push(args);
      return qb;
    }),
    skip: jest.fn((n: number) => {
      calls.skip = n;
      return qb;
    }),
    take: jest.fn((n: number) => {
      calls.take = n;
      return qb;
    }),
    getManyAndCount: jest.fn(async () => [attempts, attempts.length]),
  };
  const dataSource: any = { query: jest.fn(async () => undefined) };
  const attemptRepo: any = { createQueryBuilder: jest.fn(() => qb) };
  const transactionRepo: any = { find: jest.fn(async () => transactions) };
  const service = new PaymentService(
    dataSource,
    {} as any,
    attemptRepo,
    transactionRepo,
    {} as any,
    { getVndPerUsd: async () => 25000 } as any,
  );
  return { service, qb, calls, dataSource, transactionRepo };
}

const order = (over: Record<string, any> = {}) => ({
  id: 'o1',
  userId: 'u1',
  status: 'pending',
  paymentStatus: 'unpaid',
  total: 13_000,
  exchangeRate: 26_000,
  shippingAddress: { fullName: 'Nguyen A', phone: '0901' },
  ...over,
});
const attempt = (over: Record<string, any> = {}) => ({
  id: 'a1',
  transferCode: 'DHG29JR5A8',
  amount: 13_000,
  status: 'PENDING',
  expiresAt: futureDate(),
  paidAt: null,
  createdAt: new Date('2026-01-01'),
  order: order(),
  ...over,
});

describe('PaymentService.findAttemptsAdmin — look a transfer content up', () => {
  it('returns the code with its order, customer, effective status and linked transactions', async () => {
    const { service } = setup(
      [attempt({ expiresAt: pastDate() })],
      [
        {
          id: 't1',
          paymentAttemptId: 'a1',
          provider: 'sepay',
          providerTransactionId: '92704',
          amount: 13_000,
          verificationStatus: 'LATE',
          transferContent: 'DHG29JR5A8',
          receivedAt: new Date(),
          rawPayload: { secret: 'x' },
        },
      ],
    );
    const res = await service.findAttemptsAdmin({ search: 'DHG29JR5A8' });

    expect(res).toMatchObject({ total: 1, page: 1, limit: 25, totalPages: 1 });
    expect(res.data[0]).toMatchObject({
      id: 'a1',
      transferCode: 'DHG29JR5A8',
      amountVnd: 13_000,
      amountUsd: 0.5, // theo tỷ giá 26 000 chốt trên đơn
      status: 'EXPIRED', // PENDING quá hạn
      order: {
        id: 'o1',
        status: 'pending',
        paymentStatus: 'unpaid',
        totalVnd: 13_000,
        totalUsd: 0.5,
        exchangeRate: 26_000,
        customer: { fullName: 'Nguyen A', phone: '0901' },
      },
      transactions: [{ id: 't1', providerTransactionId: '92704', verificationStatus: 'LATE', amountVnd: 13_000, amountUsd: 0.5 }],
    });
    expect(JSON.stringify(res.data[0])).not.toMatch(/rawPayload|secret|bankAccount/);
    expect(res.data[0]).not.toHaveProperty('amount');
    expect(res.data[0].order).not.toHaveProperty('total');
  });

  it('shows a PENDING session of a cancelled order as CANCELLED and keeps PAID as PAID', async () => {
    const { service } = setup([
      attempt({ id: 'c', order: order({ status: 'cancelled' }) }),
      attempt({ id: 'p', status: 'PAID', paidAt: new Date(), order: order({ status: 'cancelled' }) }),
    ]);
    const { data } = await service.findAttemptsAdmin({});
    expect(data.map((a) => a.status)).toEqual(['CANCELLED', 'PAID']);
  });

  it('works for pickup orders without an address snapshot', async () => {
    const { service } = setup([attempt({ order: order({ shippingAddress: {} }) })]);
    expect((await service.findAttemptsAdmin({})).data[0].order.customer).toEqual({ fullName: null, phone: null });
  });

  it('applies orderId / effective-status / search filters and the default sort -createdAt', async () => {
    const { service, calls } = setup([]);
    await service.findAttemptsAdmin({ orderId: 'o1', status: 'EXPIRED', search: 'dhg29' });
    const sqls = calls.where.map(([sql]) => sql).join('\n');
    expect(sqls).toContain('a.order_id = :orderId');
    expect(sqls).toContain("o.status = 'cancelled'");
    expect(sqls).toContain('a.transfer_code ILIKE :search');
    expect(calls.where.find(([sql]) => sql.includes('= :status'))![1]).toEqual({ status: 'EXPIRED' });
    expect(calls.where.find(([sql]) => sql.includes('ILIKE :search'))![1]).toEqual({ search: '%dhg29%' });
    expect(calls.orderBy[0]).toEqual(['a.createdAt', 'DESC']);
  });

  it('honours sort and pagination', async () => {
    const { service, calls } = setup([]);
    await service.findAttemptsAdmin({ sort: 'amount', page: 3, limit: 10 });
    expect(calls.orderBy[0]).toEqual(['a.amount', 'ASC']);
    expect([calls.skip, calls.take]).toEqual([20, 10]);
  });

  it('persists overdue PENDING sessions as EXPIRED (never touching cancelled orders) before listing, and skips the transaction lookup when empty', async () => {
    const { service, dataSource, transactionRepo } = setup([]);
    await service.findAttemptsAdmin({});
    const sql = dataSource.query.mock.calls[0][0] as string;
    expect(sql).toContain('SET "status" = \'EXPIRED\'');
    expect(sql).toContain('"status" = \'PENDING\' AND "expires_at" <= now()');
    expect(sql).toContain('"status" = \'cancelled\'');
    expect(transactionRepo.find).not.toHaveBeenCalled();
  });
});
