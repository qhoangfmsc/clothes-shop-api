import { ValidationPipe } from '@nestjs/common';
import { Order } from '../order/order.entity';
import { ReturnRequest } from '../return/return-request.entity';
import { ReturnRequestItem } from '../return/return-request-item.entity';
import { CompleteRefundDto } from './dtos/complete-refund.dto';
import { CreateRefundDto } from './dtos/create-refund.dto';
import { RejectRefundDto } from './dtos/reject-refund.dto';
import { PaymentService } from './payment.service';
import { createFakeManager } from './payment.test-utils';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentTransaction } from './payment-transaction.entity';
import { Refund } from './refund.entity';
import { prorateRefundAmount, RefundService } from './refund.service';

const AMOUNT = 4_625_000;
const ORDER_REF = { id: 'o1', exchangeRate: 25_000 };
const order = (over: Record<string, any> = {}) => ({
  id: 'o1',
  userId: 'u1',
  status: 'cancelled',
  paymentStatus: 'paid',
  paidAt: new Date('2026-01-01'),
  total: AMOUNT,
  exchangeRate: 25_000,
  shippingAddress: { fullName: 'Nguyen Van A', phone: '0900000000' },
  ...over,
});
const attempt = (over: Record<string, any> = {}) => ({
  id: 'a1',
  orderId: 'o1',
  transferCode: 'DH8K4T72M9',
  amount: AMOUNT,
  bankAccount: '0010000000355',
  status: 'PAID',
  paidAt: new Date('2026-01-01'),
  ...over,
});
const tx = (over: Record<string, any> = {}) => ({
  id: 't1',
  paymentAttemptId: 'a1',
  providerTransactionId: '92704',
  provider: 'sepay',
  amount: AMOUNT,
  transferContent: 'CK DH8K4T72M9',
  verificationStatus: 'MATCHED',
  ...over,
});
const refund = (over: Record<string, any> = {}) => ({
  id: 'r1',
  orderId: 'o1',
  paymentAttemptId: 'a1',
  amount: AMOUNT,
  status: 'REQUESTED',
  reason: 'ADMIN_CANCELLED',
  returnRequestId: null,
  requestedBy: 'u1',
  processedBy: null,
  processedAt: null,
  bankReference: null,
  note: null,
  createdAt: new Date('2026-01-02'),
  ...over,
});

function setup(seed: Parameters<typeof createFakeManager>[0]) {
  const manager = createFakeManager({ orders: [order()], attempts: [attempt()], transactions: [tx()], ...seed });
  const dataSource: any = { transaction: jest.fn(async (fn: any) => fn(manager)) };
  const rows = (entity: any) => manager.tables.get(entity)!;
  // Query builder giả: getOne trả refund kèm đơn/phiên; getManyAndCount trả danh sách đã nạp sẵn
  const calls: { andWhere: [string, any][]; orderBy?: [string, string]; skip?: number; take?: number } = { andWhere: [] };
  let lastId: string | undefined;
  const joined = (r: any) => ({
    ...r,
    order: rows(Order).find((o) => o.id === r.orderId),
    paymentAttempt: rows(PaymentAttempt).find((a) => a.id === r.paymentAttemptId),
  });
  const qb: any = {
    innerJoin: () => qb,
    addSelect: () => qb,
    where: (_sql: string, params: any) => {
      lastId = params.refundId;
      return qb;
    },
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
    getOne: async () => {
      const found = rows(Refund).find((r) => r.id === lastId);
      return found ? joined(found) : null;
    },
    getManyAndCount: async () => [rows(Refund).map(joined), rows(Refund).length],
  };
  const refundRepo: any = {
    findOne: jest.fn(async ({ where }: any) => rows(Refund).find((r) => r.id === where.id) ?? null),
    find: (opts: any) => manager.find(Refund, opts),
    createQueryBuilder: () => qb,
  };
  const transactionRepo: any = { find: (opts: any) => manager.find(PaymentTransaction, opts) };
  const service = new RefundService(dataSource, refundRepo, transactionRepo);
  return { manager, service, rows, calls, dataSource };
}

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const body = (metatype: any, value: any) => pipe.transform(value, { type: 'body', metatype });

describe('RefundService.completeAdmin', () => {
  it('records the bank reference, completes the refund and marks the order refunded (order locked before the refund)', async () => {
    const h = setup({ refunds: [refund()] });
    const { data } = await h.service.completeAdmin('admin-1', 'r1', { reference: 'FT26287123456', note: 'Chuyển lại tài khoản nguồn' });

    expect(h.rows(Refund)[0]).toMatchObject({
      status: 'COMPLETED',
      processedBy: 'admin-1',
      bankReference: 'FT26287123456',
      note: 'Chuyển lại tài khoản nguồn',
    });
    expect(h.rows(Refund)[0].processedAt).toBeInstanceOf(Date);
    expect(h.rows(Order)[0].paymentStatus).toBe('refunded');
    expect(h.rows(Order)[0].paidAt).toEqual(new Date('2026-01-01')); // giữ thời điểm đã trả
    expect(h.manager.locks.map((l) => l.split(':')[0])).toEqual(['Order', 'Refund']);

    // Admin thấy đúng khoản tiền đã nhận để hoàn về đúng nguồn
    expect(data).toMatchObject({
      id: 'r1',
      status: 'COMPLETED',
      amountVnd: AMOUNT,
      amountUsd: 185,
      bankReference: 'FT26287123456',
      order: { id: 'o1', paymentStatus: 'refunded', customer: { fullName: 'Nguyen Van A', phone: '0900000000' } },
      payment: {
        transferCode: 'DH8K4T72M9',
        paidAmountVnd: AMOUNT,
        paidAmountUsd: 185,
        provider: 'sepay',
        transactionRef: '92704',
        transferContent: 'CK DH8K4T72M9',
      },
    });
  });

  it('unknown refund → 1711 (404)', async () => {
    const h = setup({});
    await expect(h.service.completeAdmin('admin-1', 'nope', { reference: 'X', note: 'n' })).rejects.toMatchObject({
      status: 404,
      response: { errorCode: 1711 },
    });
  });

  it.each(['COMPLETED', 'REJECTED'])('a %s refund cannot be completed again (1713) and nothing changes', async (status) => {
    const h = setup({
      refunds: [refund({ status, processedAt: new Date(), processedBy: 'a', bankReference: status === 'COMPLETED' ? 'FT1' : null })],
    });
    await expect(h.service.completeAdmin('admin-1', 'r1', { reference: 'FT2', note: 'n' })).rejects.toMatchObject({
      response: { errorCode: 1713 },
    });
    expect(h.rows(Refund)[0].bankReference).toBe(status === 'COMPLETED' ? 'FT1' : null);
    expect(h.rows(Order)[0].paymentStatus).toBe('paid');
  });

  it('a bank reference already used by another refund is refused (1714)', async () => {
    const h = setup({
      orders: [order(), order({ id: 'o2' })],
      attempts: [attempt(), attempt({ id: 'a2', orderId: 'o2', transferCode: 'DHOTHER000' })],
      refunds: [
        refund(),
        refund({
          id: 'r2',
          orderId: 'o2',
          paymentAttemptId: 'a2',
          status: 'COMPLETED',
          processedAt: new Date(),
          processedBy: 'a',
          bankReference: 'FT-SAME',
        }),
      ],
    });
    await expect(h.service.completeAdmin('admin-1', 'r1', { reference: 'FT-SAME', note: 'n' })).rejects.toMatchObject({
      response: { errorCode: 1714 },
    });
    expect(h.rows(Refund)[0].status).toBe('REQUESTED');
  });

  it('a concurrent duplicate reference rejected by the database unique index is reported as 1714', async () => {
    const h = setup({ refunds: [refund()] });
    h.manager.save.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));
    await expect(h.service.completeAdmin('admin-1', 'r1', { reference: 'FT-RACE', note: 'n' })).rejects.toMatchObject({
      response: { errorCode: 1714 },
    });
  });

  it('never refunds more than the customer paid (1712), even if a second request exists', async () => {
    const h = setup({
      refunds: [
        refund({ id: 'r0', status: 'COMPLETED', processedAt: new Date(), processedBy: 'a', bankReference: 'FT0' }),
        refund({ id: 'r1', createdAt: new Date('2026-01-03') }),
      ],
    });
    await expect(h.service.completeAdmin('admin-1', 'r1', { reference: 'FT1', note: 'n' })).rejects.toMatchObject({
      response: { errorCode: 1712 },
    });
    expect(h.rows(Refund)[1].status).toBe('REQUESTED');
    expect(h.rows(Order)[0].paymentStatus).toBe('paid');
  });

  it('partial refunds keep the order paid until the total refunded equals what was paid', async () => {
    const h = setup({
      refunds: [
        refund({ id: 'r0', amount: 1_000_000, status: 'COMPLETED', processedAt: new Date(), processedBy: 'a', bankReference: 'FT0' }),
        refund({ id: 'r1', amount: 600_000 }),
      ],
    });
    await h.service.completeAdmin('admin-1', 'r1', { reference: 'FT1', note: 'n' });
    expect(h.rows(Order)[0].paymentStatus).toBe('paid');

    h.rows(Refund).push(refund({ id: 'r2', amount: AMOUNT - 1_600_000, createdAt: new Date('2026-01-04') }));
    await h.service.completeAdmin('admin-1', 'r2', { reference: 'FT2', note: 'n' });
    expect(h.rows(Order)[0].paymentStatus).toBe('refunded');
  });
});

describe('RefundService.rejectAdmin', () => {
  it('rejects with a reason, leaves the order paid, and a new request can be created afterwards', async () => {
    const h = setup({ refunds: [refund()] });
    const { data } = await h.service.rejectAdmin('admin-1', 'r1', { note: 'Khách nhận hàng tại cửa hàng' });
    expect(data).toMatchObject({ status: 'REJECTED', note: 'Khách nhận hàng tại cửa hàng', processedBy: 'admin-1' });
    expect(h.rows(Refund)[0].processedAt).toBeInstanceOf(Date);
    expect(h.rows(Order)[0].paymentStatus).toBe('paid');

    const created = await h.service.createAdmin('admin-1', { orderId: 'o1' });
    expect(created.data).toMatchObject({
      status: 'REQUESTED',
      reason: 'ADMIN_CANCELLED',
      amountVnd: AMOUNT,
      amountUsd: 185,
      requestedBy: 'admin-1',
    });
    expect(h.rows(Refund)).toHaveLength(2);
  });

  it('cannot reject a refund that is already processed (1713) or unknown (1711)', async () => {
    const h = setup({ refunds: [refund({ status: 'COMPLETED', processedAt: new Date(), processedBy: 'a', bankReference: 'FT1' })] });
    await expect(h.service.rejectAdmin('admin-1', 'r1', { note: 'n' })).rejects.toMatchObject({ response: { errorCode: 1713 } });
    await expect(h.service.rejectAdmin('admin-1', 'nope', { note: 'n' })).rejects.toMatchObject({
      status: 404,
      response: { errorCode: 1711 },
    });
  });
});

describe('RefundService.createAdmin', () => {
  it('creates a request for a cancelled paid order that has none', async () => {
    const h = setup({});
    const { data } = await h.service.createAdmin('admin-1', { orderId: 'o1' });
    expect(data).toMatchObject({ orderId: 'o1', status: 'REQUESTED', amountVnd: AMOUNT, amountUsd: 185, reason: 'ADMIN_CANCELLED' });
    expect(data).not.toHaveProperty('amount');
    expect(data.order).toMatchObject({ totalVnd: AMOUNT, totalUsd: 185, exchangeRate: 25_000 });
    expect(h.rows(Refund)).toHaveLength(1);
  });

  it.each([
    ['not cancelled', { status: 'confirmed' }],
    ['unpaid', { paymentStatus: 'unpaid', paidAt: null }],
    ['already refunded', { paymentStatus: 'refunded' }],
  ])('refuses an order that is %s (1712)', async (_name, over) => {
    const h = setup({ orders: [order(over)] });
    await expect(h.service.createAdmin('admin-1', { orderId: 'o1' })).rejects.toMatchObject({ response: { errorCode: 1712 } });
    expect(h.rows(Refund)).toHaveLength(0);
  });

  it('refuses a second request while one is waiting (1712)', async () => {
    const h = setup({ refunds: [refund()] });
    await expect(h.service.createAdmin('admin-1', { orderId: 'o1' })).rejects.toMatchObject({ response: { errorCode: 1712 } });
    expect(h.rows(Refund)).toHaveLength(1);
  });

  it('unknown order → 1301 (404)', async () => {
    const h = setup({});
    await expect(h.service.createAdmin('admin-1', { orderId: 'nope' })).rejects.toMatchObject({
      status: 404,
      response: { errorCode: 1301 },
    });
  });
});

describe('RefundService.listForCustomer / findAdmin', () => {
  it('customer sees only safe fields, newest first, bank reference only once completed', async () => {
    const h = setup({
      refunds: [
        refund({
          id: 'old',
          status: 'REJECTED',
          processedAt: new Date(),
          processedBy: 'secret-admin',
          note: 'internal note',
          createdAt: new Date('2026-01-01'),
        }),
        refund({ id: 'new', createdAt: new Date('2026-02-01') }),
      ],
    });
    const list = await h.service.listForCustomer(ORDER_REF);
    expect(list.map((r) => r.status)).toEqual(['REQUESTED', 'REJECTED']);
    expect(Object.keys(list[0]).sort()).toEqual([
      'amountUsd',
      'amountVnd',
      'bankReference',
      'createdAt',
      'processedAt',
      'reason',
      'returnId',
      'status',
    ]);
    expect(JSON.stringify(list)).not.toContain('internal note');
    expect(JSON.stringify(list)).not.toContain('secret-admin');
    expect(await h.service.listForCustomer({ id: 'other-order', exchangeRate: 25_000 })).toEqual([]);
  });

  it('admin list applies filters, search, sort and paging, and shows how to refund', async () => {
    const h = setup({ refunds: [refund()] });
    const result = await h.service.findAdmin({ orderId: 'o1', status: 'REQUESTED', search: 'DH8K', sort: '-amount', page: 2, limit: 10 });
    expect(h.calls.andWhere.map(([sql]) => sql)).toEqual([
      'r.order_id = :orderId',
      'r.status = :status',
      expect.stringContaining('a.transfer_code ILIKE :search'),
    ]);
    expect(h.calls.andWhere[2][1]).toEqual({ search: '%DH8K%' });
    expect(h.calls.orderBy).toEqual(['r.amount', 'DESC']);
    expect(h.calls.skip).toBe(10);
    expect(h.calls.take).toBe(10);
    expect(result).toMatchObject({ total: 1, page: 2, limit: 10, totalPages: 1 });
    expect(result.data[0]).toMatchObject({ id: 'r1', payment: { transferCode: 'DH8K4T72M9', transactionRef: '92704' } });
    expect(JSON.stringify(result)).not.toContain('raw');
    expect(JSON.stringify(result)).not.toContain('0010000000355');
  });

  it('defaults to newest first', async () => {
    const h = setup({ refunds: [refund()] });
    await h.service.findAdmin({});
    expect(h.calls.orderBy).toEqual(['r.createdAt', 'DESC']);
  });
});

describe('a refunded order is never payable again', () => {
  const make = (paymentStatus: string) => {
    const h = setup({ orders: [order({ paymentStatus, status: 'cancelled' })] });
    const orderRepo: any = { findOne: jest.fn(async () => h.rows(Order)[0]) };
    const config: any = {
      getQrConfig: () => ({ prefix: 'DH', account: '1', bankCode: 'VCB', bankName: 'VCB', accountName: 'N' }),
    };
    return new PaymentService(h.dataSource, orderRepo, {} as any, {} as any, config, { getVndPerUsd: async () => 25000 } as any);
  };

  it('createQr → 1702', async () => {
    await expect(make('refunded').createQr('u1', { orderId: 'o1' })).rejects.toMatchObject({ response: { errorCode: 1702 } });
  });

  it('confirmPaymentAdmin → 1702', async () => {
    await expect(make('refunded').confirmPaymentAdmin('admin-1', 'o1', { amountVnd: 1, reference: 'X', note: 'n' })).rejects.toMatchObject({
      response: { errorCode: 1702 },
    });
  });

  it('getStatus still says PAID for the payment that happened', async () => {
    expect(await make('refunded').getStatus('u1', 'o1')).toEqual({
      data: { orderId: 'o1', status: 'PAID', amountVnd: 4_625_000, amountUsd: 185, exchangeRate: 25_000 },
    });
  });
});

describe('refund DTOs', () => {
  it('CompleteRefundDto trims, requires reference and note, rejects unknown fields', async () => {
    expect(await body(CompleteRefundDto, { reference: '  FT123  ', note: ' ok ' })).toMatchObject({ reference: 'FT123', note: 'ok' });
    await expect(body(CompleteRefundDto, { reference: 'FT123' })).rejects.toBeDefined();
    await expect(body(CompleteRefundDto, { note: 'n' })).rejects.toBeDefined();
    await expect(body(CompleteRefundDto, { reference: '   ', note: 'n' })).rejects.toBeDefined();
    await expect(body(CompleteRefundDto, { reference: 'x'.repeat(65), note: 'n' })).rejects.toBeDefined();
    await expect(body(CompleteRefundDto, { reference: 'FT1', note: 'n', amount: 1 })).rejects.toBeDefined();
  });

  it('RejectRefundDto requires a reason', async () => {
    expect(await body(RejectRefundDto, { note: ' không hoàn ' })).toMatchObject({ note: 'không hoàn' });
    await expect(body(RejectRefundDto, {})).rejects.toBeDefined();
    await expect(body(RejectRefundDto, { note: 'x'.repeat(501) })).rejects.toBeDefined();
  });

  it('CreateRefundDto requires orderId', async () => {
    expect(await body(CreateRefundDto, { orderId: 'o1' })).toMatchObject({ orderId: 'o1' });
    await expect(body(CreateRefundDto, {})).rejects.toBeDefined();
    await expect(body(CreateRefundDto, { orderId: 'x'.repeat(17) })).rejects.toBeDefined();
  });
});

describe('prorateRefundAmount', () => {
  it('the whole value (or more) is exactly what was paid', () => {
    expect(prorateRefundAmount(4_625_000, 4_625_000, 4_625_000)).toBe(4_625_000);
    expect(prorateRefundAmount(4_625_000, 5_000_000, 4_625_000)).toBe(4_625_000);
  });

  it('a part is the same share of what was really paid, rounded to whole dong', () => {
    expect(prorateRefundAmount(4_625_000, 4_250_000, 4_625_000)).toBe(4_250_000);
    expect(prorateRefundAmount(1_000_000, 1, 3)).toBe(333_333);
    expect(prorateRefundAmount(1_000_001, 2, 3)).toBe(666_667);
  });

  it('nothing to refund → 0', () => {
    expect(prorateRefundAmount(4_625_000, 0, 4_625_000)).toBe(0);
    expect(prorateRefundAmount(4_625_000, 100, 0)).toBe(0);
  });
});

describe('refunds that come from a return request', () => {
  const returnSeed = (over: Record<string, any> = {}) => ({
    orders: [order({ status: 'delivered' })],
    returns: [
      {
        id: 'ret1',
        orderId: 'o1',
        status: 'RECEIVED',
        reason: 'WRONG_SIZE',
        adminNote: null,
        receivedAt: new Date(),
        shippingRefunded: true,
      },
    ],
    returnItems: [
      { id: 'ri1', returnRequestId: 'ret1', orderItemId: 'i1', quantity: 2, acceptedQuantity: 2 },
      { id: 'ri2', returnRequestId: 'ret1', orderItemId: 'i2', quantity: 1, acceptedQuantity: 1 },
    ],
    refunds: [refund({ reason: 'RETURN', returnRequestId: 'ret1', amount: 4_250_000, ...over })],
  });

  it('completing a partial refund keeps the order paid and marks the return REFUNDED', async () => {
    const h = setup(returnSeed());
    await h.service.completeAdmin('admin-1', 'r1', { reference: 'FT-RET', note: 'đã chuyển' });
    expect(h.rows(ReturnRequest)[0].status).toBe('REFUNDED');
    expect(h.rows(Order)[0].paymentStatus).toBe('paid');
  });

  it('completing a refund of everything that was paid also turns the order refunded', async () => {
    const h = setup(returnSeed({ amount: AMOUNT }));
    await h.service.completeAdmin('admin-1', 'r1', { reference: 'FT-RET', note: 'đã chuyển' });
    expect(h.rows(ReturnRequest)[0].status).toBe('REFUNDED');
    expect(h.rows(Order)[0].paymentStatus).toBe('refunded');
  });

  it('a refund that is not from a return never touches return requests', async () => {
    const h = setup({ ...returnSeed(), refunds: [refund()] });
    await h.service.completeAdmin('admin-1', 'r1', { reference: 'FT-X', note: 'n' });
    expect(h.rows(ReturnRequest)[0].status).toBe('RECEIVED');
  });

  it('rejecting it sends the return back to APPROVED so the shop can receive it again; accepted quantities are cleared', async () => {
    const h = setup(returnSeed());
    await h.service.rejectAdmin('admin-1', 'r1', { note: 'Số lượng nhập sai' });
    expect(h.rows(Refund)[0].status).toBe('REJECTED');
    expect(h.rows(ReturnRequest)[0]).toMatchObject({ status: 'APPROVED', receivedAt: null, shippingRefunded: false });
    expect(h.rows(ReturnRequestItem).map((i) => i.acceptedQuantity)).toEqual([null, null]);
    expect(h.rows(Order)[0].paymentStatus).toBe('paid');
  });

  it('customer and admin views link the refund to its return', async () => {
    const h = setup(returnSeed());
    expect((await h.service.listForCustomer(ORDER_REF))[0]).toMatchObject({ reason: 'RETURN', returnId: 'ret1' });
    const { data } = await h.service.rejectAdmin('admin-1', 'r1', { note: 'n' });
    expect(data).toMatchObject({ reason: 'RETURN', returnRequestId: 'ret1' });
  });

  it('cancel-type refunds have no return link', async () => {
    const h = setup({ refunds: [refund()] });
    expect((await h.service.listForCustomer(ORDER_REF))[0].returnId).toBeNull();
  });
});

describe('refunds are based on the money really received, not on the amount the QR asked for', () => {
  // Admin xác nhận thủ công khi khách chuyển thiếu (acceptAmountMismatch): phiên vẫn ghi 4 625 000 nhưng ngân hàng chỉ nhận 4 000 000
  const shortPaid = () => ({
    orders: [order({ status: 'cancelled' })],
    transactions: [tx({ amount: 4_000_000, verificationStatus: 'MANUALLY_CONFIRMED' })],
  });

  it('a refund for a cancelled order is exactly what the bank received', async () => {
    const h = setup(shortPaid());
    const { data } = await h.service.createAdmin('admin-1', { orderId: 'o1' });
    expect(data.amountVnd).toBe(4_000_000);
    expect(data.payment.paidAmountVnd).toBe(4_000_000);
  });

  it('completing it refunds the order (nothing is left to give back)', async () => {
    const h = setup({ ...shortPaid(), refunds: [refund({ amount: 4_000_000 })] });
    await h.service.completeAdmin('admin-1', 'r1', { reference: 'FT-S', note: 'n' });
    expect(h.rows(Order)[0].paymentStatus).toBe('refunded');
  });

  it('a request larger than what was received cannot be completed (1712)', async () => {
    const h = setup({ ...shortPaid(), refunds: [refund({ amount: AMOUNT })] });
    await expect(h.service.completeAdmin('admin-1', 'r1', { reference: 'FT-S', note: 'n' })).rejects.toMatchObject({
      response: { errorCode: 1712 },
    });
    expect(h.rows(Order)[0].paymentStatus).toBe('paid');
  });

  it('a normal webhook payment is unchanged (received = asked)', async () => {
    const h = setup({});
    expect((await h.service.createAdmin('admin-1', { orderId: 'o1' })).data.amountVnd).toBe(AMOUNT);
  });
});
