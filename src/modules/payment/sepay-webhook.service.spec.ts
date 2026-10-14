import { createHmac } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Order } from '../order/order.entity';
import { createFakeManager, futureDate, pastDate } from './payment.test-utils';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentTransaction } from './payment-transaction.entity';
import { SepayWebhookService } from './sepay-webhook.service';

const SECRET = 'whsec';
const ACCOUNT = '0010000000355';
const CODE = 'DH8K4T72M9';
const config = { secret: SECRET, account: ACCOUNT, prefix: 'DH' };

const order = (over: Record<string, any> = {}) => ({
  id: 'o1',
  userId: 'u1',
  status: 'pending',
  paymentStatus: 'unpaid',
  paidAt: null,
  ...over,
});
const attempt = (over: Record<string, any> = {}) => ({
  id: 'a1',
  orderId: 'o1',
  transferCode: CODE,
  amount: 4_625_000,
  bankAccount: ACCOUNT,
  status: 'PENDING',
  expiresAt: futureDate(),
  paidAt: null,
  ...over,
});
const sepayBody = (over: Record<string, any> = {}) => ({
  id: 92704,
  gateway: 'Vietcombank',
  accountNumber: ACCOUNT,
  code: CODE,
  content: `${CODE} chuyen tien`,
  transferType: 'in',
  transferAmount: 4_625_000,
  ...over,
});

function setup(seed: Parameters<typeof createFakeManager>[0]) {
  const manager = createFakeManager(seed);
  const dataSource = { transaction: jest.fn(async (fn: any) => fn(manager)) };
  const paymentConfig = { getWebhookConfig: jest.fn(() => config) };
  const service = new SepayWebhookService(dataSource as any, paymentConfig as any);

  const call = (body: Record<string, any> | Buffer, opts: { secret?: string; timestamp?: string; signature?: string } = {}) => {
    const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const timestamp = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
    const signature =
      opts.signature ??
      `sha256=${createHmac('sha256', opts.secret ?? SECRET)
        .update(Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]))
        .digest('hex')}`;
    return service.handle({ rawBody, signature, timestamp });
  };
  const row = <T = any>(entity: any, index = 0) => manager.tables.get(entity)![index] as T;
  const txRows = () => manager.tables.get(PaymentTransaction)!;
  return { manager, dataSource, call, row, txRows, service };
}

describe('SepayWebhookService.handle', () => {
  beforeAll(() => Logger.overrideLogger(false));

  describe('signature', () => {
    it('rejects an invalid signature (401) without touching the database', async () => {
      const { call, dataSource, manager } = setup({ orders: [order()], attempts: [attempt()] });
      await expect(call(sepayBody(), { secret: 'wrong' })).rejects.toMatchObject({ status: 401 });
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(manager.tables.get(Order)![0].paymentStatus).toBe('unpaid');
    });

    it('rejects a body modified after signing', async () => {
      const { service, dataSource } = setup({ orders: [order()], attempts: [attempt()] });
      const signed = Buffer.from(JSON.stringify(sepayBody()));
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = `sha256=${createHmac('sha256', SECRET)
        .update(Buffer.concat([Buffer.from(`${timestamp}.`), signed]))
        .digest('hex')}`;
      const tampered = Buffer.from(JSON.stringify(sepayBody({ transferAmount: 1 })));
      await expect(service.handle({ rawBody: tampered, signature, timestamp })).rejects.toMatchObject({ status: 401 });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects a stale timestamp even when the signature is otherwise valid', async () => {
      const { call, dataSource } = setup({ orders: [order()], attempts: [attempt()] });
      const stale = String(Math.floor(Date.now() / 1000) - 3600);
      await expect(call(sepayBody(), { timestamp: stale })).rejects.toMatchObject({ status: 401 });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects a request with no raw body', async () => {
      const { service } = setup({});
      await expect(service.handle({ signature: 'sha256=x', timestamp: '1' })).rejects.toMatchObject({ status: 401 });
    });

    it('rejects a signed but malformed payload (400) so SePay does not treat it as processed', async () => {
      const { call } = setup({});
      await expect(call(Buffer.from('not json'))).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('matching', () => {
    it('marks the order paid, the attempt PAID and stores the transaction MATCHED', async () => {
      const { call, row, txRows, manager } = setup({ orders: [order()], attempts: [attempt()] });

      await expect(call(sepayBody())).resolves.toEqual({ success: true });

      expect(row<any>(PaymentAttempt)).toMatchObject({ status: 'PAID' });
      expect(row<any>(PaymentAttempt).paidAt).toBeInstanceOf(Date);
      expect(row<any>(Order)).toMatchObject({ paymentStatus: 'paid' });
      expect(row<any>(Order).paidAt).toBeInstanceOf(Date);
      expect(txRows()).toHaveLength(1);
      expect(txRows()[0]).toMatchObject({
        providerTransactionId: '92704',
        provider: 'sepay',
        amount: 4_625_000,
        verificationStatus: 'MATCHED',
        paymentAttemptId: 'a1',
      });
      // khoá order trước attempt để không deadlock với createQr
      expect(manager.locks).toEqual(['Order:{"id":"o1"}', 'PaymentAttempt:{"id":"a1"}']);
    });

    it('a paid order that was pending is auto-confirmed; an order that already moved on keeps its status', async () => {
      const pending = setup({ orders: [order()], attempts: [attempt()] });
      await pending.call(sepayBody());
      expect(pending.row<any>(Order)).toMatchObject({ paymentStatus: 'paid', status: 'confirmed' });

      const shipping = setup({ orders: [order({ status: 'shipping' })], attempts: [attempt()] });
      await shipping.call(sepayBody());
      expect(shipping.row<any>(Order)).toMatchObject({ paymentStatus: 'paid', status: 'shipping' });
    });

    it('money that is NOT confirmed (wrong amount / late) never changes the order status', async () => {
      const wrong = setup({ orders: [order()], attempts: [attempt()] });
      await wrong.call(sepayBody({ transferAmount: 1 }));
      expect(wrong.row<any>(Order)).toMatchObject({ paymentStatus: 'unpaid', status: 'pending' });
    });

    it('stores the raw payload but never the signature or secret', async () => {
      const { call, txRows } = setup({ orders: [order()], attempts: [attempt()] });
      await call(sepayBody());
      const stored = JSON.stringify(txRows()[0]);
      expect(stored).not.toContain(SECRET);
      expect(stored).not.toContain('sha256=');
      expect(txRows()[0].rawPayload).toEqual(sepayBody());
    });

    it('cancels other pending attempts of the same order when one is paid', async () => {
      const { call, row } = setup({
        orders: [order()],
        attempts: [attempt(), attempt({ id: 'a2', transferCode: 'DHOTHER222', status: 'PENDING' })],
      });
      await call(sepayBody());
      expect(row<any>(PaymentAttempt, 0).status).toBe('PAID');
      expect(row<any>(PaymentAttempt, 1).status).toBe('CANCELLED');
    });

    it('finds the code in the transfer content when SePay sends code = null', async () => {
      const { call, row } = setup({ orders: [order()], attempts: [attempt()] });
      await call(sepayBody({ code: null, content: `nguyen van a ${CODE.toLowerCase()}` }));
      expect(row<any>(Order).paymentStatus).toBe('paid');
    });

    describe('every issued transfer content stays attributable (even after it expired)', () => {
      const twoSessions = () =>
        setup({
          orders: [order()],
          attempts: [
            attempt({ id: 'old', transferCode: 'DHG29JR5A8', status: 'EXPIRED', expiresAt: pastDate(), createdAt: new Date('2026-01-01') }),
            attempt({ id: 'new', transferCode: 'DHS75TYVN3', createdAt: new Date('2026-02-01') }),
          ],
        });

      it('money sent with the OLD (expired) code is recorded against that exact session as LATE, order stays unpaid', async () => {
        const h = twoSessions();
        await h.call(sepayBody({ code: 'DHG29JR5A8', content: 'DHG29JR5A8' }));
        expect(h.txRows()[0]).toMatchObject({ verificationStatus: 'LATE', paymentAttemptId: 'old' });
        expect(h.row<any>(Order).paymentStatus).toBe('unpaid');
        expect(h.row<any>(PaymentAttempt, 1).status).toBe('PENDING'); // phiên mới không bị đụng tới
      });

      it('money sent with the NEW code is matched to the new session', async () => {
        const h = twoSessions();
        await h.call(sepayBody({ code: 'DHS75TYVN3', content: 'DHS75TYVN3' }));
        expect(h.txRows()[0]).toMatchObject({ verificationStatus: 'MATCHED', paymentAttemptId: 'new' });
        expect(h.row<any>(Order).paymentStatus).toBe('paid');
      });

      it('matches when the bank lower/upper-cases the content or SePay truncated `code`', async () => {
        const h = setup({ orders: [order()], attempts: [attempt({ transferCode: 'DHG29JR5A8' })] });
        await h.call(sepayBody({ code: 'DHG29J', content: 'nguyen a dhg29jr5a8 chuyen khoan' }));
        expect(h.row<any>(Order).paymentStatus).toBe('paid');
      });
    });

    it('tolerates spaces/dashes in the account number', async () => {
      const { call, row } = setup({ orders: [order()], attempts: [attempt()] });
      await call(sepayBody({ accountNumber: '0010 0000-00355' }));
      expect(row<any>(Order).paymentStatus).toBe('paid');
    });
  });

  describe('not confirmed, but recorded for reconciliation', () => {
    const expectUnpaid = (h: ReturnType<typeof setup>, status: string, attemptId: string | null = 'a1') => {
      expect(h.row<any>(Order).paymentStatus).toBe('unpaid');
      expect(h.txRows()).toHaveLength(1);
      expect(h.txRows()[0]).toMatchObject({ verificationStatus: status, paymentAttemptId: attemptId });
    };

    it('wrong amount → AMOUNT_MISMATCH', async () => {
      const h = setup({ orders: [order()], attempts: [attempt()] });
      await expect(h.call(sepayBody({ transferAmount: 4_624_999 }))).resolves.toEqual({ success: true });
      expectUnpaid(h, 'AMOUNT_MISMATCH');
      expect(h.row<any>(PaymentAttempt).status).toBe('PENDING');
    });

    it('wrong receiving account → ACCOUNT_MISMATCH, not linked to an attempt', async () => {
      const h = setup({ orders: [order()], attempts: [attempt()] });
      await h.call(sepayBody({ accountNumber: '9999999999' }));
      expectUnpaid(h, 'ACCOUNT_MISMATCH', null);
    });

    it('unknown code → UNMATCHED', async () => {
      const h = setup({ orders: [order()], attempts: [attempt()] });
      await h.call(sepayBody({ code: 'DHZZZZZZZZ', content: 'DHZZZZZZZZ' }));
      expectUnpaid(h, 'UNMATCHED', null);
    });

    it('no payment code at all → UNMATCHED', async () => {
      const h = setup({ orders: [order()], attempts: [attempt()] });
      await h.call(sepayBody({ code: null, content: 'chuyen tien mua hang' }));
      expectUnpaid(h, 'UNMATCHED', null);
    });

    it('money out → IGNORED', async () => {
      const h = setup({ orders: [order()], attempts: [attempt()] });
      await h.call(sepayBody({ transferType: 'out' }));
      expectUnpaid(h, 'IGNORED', null);
    });

    it('QR already expired (still PENDING in DB) → LATE, attempt becomes EXPIRED, order stays unpaid', async () => {
      const h = setup({ orders: [order()], attempts: [attempt({ expiresAt: pastDate() })] });
      await h.call(sepayBody());
      expectUnpaid(h, 'LATE');
      expect(h.row<any>(PaymentAttempt).status).toBe('EXPIRED');
    });

    it('attempt already EXPIRED → LATE', async () => {
      const h = setup({ orders: [order()], attempts: [attempt({ status: 'EXPIRED', expiresAt: pastDate() })] });
      await h.call(sepayBody());
      expectUnpaid(h, 'LATE');
    });

    it('cancelled order → NOT_PAYABLE', async () => {
      const h = setup({ orders: [order({ status: 'cancelled' })], attempts: [attempt()] });
      await h.call(sepayBody());
      expectUnpaid(h, 'NOT_PAYABLE');
      expect(h.row<any>(PaymentAttempt).status).toBe('PENDING');
    });

    it('cancelled attempt → NOT_PAYABLE', async () => {
      const h = setup({ orders: [order()], attempts: [attempt({ status: 'CANCELLED' })] });
      await h.call(sepayBody());
      expectUnpaid(h, 'NOT_PAYABLE');
    });

    it('a second payment for an already-paid attempt → DUPLICATE_PAYMENT, nothing changes', async () => {
      const paidAt = new Date('2026-01-01');
      const h = setup({
        orders: [order({ paymentStatus: 'paid', paidAt })],
        attempts: [attempt({ status: 'PAID', paidAt })],
        transactions: [{ id: 't0', providerTransactionId: '1', verificationStatus: 'MATCHED' }],
      });
      await h.call(sepayBody({ id: 2 }));
      expect(h.txRows()).toHaveLength(2);
      expect(h.txRows()[1]).toMatchObject({ verificationStatus: 'DUPLICATE_PAYMENT', providerTransactionId: '2' });
      expect(h.row<any>(Order).paidAt).toBe(paidAt);
    });

    it('payment to a different attempt of an already-paid order → DUPLICATE_PAYMENT', async () => {
      const h = setup({
        orders: [order({ paymentStatus: 'paid', paidAt: new Date() })],
        attempts: [attempt({ status: 'CANCELLED' })],
      });
      await h.call(sepayBody());
      expect(h.txRows()[0].verificationStatus).toBe('DUPLICATE_PAYMENT');
    });
  });

  describe('idempotency', () => {
    it('a replayed transaction id is acknowledged but changes nothing', async () => {
      const h = setup({ orders: [order()], attempts: [attempt()] });
      await h.call(sepayBody());
      const paidAt = h.row<any>(Order).paidAt;

      await expect(h.call(sepayBody())).resolves.toEqual({ success: true });

      expect(h.txRows()).toHaveLength(1);
      expect(h.row<any>(Order).paidAt).toBe(paidAt);
      expect(h.manager.update).toHaveBeenCalledTimes(3); // chỉ lần xử lý đầu (đơn paid, pending→confirmed, huỷ phiên pending khác)
    });

    it('treats a unique-violation from a concurrent identical webhook as already processed', async () => {
      const h = setup({ orders: [order()], attempts: [attempt()] });
      h.dataSource.transaction.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));
      await expect(h.call(sepayBody())).resolves.toEqual({ success: true });
    });

    it('rethrows unexpected database errors so SePay retries', async () => {
      const h = setup({ orders: [order()], attempts: [attempt()] });
      h.dataSource.transaction.mockRejectedValueOnce(new Error('connection lost'));
      await expect(h.call(sepayBody())).rejects.toThrow('connection lost');
    });
  });
});

describe('money arriving for a code that an admin replaced', () => {
  it('is recorded as LATE against that code and does not pay the order by itself (admin confirms by transferCode)', async () => {
    const replaced = attempt({ status: 'EXPIRED', expiresAt: pastDate(1000) });
    const { call, manager, row } = setup({ orders: [order()], attempts: [replaced, attempt({ id: 'a2', transferCode: 'DHNEWCODE1' })] });
    await call(sepayBody());
    expect(row(PaymentTransaction)).toMatchObject({ verificationStatus: 'LATE', paymentAttemptId: 'a1' });
    expect(manager.tables.get(Order)![0].paymentStatus).toBe('unpaid');
  });
});
