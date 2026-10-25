import { futureDate, pastDate } from '../shared/payment.test-utils';
import { PaymentOverviewService } from './payment-overview.service';

const order = (over: Record<string, any> = {}) => ({
  id: 'o1',
  userId: 'u1',
  status: 'pending',
  paymentStatus: 'unpaid',
  paidAt: null,
  total: 4_625_000,
  exchangeRate: 25_000,
  ...over,
});
const attempt = (over: Record<string, any> = {}) => ({
  id: 'a1',
  orderId: 'o1',
  transferCode: 'DH8K4T72M9',
  amount: 4_625_000,
  bankAccount: '0010000000355',
  status: 'PENDING',
  expiresAt: futureDate(),
  paidAt: null,
  createdAt: new Date('2026-01-01'),
  ...over,
});
const tx = (over: Record<string, any> = {}) => ({
  id: 't1',
  paymentAttemptId: 'a1',
  providerTransactionId: '92704',
  provider: 'sepay',
  amount: 4_625_000,
  verificationStatus: 'LATE',
  confirmedBy: null,
  confirmedAt: null,
  confirmNote: null,
  rawPayload: { id: 92704 },
  ...over,
});

describe('PaymentOverviewService.getOrderPaymentsAdmin', () => {
  it('returns the order summary, attempts (newest first) and their transactions', async () => {
    const attempts = [attempt({ id: 'a2', createdAt: new Date('2026-02-01') }), attempt({ id: 'a1', createdAt: new Date('2026-01-01') })];
    const transactions = [tx({ id: 't1', paymentAttemptId: 'a1' })];
    const orderRepo: any = {
      findOne: jest.fn(async () => order({ shippingAddress: { fullName: 'Nguyen A', phone: '09' }, subtotal: 4_625_000, shippingFee: 0 })),
    };
    const attemptRepo: any = { find: jest.fn(async () => attempts) };
    const transactionRepo: any = { find: jest.fn(async () => transactions) };
    const service = new PaymentOverviewService(orderRepo, attemptRepo, transactionRepo);

    const { data } = await service.getOrderPaymentsAdmin('o1');

    expect(data.order).toMatchObject({ id: 'o1', paymentStatus: 'unpaid', customer: { fullName: 'Nguyen A', phone: '09' } });
    expect(attemptRepo.find).toHaveBeenCalledWith({ where: { orderId: 'o1' }, order: { createdAt: 'DESC' } });
    expect(data.attempts.map((a) => a.id)).toEqual(['a2', 'a1']);
    expect(data.transactions).toEqual([expect.objectContaining({ id: 't1', amountVnd: 4_625_000, amountUsd: 185 })]);
    expect(data.transactions[0]).not.toHaveProperty('amount');
    expect(data.order).toMatchObject({ totalVnd: 4_625_000, totalUsd: 185, exchangeRate: 25_000 });
  });

  it('works for a pickup order whose snapshot has no address, and for an order with no attempts', async () => {
    const orderRepo: any = { findOne: jest.fn(async () => order({ shippingAddress: {} })) };
    const transactionRepo: any = { find: jest.fn() };
    const service = new PaymentOverviewService(orderRepo, { find: jest.fn(async () => []) } as any, transactionRepo);
    const { data } = await service.getOrderPaymentsAdmin('o1');
    expect(data.order.customer).toEqual({ fullName: null, phone: null });
    expect(data.transactions).toEqual([]);
    expect(transactionRepo.find).not.toHaveBeenCalled();
  });

  it('404 / 1301 for an unknown order', async () => {
    const service = new PaymentOverviewService({ findOne: jest.fn(async () => null) } as any, {} as any, {} as any);
    await expect(service.getOrderPaymentsAdmin('nope')).rejects.toMatchObject({ status: 404, response: { errorCode: 1301 } });
  });
});

describe('PaymentOverviewService.getOrderPaymentsAdmin — effective status', () => {
  it('shows an overdue PENDING session as EXPIRED and keeps every code', async () => {
    const attempts = [
      { id: 'new', transferCode: 'DHS75TYVN3', status: 'PENDING', expiresAt: futureDate(), createdAt: new Date('2026-02-01') },
      { id: 'old', transferCode: 'DHG29JR5A8', status: 'PENDING', expiresAt: pastDate(), createdAt: new Date('2026-01-01') },
    ];
    const service = new PaymentOverviewService(
      { findOne: jest.fn(async () => order({ shippingAddress: {} })) } as any,
      { find: jest.fn(async () => attempts) } as any,
      { find: jest.fn(async () => []) } as any,
    );
    const { data } = await service.getOrderPaymentsAdmin('o1');
    expect(data.attempts.map((a) => [a.transferCode, a.status])).toEqual([
      ['DHS75TYVN3', 'PENDING'],
      ['DHG29JR5A8', 'EXPIRED'],
    ]);
  });
});
