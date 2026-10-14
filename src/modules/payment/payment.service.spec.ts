import { Order } from '../order/order.entity';
import { PaymentService } from './payment.service';
import { createFakeManager, futureDate, pastDate } from './payment.test-utils';
import { PaymentAttempt } from './payment-attempt.entity';

const qrConfig = {
  bankCode: 'Vietcombank',
  bankName: 'Vietcombank',
  account: '0010000000355',
  accountName: 'CONG TY DOOVAN',
  prefix: 'DH',
  vndPerUnit: 25_000,
};
const order = (over: Record<string, any> = {}) => ({
  id: 'o1',
  userId: 'u1',
  status: 'pending',
  paymentStatus: 'unpaid',
  total: '185.00',
  ...over,
});
const attempt = (over: Record<string, any> = {}) => ({
  id: 'a1',
  orderId: 'o1',
  transferCode: 'DH8K4T72M9',
  amount: 4_625_000,
  bankAccount: qrConfig.account,
  status: 'PENDING',
  expiresAt: futureDate(),
  paidAt: null,
  createdAt: new Date(),
  ...over,
});

function setup(seed: Parameters<typeof createFakeManager>[0], config = qrConfig) {
  const manager = createFakeManager(seed);
  const dataSource = { transaction: jest.fn(async (fn: any) => fn(manager)) };
  const orderRepo = {
    findOne: jest.fn(
      async ({ where }: any) => manager.tables.get(Order)!.find((o) => o.id === where.id && o.userId === where.userId) ?? null,
    ),
  };
  const attemptRepo = {
    findOne: jest.fn(async ({ where }: any) => {
      const rows = manager.tables.get(PaymentAttempt)!.filter((a) => a.orderId === where.orderId);
      return rows.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
    }),
  };
  const paymentConfig = { getQrConfig: jest.fn(() => config) };
  const service = new PaymentService(dataSource as any, orderRepo as any, attemptRepo as any, {} as any, paymentConfig as any);
  return { manager, service, attempts: () => manager.tables.get(PaymentAttempt)! };
}

describe('PaymentService.createQr', () => {
  it('creates a PENDING attempt with the amount converted from the DB total and a DH-prefixed unique code', async () => {
    const { service, attempts } = setup({ orders: [order()] });

    const { data } = await service.createQr('u1', { orderId: 'o1' });

    expect(attempts()).toHaveLength(1);
    expect(data.amount).toBe(4_625_000); // 185 × 25 000
    expect(data.transferContent).toMatch(/^DH[A-HJ-NP-Z2-9]{8}$/);
    expect(data).toMatchObject({
      orderId: 'o1',
      status: 'PENDING',
      bankName: 'Vietcombank',
      accountNumber: '0010000000355',
      accountName: 'CONG TY DOOVAN',
    });
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 60 * 1000);
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 30 * 60 * 1000);
    expect(attempts()[0]).toMatchObject({ amount: 4_625_000, bankAccount: '0010000000355', transferCode: data.transferContent });
  });

  it('the code is the same value in the response, the QR URL and the DB', async () => {
    const { service, attempts } = setup({ orders: [order()] });
    const { data } = await service.createQr('u1', { orderId: 'o1' });
    expect(attempts()[0].transferCode).toBe(data.transferContent);
    expect(new URL(data.qrUrl).searchParams.get('des')).toBe(data.transferContent);
  });

  it('follows PAYMENT_TRANSFER_PREFIX', async () => {
    const { service } = setup({ orders: [order()] }, { ...qrConfig, prefix: 'XY' });
    expect((await service.createQr('u1', { orderId: 'o1' })).data.transferContent).toMatch(/^XY[A-HJ-NP-Z2-9]{8}$/);
  });

  it('builds a VietQR URL carrying account, bank, amount and the transfer code', async () => {
    const { service } = setup({ orders: [order()] });
    const { data } = await service.createQr('u1', { orderId: 'o1' });
    const url = new URL(data.qrUrl);
    expect(`${url.origin}${url.pathname}`).toBe('https://vietqr.app/img');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      acc: '0010000000355',
      bank: 'Vietcombank',
      amount: '4625000',
      des: data.transferContent,
    });
  });

  it('rounds fractional amounts to whole VND', async () => {
    const { service } = setup({ orders: [order({ total: '10.05' })] }, { ...qrConfig, vndPerUnit: 24_567.5 });
    const { data } = await service.createQr('u1', { orderId: 'o1' });
    expect(data.amount).toBe(Math.round(10.05 * 24_567.5));
    expect(Number.isInteger(data.amount)).toBe(true);
  });

  it('locks the order row so concurrent requests cannot create two pending sessions', async () => {
    const { service, manager } = setup({ orders: [order()] });
    await service.createQr('u1', { orderId: 'o1' });
    expect(manager.locks).toEqual(['Order:{"id":"o1","userId":"u1"}']);
  });

  it('reuses a valid PENDING attempt instead of creating another', async () => {
    const existing = attempt();
    const { service, attempts } = setup({ orders: [order()], attempts: [existing] });

    const { data } = await service.createQr('u1', { orderId: 'o1' });

    expect(attempts()).toHaveLength(1);
    expect(data).toMatchObject({ paymentId: 'a1', transferContent: 'DH8K4T72M9', amount: 4_625_000, expiresAt: existing.expiresAt });
  });

  it('expires an outdated PENDING attempt, keeps it, and issues a NEW unique code (old code is never reused)', async () => {
    const { service, attempts } = setup({ orders: [order()], attempts: [attempt({ expiresAt: pastDate() })] });

    const { data } = await service.createQr('u1', { orderId: 'o1' });

    expect(attempts()).toHaveLength(2);
    expect(attempts()[0].status).toBe('EXPIRED');
    expect(data.paymentId).not.toBe('a1');
    expect(data.transferContent).not.toBe('DH8K4T72M9');
    expect(attempts()[0]).toMatchObject({ status: 'EXPIRED', transferCode: 'DH8K4T72M9' }); // mã cũ vẫn được lưu
    expect(attempts()[1]).toMatchObject({ status: 'PENDING', transferCode: data.transferContent });
  });

  it("returns 404 for another user's order or an unknown order", async () => {
    const { service } = setup({ orders: [order({ userId: 'someone-else' })] });
    await expect(service.createQr('u1', { orderId: 'o1' })).rejects.toMatchObject({ status: 404 });
    await expect(service.createQr('u1', { orderId: 'nope' })).rejects.toMatchObject({ status: 404 });
  });

  it('rejects an already-paid or cancelled order', async () => {
    await expect(setup({ orders: [order({ paymentStatus: 'paid' })] }).service.createQr('u1', { orderId: 'o1' })).rejects.toMatchObject({
      response: { errorCode: 1702 },
    });
    await expect(setup({ orders: [order({ status: 'cancelled' })] }).service.createQr('u1', { orderId: 'o1' })).rejects.toMatchObject({
      response: { errorCode: 1702 },
    });
  });

  it('fails clearly when payment is not configured', async () => {
    const { service } = setup({ orders: [order()] });
    (service as any).paymentConfig.getQrConfig.mockImplementation(() => {
      throw new Error('not configured');
    });
    await expect(service.createQr('u1', { orderId: 'o1' })).rejects.toThrow('not configured');
  });
});

describe('PaymentService.getStatus', () => {
  it('PAID when the order is paid', async () => {
    const { service } = setup({ orders: [order({ paymentStatus: 'paid' })], attempts: [attempt({ status: 'PAID' })] });
    await expect(service.getStatus('u1', 'o1')).resolves.toEqual({ data: { orderId: 'o1', status: 'PAID' } });
  });

  it('PENDING while the QR is valid', async () => {
    const { service } = setup({ orders: [order()], attempts: [attempt()] });
    await expect(service.getStatus('u1', 'o1')).resolves.toEqual({ data: { orderId: 'o1', status: 'PENDING' } });
  });

  it('EXPIRED when the QR deadline has passed even if the row is still PENDING', async () => {
    const { service } = setup({ orders: [order()], attempts: [attempt({ expiresAt: pastDate() })] });
    await expect(service.getStatus('u1', 'o1')).resolves.toEqual({ data: { orderId: 'o1', status: 'EXPIRED' } });
  });

  it('CANCELLED when the order was cancelled while a session was pending', async () => {
    const { service } = setup({ orders: [order({ status: 'cancelled' })], attempts: [attempt()] });
    await expect(service.getStatus('u1', 'o1')).resolves.toEqual({ data: { orderId: 'o1', status: 'CANCELLED' } });
  });

  it('404 for another user, and 404 (1703) when no payment session exists yet', async () => {
    const { service } = setup({ orders: [order()] });
    await expect(service.getStatus('u2', 'o1')).rejects.toMatchObject({ status: 404 });
    await expect(service.getStatus('u1', 'o1')).rejects.toMatchObject({ status: 404, response: { errorCode: 1703 } });
  });

  it('only reads the database (never calls SePay)', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const { service } = setup({ orders: [order()], attempts: [attempt()] });
    await service.getStatus('u1', 'o1');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('PaymentService.listAttemptsForCustomer', () => {
  const att = (over: Record<string, any> = {}) => ({
    id: 'a1',
    orderId: 'o1',
    transferCode: 'DH8K4T72M9',
    amount: 3_375_000,
    bankAccount: '0010000000355',
    status: 'PENDING',
    expiresAt: futureDate(),
    paidAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...over,
  });
  const tx = (over: Record<string, any> = {}) => ({
    id: 't1',
    paymentAttemptId: 'a1',
    providerTransactionId: '92704',
    verificationStatus: 'MATCHED',
    rawPayload: { accountNumber: 'secret' },
    ...over,
  });

  function make(attempts: any[], transactions: any[] = []) {
    const attemptRepo: any = { find: jest.fn(async () => [...attempts].sort((a, b) => b.createdAt - a.createdAt)) };
    const transactionRepo: any = { find: jest.fn(async () => transactions) };
    return { service: new PaymentService({} as any, {} as any, attemptRepo, transactionRepo, {} as any), attemptRepo, transactionRepo };
  }
  const order = { id: 'o1', status: 'pending' };

  it('returns [] for an order that never had a session, without querying transactions', async () => {
    const { service, transactionRepo } = make([]);
    await expect(service.listAttemptsForCustomer(order)).resolves.toEqual([]);
    expect(transactionRepo.find).not.toHaveBeenCalled();
  });

  it('returns every session, newest first, including the expired one', async () => {
    const { service, attemptRepo } = make([
      att({ id: 'old', transferCode: 'DHOLD00000', status: 'EXPIRED', expiresAt: pastDate(), createdAt: new Date('2026-01-01') }),
      att({ id: 'new', transferCode: 'DHNEW00000', createdAt: new Date('2026-02-01') }),
    ]);
    const list = await service.listAttemptsForCustomer(order);
    expect(attemptRepo.find).toHaveBeenCalledWith({ where: { orderId: 'o1' }, order: { createdAt: 'DESC' } });
    expect(list.map((a) => [a.transferCode, a.status])).toEqual([
      ['DHNEW00000', 'PENDING'],
      ['DHOLD00000', 'EXPIRED'],
    ]);
  });

  it('a PAID session carries transactionRef = provider_transaction_id of the matched transaction; others are null', async () => {
    const { service, transactionRepo } = make(
      [
        att({ id: 'old', transferCode: 'DHOLD00000', status: 'EXPIRED', createdAt: new Date('2026-01-01') }),
        att({ id: 'a1', status: 'PAID', paidAt: new Date('2026-02-02'), createdAt: new Date('2026-02-01') }),
      ],
      [tx()],
    );
    const list = await service.listAttemptsForCustomer({ id: 'o1', status: 'pending' });
    expect(list[0]).toMatchObject({ transferCode: 'DH8K4T72M9', status: 'PAID', transactionRef: '92704' });
    expect(list[0].paidAt).toEqual(new Date('2026-02-02'));
    expect(list[1].transactionRef).toBeNull();
    // chỉ hỏi giao dịch đã khớp của phiên PAID
    expect(JSON.stringify(transactionRepo.find.mock.calls[0][0])).toContain('MANUALLY_CONFIRMED');
  });

  it('returns a manually recorded reference exactly as stored (the same value the admin sees)', async () => {
    const { service } = make(
      [att({ status: 'PAID', paidAt: new Date() })],
      [tx({ providerTransactionId: 'FT24012345', provider: 'manual', verificationStatus: 'MANUALLY_CONFIRMED' })],
    );
    expect((await service.listAttemptsForCustomer(order))[0].transactionRef).toBe('FT24012345');
  });

  it('a PAID session without a matched transaction (should not happen) still returns, with transactionRef null', async () => {
    const { service } = make([att({ status: 'PAID', paidAt: new Date() })], []);
    expect((await service.listAttemptsForCustomer(order))[0]).toMatchObject({ status: 'PAID', transactionRef: null });
  });

  it('derives the status like getStatus: overdue PENDING → EXPIRED, PENDING of a cancelled order → CANCELLED', async () => {
    const overdue = make([att({ expiresAt: pastDate() })]);
    expect((await overdue.service.listAttemptsForCustomer(order))[0].status).toBe('EXPIRED');

    const cancelled = make(
      [att(), att({ id: 'a2', transferCode: 'DHPAID0000', status: 'PAID', paidAt: new Date(), createdAt: new Date('2025-12-01') })],
      [tx({ paymentAttemptId: 'a2', providerTransactionId: '1' })],
    );
    const list = await cancelled.service.listAttemptsForCustomer({ id: 'o1', status: 'cancelled' });
    expect(list.map((a) => a.status)).toEqual(['CANCELLED', 'PAID']); // phiên PAID giữ nguyên
  });

  it('exposes only customer-safe fields: no bank account, raw payload, internal ids or order id', async () => {
    const { service } = make([att({ status: 'PAID', paidAt: new Date() })], [tx()]);
    const [item] = await service.listAttemptsForCustomer(order);
    expect(Object.keys(item).sort()).toEqual(['amount', 'createdAt', 'expiresAt', 'paidAt', 'status', 'transactionRef', 'transferCode']);
    expect(JSON.stringify(item)).not.toMatch(/0010000000355|secret|rawPayload|bankAccount|"id"|orderId/);
  });

  it('getStatus and the list use the same rule (consistency)', async () => {
    const attempt = att({ expiresAt: pastDate() });
    const { service } = make([attempt]);
    const fromList = (await service.listAttemptsForCustomer(order))[0].status;
    const orderRepo: any = { findOne: jest.fn(async () => ({ id: 'o1', userId: 'u1', status: 'pending', paymentStatus: 'unpaid' })) };
    const attemptRepo: any = { findOne: jest.fn(async () => attempt) };
    const statusService = new PaymentService({} as any, orderRepo, attemptRepo, {} as any, {} as any);
    expect((await statusService.getStatus('u1', 'o1')).data.status).toBe(fromList);
  });
});

describe('PaymentService.createQrAdmin', () => {
  it('creates a code for any customer’s order, recorded as created by that admin, amount from the DB total', async () => {
    const { service, attempts, manager } = setup({ orders: [order({ userId: 'someone-else' })] });
    const { data } = await service.createQrAdmin('adm-1', 'o1');
    expect(attempts()).toHaveLength(1);
    expect(attempts()[0]).toMatchObject({
      orderId: 'o1',
      status: 'PENDING',
      amount: 4_625_000,
      createdBy: 'adm-1',
      transferCode: data.transferContent,
    });
    expect(data).toMatchObject({ orderId: 'o1', amount: 4_625_000, status: 'PENDING', supersededTransferCodes: [] });
    expect(data.transferContent).toMatch(/^DH[A-HJ-NP-Z2-9]{8}$/);
    expect(data.qrUrl).toContain(`des=${data.transferContent}`);
    expect(manager.locks[0]).toContain('Order');
  });

  it('every pending code of the order expires immediately and is reported; older EXPIRED/CANCELLED codes are untouched', async () => {
    const pending = attempt({ id: 'a-pending', transferCode: 'DHPENDING1' });
    const expired = attempt({ id: 'a-old', transferCode: 'DHEXPIRED1', status: 'EXPIRED', expiresAt: pastDate() });
    const cancelled = attempt({ id: 'a-cx', transferCode: 'DHCANCEL11', status: 'CANCELLED' });
    const { service, attempts } = setup({ orders: [order()], attempts: [pending, expired, cancelled] });

    const { data } = await service.createQrAdmin('adm-1', 'o1');

    expect(data.supersededTransferCodes).toEqual(['DHPENDING1']);
    expect(pending.status).toBe('EXPIRED');
    expect(pending.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(expired.status).toBe('EXPIRED');
    expect(cancelled.status).toBe('CANCELLED');
    expect(attempts().filter((a) => a.status === 'PENDING')).toHaveLength(1); // đúng một mã còn hiệu lực
    expect(attempts().filter((a) => a.status === 'PENDING')[0].transferCode).toBe(data.transferContent);
  });

  it('asking again always issues yet another new code and expires the previous admin code', async () => {
    const { service, attempts } = setup({ orders: [order()] });
    const first = (await service.createQrAdmin('adm-1', 'o1')).data;
    const second = (await service.createQrAdmin('adm-1', 'o1')).data;
    expect(second.transferContent).not.toBe(first.transferContent);
    expect(second.supersededTransferCodes).toEqual([first.transferContent]);
    expect(
      attempts()
        .map((a) => a.status)
        .sort(),
    ).toEqual(['EXPIRED', 'PENDING']);
  });

  it('the customer then reuses the admin’s still-valid code instead of creating one (same value everywhere)', async () => {
    const { service, attempts } = setup({ orders: [order()] });
    const admin = (await service.createQrAdmin('adm-1', 'o1')).data;
    const customer = (await service.createQr('u1', { orderId: 'o1' })).data;
    expect(customer.transferContent).toBe(admin.transferContent);
    expect(attempts()).toHaveLength(1);
  });

  it.each([
    ['already paid', { paymentStatus: 'paid' }],
    ['refunded', { paymentStatus: 'refunded' }],
    ['cancelled', { status: 'cancelled' }],
  ])('refuses an order that is %s (1702) without touching its codes', async (_name, over) => {
    const pending = attempt();
    const { service, attempts } = setup({ orders: [order(over)], attempts: [pending] });
    await expect(service.createQrAdmin('adm-1', 'o1')).rejects.toMatchObject({ response: { errorCode: 1702 } });
    expect(pending.status).toBe('PENDING');
    expect(attempts()).toHaveLength(1);
  });

  it('unknown order → 404 / 1301; missing configuration → 503 / 1701 and nothing is touched', async () => {
    const h = setup({ orders: [order()], attempts: [attempt()] });
    await expect(h.service.createQrAdmin('adm-1', 'nope')).rejects.toMatchObject({ status: 404, response: { errorCode: 1301 } });

    const broken = setup({ orders: [order()], attempts: [attempt()] });
    (broken.service as any).paymentConfig.getQrConfig = () => {
      throw Object.assign(new Error('not configured'), { status: 503 });
    };
    await expect(broken.service.createQrAdmin('adm-1', 'o1')).rejects.toMatchObject({ status: 503 });
    expect(broken.attempts()[0].status).toBe('PENDING');
  });

  it('customer-created codes keep created_by null', async () => {
    const { service, attempts } = setup({ orders: [order()] });
    await service.createQr('u1', { orderId: 'o1' });
    expect(attempts()[0].createdBy).toBeNull();
  });
});
