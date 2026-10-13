import { ValidationPipe } from '@nestjs/common';
import { Order } from '../order/order.entity';
import { ConfirmPaymentDto } from './dtos/confirm-payment.dto';
import { PaymentService } from './payment.service';
import { createFakeManager, futureDate, pastDate } from './payment.test-utils';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentTransaction } from './payment-transaction.entity';

const order = (over: Record<string, any> = {}) => ({
  id: 'o1',
  userId: 'u1',
  status: 'pending',
  paymentStatus: 'unpaid',
  paidAt: null,
  total: '185.00',
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

function setup(seed: Parameters<typeof createFakeManager>[0]) {
  const manager = createFakeManager(seed);
  const dataSource = { transaction: jest.fn(async (fn: any) => fn(manager)) };
  const service = new PaymentService(dataSource as any, {} as any, {} as any, {} as any, {} as any);
  const row = (entity: any, index = 0) => manager.tables.get(entity)![index];
  return { manager, service, row, rows: (entity: any) => manager.tables.get(entity)! };
}
const note = 'Doi chieu sao ke VCB, SePay loi webhook';

describe('PaymentService.confirmPaymentAdmin — with an existing transaction', () => {
  it.each([
    'UNMATCHED',
    'AMOUNT_MISMATCH',
    'LATE',
    'NOT_PAYABLE',
  ])('confirms a %s transaction: order paid, attempt PAID, evidence recorded', async (verificationStatus) => {
    const h = setup({
      orders: [order()],
      attempts: [attempt({ status: 'EXPIRED', expiresAt: pastDate() })],
      transactions: [tx({ verificationStatus })],
    });

    const { data } = await h.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 't1', note });

    expect(h.row(Order)).toMatchObject({ paymentStatus: 'paid' });
    expect(h.row(Order).paidAt).toBeInstanceOf(Date);
    expect(h.row(PaymentAttempt)).toMatchObject({ status: 'PAID' });
    expect(h.row(PaymentAttempt).paidAt).toBeInstanceOf(Date);
    expect(h.row(PaymentTransaction)).toMatchObject({
      verificationStatus: 'MANUALLY_CONFIRMED',
      confirmedBy: 'adm1',
      confirmNote: note,
      paymentAttemptId: 'a1',
    });
    expect(h.row(PaymentTransaction).confirmedAt).toBeInstanceOf(Date);
    expect(data).toMatchObject({ orderId: 'o1', paymentStatus: 'paid', attemptId: 'a1' });
    expect(h.rows(PaymentTransaction)).toHaveLength(1);
  });

  it('manual confirmation also moves a pending order to confirmed (and leaves later statuses alone)', async () => {
    const pending = setup({ orders: [order()], attempts: [attempt()], transactions: [tx()] });
    await pending.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 't1', note });
    expect(pending.row(Order)).toMatchObject({ paymentStatus: 'paid', status: 'confirmed' });

    const shipping = setup({ orders: [order({ status: 'shipping' })], attempts: [attempt()], transactions: [tx()] });
    await shipping.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 't1', note });
    expect(shipping.row(Order)).toMatchObject({ paymentStatus: 'paid', status: 'shipping' });
  });

  it('attaches an UNMATCHED transaction (no attempt yet) to the latest attempt of the order', async () => {
    const h = setup({
      orders: [order()],
      attempts: [
        attempt({ id: 'old', transferCode: 'DHOLD00000', status: 'EXPIRED', createdAt: new Date('2026-01-01') }),
        attempt({ id: 'new', transferCode: 'DHNEW00000', createdAt: new Date('2026-02-01') }),
      ],
      transactions: [tx({ verificationStatus: 'UNMATCHED', paymentAttemptId: null })],
    });
    await h.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 't1', note });
    expect(h.rows(PaymentAttempt).find((a) => a.id === 'new')).toMatchObject({ status: 'PAID' });
    expect(h.row(PaymentTransaction)).toMatchObject({ paymentAttemptId: 'new' });
  });

  it('cancels the other pending attempts of the order', async () => {
    const h = setup({
      orders: [order()],
      attempts: [
        attempt({ status: 'EXPIRED' }),
        attempt({ id: 'a2', transferCode: 'DHOTHER222', status: 'PENDING', createdAt: new Date('2026-03-01') }),
      ],
      transactions: [tx({ verificationStatus: 'LATE' })],
    });
    await h.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 't1', note });
    expect(h.row(PaymentAttempt, 0).status).toBe('PAID');
    expect(h.row(PaymentAttempt, 1).status).toBe('CANCELLED');
  });

  it('locks order → transaction → attempt (same order as the webhook, no deadlock)', async () => {
    const h = setup({ orders: [order()], attempts: [attempt()], transactions: [tx()] });
    await h.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 't1', note });
    expect(h.manager.locks.map((l) => l.split(':')[0])).toEqual(['Order', 'PaymentTransaction', 'PaymentAttempt']);
  });

  it.each([
    'MATCHED',
    'MANUALLY_CONFIRMED',
    'DUPLICATE_PAYMENT',
    'ACCOUNT_MISMATCH',
    'IGNORED',
  ])('refuses a %s transaction (1709) and changes nothing', async (verificationStatus) => {
    const h = setup({ orders: [order()], attempts: [attempt()], transactions: [tx({ verificationStatus })] });
    await expect(h.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 't1', note })).rejects.toMatchObject({
      response: { errorCode: 1709 },
    });
    expect(h.row(Order).paymentStatus).toBe('unpaid');
    expect(h.row(PaymentTransaction).verificationStatus).toBe(verificationStatus);
  });

  it('404 / 1708 for an unknown transaction', async () => {
    const h = setup({ orders: [order()], attempts: [attempt()] });
    await expect(h.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 'nope', note })).rejects.toMatchObject({
      status: 404,
      response: { errorCode: 1708 },
    });
  });

  it("refuses a transaction that belongs to another order's payment session (1709)", async () => {
    const h = setup({
      orders: [order(), order({ id: 'o2' })],
      attempts: [attempt(), attempt({ id: 'a9', orderId: 'o2', transferCode: 'DHOTHER999' })],
      transactions: [tx({ paymentAttemptId: 'a9' })],
    });
    await expect(h.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 't1', note })).rejects.toMatchObject({
      response: { errorCode: 1709 },
    });
    expect(h.rows(Order).every((o) => o.paymentStatus === 'unpaid')).toBe(true);
  });

  it('amount differs from the session → 1710 unless acceptAmountMismatch = true', async () => {
    const make = () =>
      setup({ orders: [order()], attempts: [attempt()], transactions: [tx({ verificationStatus: 'AMOUNT_MISMATCH', amount: 4_000_000 })] });

    const refused = make();
    await expect(refused.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 't1', note })).rejects.toMatchObject({
      response: { errorCode: 1710 },
    });
    expect(refused.row(Order).paymentStatus).toBe('unpaid');

    const accepted = make();
    await accepted.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 't1', note, acceptAmountMismatch: true });
    expect(accepted.row(Order).paymentStatus).toBe('paid');
    expect(accepted.row(PaymentTransaction).amount).toBe(4_000_000); // số tiền thực nhận giữ nguyên
  });
});

describe('PaymentService.confirmPaymentAdmin — recording a new transaction (webhook never arrived)', () => {
  const base = { reference: '92704', amount: 4_625_000, note };

  it('creates a sepay transaction identical in key to what the webhook would have stored, marked MANUALLY_CONFIRMED', async () => {
    const h = setup({ orders: [order()], attempts: [attempt({ status: 'EXPIRED', expiresAt: pastDate() })] });

    await h.service.confirmPaymentAdmin('adm1', 'o1', base);

    expect(h.row(Order).paymentStatus).toBe('paid');
    expect(h.row(PaymentAttempt).status).toBe('PAID');
    expect(h.rows(PaymentTransaction)).toHaveLength(1);
    expect(h.row(PaymentTransaction)).toMatchObject({
      provider: 'sepay',
      providerTransactionId: '92704',
      amount: 4_625_000,
      verificationStatus: 'MANUALLY_CONFIRMED',
      confirmedBy: 'adm1',
      paymentAttemptId: 'a1',
    });
    // không có sao kê → nội dung chuyển khoản là mã đã cấp cho khách; lý do nằm ở confirmNote, không lẫn vào nội dung
    expect(h.row(PaymentTransaction).transferContent).toBe('DH8K4T72M9');
    expect(h.row(PaymentTransaction).confirmNote).toBe(note);
    expect(h.row(PaymentTransaction).rawPayload).toMatchObject({ source: 'manual-confirmation', reference: '92704' });
  });

  it('stores the reference exactly as entered (no prefix), the source is in `provider`', async () => {
    const h = setup({ orders: [order()], attempts: [attempt()] });
    await h.service.confirmPaymentAdmin('adm1', 'o1', { ...base, reference: 'FT24012345', provider: 'manual' });
    expect(h.row(PaymentTransaction)).toMatchObject({ provider: 'manual', providerTransactionId: 'FT24012345' });
  });

  it('stores the transfer content typed from the statement when given', async () => {
    const h = setup({ orders: [order()], attempts: [attempt()] });
    await h.service.confirmPaymentAdmin('adm1', 'o1', { ...base, transferContent: 'NGUYEN VAN A DH8K4T72M9 chuyen khoan' });
    expect(h.row(PaymentTransaction).transferContent).toBe('NGUYEN VAN A DH8K4T72M9 chuyen khoan');
  });

  it('the same reference under a different provider is a different transaction (uniqueness is per provider)', async () => {
    const h = setup({
      orders: [order()],
      attempts: [attempt()],
      transactions: [tx({ providerTransactionId: '92704', provider: 'sepay' })],
    });
    await h.service.confirmPaymentAdmin('adm1', 'o1', { ...base, reference: '92704', provider: 'manual' });
    expect(h.rows(PaymentTransaction)).toHaveLength(2);
    expect(h.row(PaymentTransaction, 1)).toMatchObject({ provider: 'manual', providerTransactionId: '92704' });
  });

  it('refuses a reference that is already recorded for the same provider (1709) — use its transactionId instead', async () => {
    const h = setup({
      orders: [order()],
      attempts: [attempt()],
      transactions: [tx({ providerTransactionId: '92704', provider: 'sepay' })],
    });
    await expect(h.service.confirmPaymentAdmin('adm1', 'o1', base)).rejects.toMatchObject({ response: { errorCode: 1709 } });
    expect(h.row(Order).paymentStatus).toBe('unpaid');
    expect(h.rows(PaymentTransaction)).toHaveLength(1);
  });

  it('wrong amount → 1710 and nothing is recorded; accepted with the flag', async () => {
    const refused = setup({ orders: [order()], attempts: [attempt()] });
    await expect(refused.service.confirmPaymentAdmin('adm1', 'o1', { ...base, amount: 1 })).rejects.toMatchObject({
      response: { errorCode: 1710 },
    });
    expect(refused.rows(PaymentTransaction)).toHaveLength(0);

    const accepted = setup({ orders: [order()], attempts: [attempt()] });
    await accepted.service.confirmPaymentAdmin('adm1', 'o1', { ...base, amount: 4_000_000, acceptAmountMismatch: true });
    expect(accepted.row(PaymentTransaction).amount).toBe(4_000_000);
  });

  it('an order with no payment session cannot be confirmed (404 / 1703)', async () => {
    const h = setup({ orders: [order()] });
    await expect(h.service.confirmPaymentAdmin('adm1', 'o1', base)).rejects.toMatchObject({ status: 404, response: { errorCode: 1703 } });
    expect(h.rows(PaymentTransaction)).toHaveLength(0);
  });
});

describe('PaymentService.confirmPaymentAdmin — guards', () => {
  it.each([
    ['neither transactionId nor reference+amount', {}],
    ['both transactionId and reference+amount', { transactionId: 't1', reference: 'x', amount: 1 }],
    ['transactionId with only amount', { transactionId: 't1', amount: 1 }],
    ['reference without amount', { reference: 'x' }],
    ['amount without reference', { amount: 1 }],
  ])('rejects %s with 400 / 1707', async (_n, body) => {
    const h = setup({ orders: [order()], attempts: [attempt()], transactions: [tx()] });
    await expect(h.service.confirmPaymentAdmin('adm1', 'o1', { ...body, note } as any)).rejects.toMatchObject({
      status: 400,
      response: { errorCode: 1707 },
    });
    expect(h.manager.findOne).not.toHaveBeenCalled();
  });

  it('refuses an already-paid order (cannot pay twice) and a cancelled order, both 1702', async () => {
    const paid = setup({
      orders: [order({ paymentStatus: 'paid', paidAt: new Date() })],
      attempts: [attempt({ status: 'PAID', paidAt: new Date() })],
      transactions: [tx()],
    });
    await expect(paid.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 't1', note })).rejects.toMatchObject({
      response: { errorCode: 1702 },
    });
    expect(paid.row(PaymentTransaction).verificationStatus).toBe('LATE');

    const cancelled = setup({ orders: [order({ status: 'cancelled' })], attempts: [attempt()], transactions: [tx()] });
    await expect(cancelled.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 't1', note })).rejects.toMatchObject({
      response: { errorCode: 1702 },
    });
  });

  it('a double submit confirms once: the second call is refused', async () => {
    const h = setup({ orders: [order()], attempts: [attempt()], transactions: [tx()] });
    await h.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 't1', note });
    await expect(h.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 't1', note })).rejects.toMatchObject({
      response: { errorCode: 1702 },
    });
  });

  it('404 / 1301 for an unknown order', async () => {
    const h = setup({});
    await expect(h.service.confirmPaymentAdmin('adm1', 'nope', { transactionId: 't1', note })).rejects.toMatchObject({
      status: 404,
      response: { errorCode: 1301 },
    });
  });

  it('after a manual confirmation, a late webhook replay of the same SePay id is an idempotent no-op', async () => {
    const h = setup({ orders: [order()], attempts: [attempt()] });
    await h.service.confirmPaymentAdmin('adm1', 'o1', { reference: '92704', amount: 4_625_000, note });
    const existing = await h.manager.findOne(PaymentTransaction, { where: { providerTransactionId: '92704' } });
    expect(existing).toMatchObject({ verificationStatus: 'MANUALLY_CONFIRMED' }); // webhook.process() returns DUPLICATE when this row exists
  });
});

describe('PaymentService.getOrderPaymentsAdmin', () => {
  it('returns the order summary, attempts (newest first) and their transactions', async () => {
    const attempts = [attempt({ id: 'a2', createdAt: new Date('2026-02-01') }), attempt({ id: 'a1', createdAt: new Date('2026-01-01') })];
    const transactions = [tx({ id: 't1', paymentAttemptId: 'a1' })];
    const orderRepo: any = {
      findOne: jest.fn(async () =>
        order({ shippingAddress: { fullName: 'Nguyen A', phone: '09' }, subtotal: '185.00', shippingFee: '0.00' }),
      ),
    };
    const attemptRepo: any = { find: jest.fn(async () => attempts) };
    const transactionRepo: any = { find: jest.fn(async () => transactions) };
    const service = new PaymentService({} as any, orderRepo, attemptRepo, transactionRepo, {} as any);

    const { data } = await service.getOrderPaymentsAdmin('o1');

    expect(data.order).toMatchObject({ id: 'o1', paymentStatus: 'unpaid', customer: { fullName: 'Nguyen A', phone: '09' } });
    expect(attemptRepo.find).toHaveBeenCalledWith({ where: { orderId: 'o1' }, order: { createdAt: 'DESC' } });
    expect(data.attempts.map((a) => a.id)).toEqual(['a2', 'a1']);
    expect(data.transactions).toBe(transactions);
  });

  it('works for a pickup order whose snapshot has no address, and for an order with no attempts', async () => {
    const orderRepo: any = { findOne: jest.fn(async () => order({ shippingAddress: {} })) };
    const transactionRepo: any = { find: jest.fn() };
    const service = new PaymentService({} as any, orderRepo, { find: jest.fn(async () => []) } as any, transactionRepo, {} as any);
    const { data } = await service.getOrderPaymentsAdmin('o1');
    expect(data.order.customer).toEqual({ fullName: null, phone: null });
    expect(data.transactions).toEqual([]);
    expect(transactionRepo.find).not.toHaveBeenCalled();
  });

  it('404 / 1301 for an unknown order', async () => {
    const service = new PaymentService({} as any, { findOne: jest.fn(async () => null) } as any, {} as any, {} as any, {} as any);
    await expect(service.getOrderPaymentsAdmin('nope')).rejects.toMatchObject({ status: 404, response: { errorCode: 1301 } });
  });
});

describe('ConfirmPaymentDto', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const run = (body: unknown) => pipe.transform(body, { type: 'body', metatype: ConfirmPaymentDto });

  it('accepts both input styles and trims text', async () => {
    await expect(run({ transactionId: 't1', note: '  ok ' })).resolves.toMatchObject({ transactionId: 't1', note: 'ok' });
    await expect(
      run({ reference: ' 92704 ', amount: 4625000, provider: 'manual', acceptAmountMismatch: true, note: 'ok' }),
    ).resolves.toMatchObject({ reference: '92704', provider: 'manual' });
  });

  it.each([
    ['missing note', { transactionId: 't1' }],
    ['blank note', { transactionId: 't1', note: '   ' }],
    ['note > 500', { transactionId: 't1', note: 'x'.repeat(501) }],
    ['fractional amount', { reference: 'r', amount: 10.5, note: 'n' }],
    ['zero amount', { reference: 'r', amount: 0, note: 'n' }],
    ['string amount', { reference: 'r', amount: '10', note: 'n' }],
    ['unknown provider', { reference: 'r', amount: 1, provider: 'momo', note: 'n' }],
    ['non-boolean acceptAmountMismatch', { transactionId: 't1', acceptAmountMismatch: 'yes', note: 'n' }],
    ['reference > 64', { reference: 'x'.repeat(65), amount: 1, note: 'n' }],
    ['transferContent > 500', { reference: 'r', amount: 1, transferContent: 'x'.repeat(501), note: 'n' }],
    ['unknown field', { transactionId: 't1', note: 'n', orderId: 'o1' }],
  ])('rejects %s with 400', async (_n, body) => {
    await expect(run(body)).rejects.toMatchObject({ status: 400 });
  });
});

describe('PaymentService.confirmPaymentAdmin — by the transfer content the customer used', () => {
  // Đơn có hai phiên: DHG29JR5A8 (cũ, đã hết hạn — khách chuyển tiền theo mã này) và DHS75TYVN3 (mới nhất, đang chờ)
  const twoSessions = (extra: Parameters<typeof createFakeManager>[0] = {}) =>
    setup({
      orders: [order(), order({ id: 'o2' })],
      attempts: [
        attempt({ id: 'old', transferCode: 'DHG29JR5A8', status: 'EXPIRED', expiresAt: pastDate(), createdAt: new Date('2026-01-01') }),
        attempt({ id: 'new', transferCode: 'DHS75TYVN3', createdAt: new Date('2026-02-01') }),
        attempt({ id: 'other', orderId: 'o2', transferCode: 'DHZZZZ2222' }),
      ],
      ...extra,
    });

  it('marks exactly the session with that code as PAID (not the newest) and cancels the other pending one', async () => {
    const h = twoSessions();
    await h.service.confirmPaymentAdmin('adm1', 'o1', { transferCode: 'DHG29JR5A8', amount: 4_625_000, note });
    expect(h.rows(PaymentAttempt).find((a) => a.id === 'old')).toMatchObject({ status: 'PAID' });
    expect(h.rows(PaymentAttempt).find((a) => a.id === 'new')).toMatchObject({ status: 'CANCELLED' });
    expect(h.row(Order)).toMatchObject({ paymentStatus: 'paid' });
    expect(h.row(PaymentTransaction)).toMatchObject({ paymentAttemptId: 'old' });
  });

  it('without a bank reference the recorded transaction id is the transfer content itself (provider manual)', async () => {
    const h = twoSessions();
    await h.service.confirmPaymentAdmin('adm1', 'o1', { transferCode: 'DHG29JR5A8', amount: 4_625_000, note });
    expect(h.row(PaymentTransaction)).toMatchObject({
      provider: 'manual',
      providerTransactionId: 'DHG29JR5A8',
      transferContent: 'DHG29JR5A8',
      verificationStatus: 'MANUALLY_CONFIRMED',
      confirmedBy: 'adm1',
    });
  });

  it('with a bank reference both are kept: the reference identifies the bank transaction, the code picks the session', async () => {
    const h = twoSessions();
    await h.service.confirmPaymentAdmin('adm1', 'o1', { transferCode: 'dhg29jr5a8', reference: '92704', amount: 4_625_000, note });
    expect(h.row(PaymentTransaction)).toMatchObject({ provider: 'sepay', providerTransactionId: '92704', paymentAttemptId: 'old' });
  });

  it('a code that is not a session of this order is refused (404 / 1703), even if it exists on another order', async () => {
    const h = twoSessions();
    await expect(
      h.service.confirmPaymentAdmin('adm1', 'o1', { transferCode: 'DHZZZZ2222', amount: 4_625_000, note }),
    ).rejects.toMatchObject({
      status: 404,
      response: { errorCode: 1703 },
    });
    await expect(
      h.service.confirmPaymentAdmin('adm1', 'o1', { transferCode: 'DHNOPE0000', amount: 4_625_000, note }),
    ).rejects.toMatchObject({
      response: { errorCode: 1703 },
    });
    expect(h.row(Order).paymentStatus).toBe('unpaid');
    expect(h.rows(PaymentTransaction)).toHaveLength(0);
  });

  it('the amount is checked against the chosen session (1710 unless acceptAmountMismatch)', async () => {
    const h = twoSessions();
    await expect(h.service.confirmPaymentAdmin('adm1', 'o1', { transferCode: 'DHG29JR5A8', amount: 13_000, note })).rejects.toMatchObject({
      response: { errorCode: 1710 },
    });
  });

  it('confirming the same code twice is refused (1702 once paid)', async () => {
    const h = twoSessions();
    await h.service.confirmPaymentAdmin('adm1', 'o1', { transferCode: 'DHG29JR5A8', amount: 4_625_000, note });
    await expect(
      h.service.confirmPaymentAdmin('adm1', 'o1', { transferCode: 'DHG29JR5A8', amount: 4_625_000, note }),
    ).rejects.toMatchObject({
      response: { errorCode: 1702 },
    });
  });

  it('an existing transaction plus a transferCode must agree: a different code is refused (1709)', async () => {
    const h = twoSessions({ transactions: [tx({ paymentAttemptId: 'old', verificationStatus: 'LATE' })] });
    await expect(
      h.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 't1', transferCode: 'DHS75TYVN3', note }),
    ).rejects.toMatchObject({
      response: { errorCode: 1709 },
    });
    await h.service.confirmPaymentAdmin('adm1', 'o1', { transactionId: 't1', transferCode: 'DHG29JR5A8', note });
    expect(h.rows(PaymentAttempt).find((a) => a.id === 'old')).toMatchObject({ status: 'PAID' });
  });

  it('a manual provider reference alone (no transferCode) is still allowed', async () => {
    const h = twoSessions();
    await h.service.confirmPaymentAdmin('adm1', 'o1', { reference: 'FT24012345', provider: 'manual', amount: 4_625_000, note });
    expect(h.row(PaymentTransaction)).toMatchObject({ provider: 'manual', providerTransactionId: 'FT24012345', paymentAttemptId: 'new' });
  });

  it.each([
    ['sepay provider with no reference', { transferCode: 'DHG29JR5A8', amount: 1, provider: 'sepay' }],
    ['transferCode without amount', { transferCode: 'DHG29JR5A8' }],
    ['transactionId with a reference', { transactionId: 't1', reference: 'x' }],
  ])('rejects %s with 400 / 1707', async (_n, body) => {
    const h = twoSessions({ transactions: [tx()] });
    await expect(h.service.confirmPaymentAdmin('adm1', 'o1', { ...body, note } as any)).rejects.toMatchObject({
      response: { errorCode: 1707 },
    });
  });

  it('ConfirmPaymentDto upper-cases and trims transferCode, rejects an over-long one', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const run = (body: unknown) => pipe.transform(body, { type: 'body', metatype: ConfirmPaymentDto });
    await expect(run({ transferCode: '  dhg29jr5a8 ', amount: 1, note: 'n' })).resolves.toMatchObject({ transferCode: 'DHG29JR5A8' });
    await expect(run({ transferCode: 'X'.repeat(33), amount: 1, note: 'n' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('PaymentService.getOrderPaymentsAdmin — effective status', () => {
  it('shows an overdue PENDING session as EXPIRED and keeps every code', async () => {
    const attempts = [
      { id: 'new', transferCode: 'DHS75TYVN3', status: 'PENDING', expiresAt: futureDate(), createdAt: new Date('2026-02-01') },
      { id: 'old', transferCode: 'DHG29JR5A8', status: 'PENDING', expiresAt: pastDate(), createdAt: new Date('2026-01-01') },
    ];
    const service = new PaymentService(
      {} as any,
      { findOne: jest.fn(async () => order({ shippingAddress: {} })) } as any,
      { find: jest.fn(async () => attempts) } as any,
      { find: jest.fn(async () => []) } as any,
      {} as any,
    );
    const { data } = await service.getOrderPaymentsAdmin('o1');
    expect(data.attempts.map((a) => [a.transferCode, a.status])).toEqual([
      ['DHS75TYVN3', 'PENDING'],
      ['DHG29JR5A8', 'EXPIRED'],
    ]);
  });
});
