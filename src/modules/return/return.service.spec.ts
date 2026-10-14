import { ValidationPipe } from '@nestjs/common';
import { Order } from '../order/order.entity';
import { createFakeManager } from '../payment/payment.test-utils';
import { Refund } from '../payment/refund.entity';
import { RefundService } from '../payment/refund.service';
import { CreateReturnDto } from './dtos/create-return.dto';
import { ReceiveReturnDto } from './dtos/receive-return.dto';
import { RejectReturnDto } from './dtos/reject-return.dto';
import { ReturnService } from './return.service';
import { ReturnRequest } from './return-request.entity';
import { ReturnRequestItem } from './return-request-item.entity';

const DAY = 24 * 60 * 60 * 1000;
const PAID = 4_625_000; // 185 đơn vị × 25 000
const order = (over: Record<string, any> = {}) => ({
  id: 'o1',
  userId: 'u1',
  status: 'delivered',
  paymentStatus: 'paid',
  paidAt: new Date(Date.now() - 10 * DAY),
  deliveredAt: new Date(Date.now() - 5 * DAY),
  subtotal: '170.00',
  shippingFee: '15.00',
  total: '185.00',
  shippingAddress: { fullName: 'Nguyen Van A', phone: '0900000000' },
  ...over,
});
const orderItems = [
  { id: 'i1', orderId: 'o1', productName: 'Linen Shirt', productImage: 'a.jpg', price: '60.00', quantity: 2, size: 'M', color: 'white' },
  { id: 'i2', orderId: 'o1', productName: 'Chino Pants', productImage: 'b.jpg', price: '50.00', quantity: 1, size: '32', color: 'navy' },
];
const attempt = (over: Record<string, any> = {}) => ({
  id: 'a1',
  orderId: 'o1',
  status: 'PAID',
  amount: PAID,
  transferCode: 'DHPAID0000',
  ...over,
});
const returnRow = (over: Record<string, any> = {}) => ({
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
const returnItem = (over: Record<string, any> = {}) => ({
  id: 'ri1',
  returnRequestId: 'r1',
  orderItemId: 'i1',
  quantity: 2,
  acceptedQuantity: null,
  ...over,
});

function setup(seed: Parameters<typeof createFakeManager>[0] = {}, policyDays = 30) {
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
  const service = new ReturnService(dataSource, returnRepo, shipping, refundService);
  return { service, manager, rows, calls, shipping, returnRepo };
}

const items = (...pairs: [string, number][]) => pairs.map(([orderItemId, quantity]) => ({ orderItemId, quantity }));

describe('ReturnService.getEligibility', () => {
  it('shows the deadline from the configured policy and what can still be returned per item', async () => {
    const h = setup({ returns: [returnRow()], returnItems: [returnItem({ quantity: 1 })] });
    const { data } = await h.service.getEligibility('u1', 'o1');
    expect(data).toMatchObject({ orderId: 'o1', eligible: true, reason: null, returnWindowDays: 30 });
    expect(data.items).toEqual([
      { orderItemId: 'i1', quantity: 2, returnableQuantity: 1 },
      { orderItemId: 'i2', quantity: 1, returnableQuantity: 1 },
    ]);
    expect(h.shipping.get).toHaveBeenCalled();
  });

  it('a shorter policy closes the window', async () => {
    const h = setup({}, 3);
    expect((await h.service.getEligibility('u1', 'o1')).data).toMatchObject({
      eligible: false,
      reason: 'RETURN_WINDOW_EXPIRED',
      returnWindowDays: 3,
    });
  });

  it("another user's or unknown order → 404 / 1301", async () => {
    const h = setup();
    await expect(h.service.getEligibility('someone-else', 'o1')).rejects.toMatchObject({ status: 404, response: { errorCode: 1301 } });
    await expect(h.service.getEligibility('u1', 'nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('ReturnService.create', () => {
  it('creates a REQUESTED return with product snapshots and locks the order first', async () => {
    const h = setup();
    const { data } = await h.service.create('u1', {
      orderId: 'o1',
      reason: 'WRONG_SIZE',
      note: 'Quá rộng',
      items: items(['i1', 1], ['i2', 1]),
    });
    expect(data).toMatchObject({
      orderId: 'o1',
      status: 'REQUESTED',
      reason: 'WRONG_SIZE',
      note: 'Quá rộng',
      adminNote: null,
      refund: null,
    });
    expect(data.items).toEqual([
      expect.objectContaining({
        orderItemId: 'i1',
        productName: 'Linen Shirt',
        size: 'M',
        color: 'white',
        price: 60,
        quantity: 1,
        acceptedQuantity: null,
      }),
      expect.objectContaining({ orderItemId: 'i2', productName: 'Chino Pants', quantity: 1 }),
    ]);
    expect(h.rows(ReturnRequest)[0]).toMatchObject({ requestedBy: 'u1', processedBy: null, shippingRefunded: false });
    expect(h.manager.locks[0]).toContain('Order');
    // Khách không thấy người xử lý hay đơn trong view của mình
    expect(Object.keys(data)).not.toContain('processedBy');
    expect(Object.keys(data)).not.toContain('order');
  });

  it('note defaults to an empty string', async () => {
    const h = setup();
    expect((await h.service.create('u1', { orderId: 'o1', reason: 'OTHER', items: items(['i2', 1]) })).data.note).toBe('');
  });

  it.each([
    ['not delivered', { status: 'shipping', deliveredAt: null }, 'delivered'],
    ['unpaid', { paymentStatus: 'unpaid' }, 'paid'],
    ['refunded', { paymentStatus: 'refunded' }, 'paid'],
    ['past the window', { deliveredAt: new Date(Date.now() - 31 * DAY) }, 'period'],
  ])('refuses an order that is %s (1802) and writes nothing', async (_name, over, word) => {
    const h = setup({ orders: [order(over)] });
    await expect(h.service.create('u1', { orderId: 'o1', reason: 'OTHER', items: items(['i1', 1]) })).rejects.toMatchObject({
      response: { errorCode: 1802, message: expect.stringContaining(word) },
    });
    expect(h.rows(ReturnRequest)).toHaveLength(0);
  });

  it('refuses more than was bought, unknown lines, lines of another order and duplicated lines (1803)', async () => {
    const h = setup({ orderItems: [...orderItems, { id: 'x1', orderId: 'other', price: '1.00', quantity: 1 }] });
    for (const bad of [items(['i1', 3]), items(['nope', 1]), items(['x1', 1]), items(['i1', 1], ['i1', 1])]) {
      await expect(h.service.create('u1', { orderId: 'o1', reason: 'OTHER', items: bad })).rejects.toMatchObject({
        response: { errorCode: 1803 },
      });
    }
    expect(h.rows(ReturnRequest)).toHaveLength(0);
  });

  it('active requests use up the quantity; rejected and cancelled ones give it back', async () => {
    const h = setup();
    await h.service.create('u1', { orderId: 'o1', reason: 'OTHER', items: items(['i1', 1]) });
    await expect(h.service.create('u1', { orderId: 'o1', reason: 'OTHER', items: items(['i1', 2]) })).rejects.toMatchObject({
      response: { errorCode: 1803 },
    });
    await h.service.create('u1', { orderId: 'o1', reason: 'OTHER', items: items(['i1', 1], ['i2', 1]) });
    // mọi dòng đã nằm trong yêu cầu còn hiệu lực
    await expect(h.service.create('u1', { orderId: 'o1', reason: 'OTHER', items: items(['i2', 1]) })).rejects.toMatchObject({
      response: { errorCode: 1802 },
    });

    h.rows(ReturnRequest)[0].status = 'REJECTED';
    h.rows(ReturnRequest)[1].status = 'CANCELLED';
    await expect(h.service.create('u1', { orderId: 'o1', reason: 'OTHER', items: items(['i1', 2], ['i2', 1]) })).resolves.toBeDefined();
  });

  it("another user's order → 404 and nothing is written", async () => {
    const h = setup();
    await expect(h.service.create('someone-else', { orderId: 'o1', reason: 'OTHER', items: items(['i1', 1]) })).rejects.toMatchObject({
      status: 404,
    });
    expect(h.rows(ReturnRequest)).toHaveLength(0);
  });
});

describe('ReturnService customer read / cancel', () => {
  const seed = { returns: [returnRow()], returnItems: [returnItem()] };

  it('findOne returns the customer view; other customers get 404 / 1801', async () => {
    const h = setup(seed);
    expect((await h.service.findOne('u1', 'r1')).data).toMatchObject({
      id: 'r1',
      items: [expect.objectContaining({ productName: 'Linen Shirt' })],
    });
    await expect(h.service.findOne('someone-else', 'r1')).rejects.toMatchObject({ status: 404, response: { errorCode: 1801 } });
    await expect(h.service.findOne('u1', 'nope')).rejects.toMatchObject({ status: 404, response: { errorCode: 1801 } });
  });

  it('findAll is limited to my orders, supports filters and the standard paging shape', async () => {
    const h = setup({
      ...seed,
      orders: [order(), order({ id: 'o2', userId: 'u2' })],
      returns: [returnRow(), returnRow({ id: 'r2', orderId: 'o2' })],
      returnItems: [returnItem(), returnItem({ id: 'ri2', returnRequestId: 'r2' })],
    });
    const result = await h.service.findAll('u1', { page: 1, limit: 10, status: 'REQUESTED', orderId: 'o1' });
    expect(result).toMatchObject({ total: 1, page: 1, limit: 10, totalPages: 1 });
    expect(result.data.map((r: any) => r.id)).toEqual(['r1']);
    expect(h.calls.findAndCount).toMatchObject({
      where: { order: { userId: 'u1' }, status: 'REQUESTED', orderId: 'o1' },
      order: { createdAt: 'DESC' },
      skip: 0,
      take: 10,
    });
  });

  it.each(['REQUESTED', 'APPROVED'])('customer can cancel a %s return', async (status) => {
    const h = setup({ ...seed, returns: [returnRow({ status })] });
    const { data } = await h.service.cancel('u1', 'r1');
    expect(data.status).toBe('CANCELLED');
  });

  it.each(['RECEIVED', 'REFUNDED', 'REJECTED', 'CANCELLED'])('customer cannot cancel a %s return (1804)', async (status) => {
    const h = setup({ ...seed, returns: [returnRow({ status })] });
    await expect(h.service.cancel('u1', 'r1')).rejects.toMatchObject({ response: { errorCode: 1804 } });
    expect(h.rows(ReturnRequest)[0].status).toBe(status);
  });

  it("cancelling someone else's return → 404 and unchanged", async () => {
    const h = setup(seed);
    await expect(h.service.cancel('someone-else', 'r1')).rejects.toMatchObject({ status: 404, response: { errorCode: 1801 } });
    expect(h.rows(ReturnRequest)[0].status).toBe('REQUESTED');
  });
});

describe('ReturnService admin approve / reject', () => {
  it('approve: REQUESTED → APPROVED with the instructions the customer will see', async () => {
    const h = setup({ returns: [returnRow()], returnItems: [returnItem()] });
    const { data } = await h.service.approve('adm', 'r1', { note: 'Gửi về 12 Nguyễn Huệ' });
    expect(data).toMatchObject({
      status: 'APPROVED',
      adminNote: 'Gửi về 12 Nguyễn Huệ',
      processedBy: 'adm',
      order: { id: 'o1', customer: { fullName: 'Nguyen Van A' } },
    });
    expect(data.approvedAt).toBeInstanceOf(Date);
    expect(h.manager.locks.map((l) => l.split(':')[0])).toEqual(['Order', 'ReturnRequest']);
  });

  it('approve only from REQUESTED (1804), unknown → 1801', async () => {
    const h = setup({ returns: [returnRow({ status: 'APPROVED' })], returnItems: [returnItem()] });
    await expect(h.service.approve('adm', 'r1', {})).rejects.toMatchObject({ response: { errorCode: 1804 } });
    await expect(h.service.approve('adm', 'nope', {})).rejects.toMatchObject({ status: 404, response: { errorCode: 1801 } });
  });

  it.each(['REQUESTED', 'APPROVED'])('reject from %s records the reason', async (status) => {
    const h = setup({ returns: [returnRow({ status })], returnItems: [returnItem()] });
    const { data } = await h.service.reject('adm', 'r1', { note: 'Quá hạn kiểm hàng' });
    expect(data).toMatchObject({ status: 'REJECTED', adminNote: 'Quá hạn kiểm hàng', processedBy: 'adm' });
  });

  it.each(['RECEIVED', 'REFUNDED', 'REJECTED', 'CANCELLED'])('cannot reject a %s return (1804)', async (status) => {
    const h = setup({ returns: [returnRow({ status })], returnItems: [returnItem()] });
    await expect(h.service.reject('adm', 'r1', { note: 'x' })).rejects.toMatchObject({ response: { errorCode: 1804 } });
  });

  it('admin list applies filters, search, sort and paging and includes order/customer', async () => {
    const h = setup({ returns: [returnRow()], returnItems: [returnItem()] });
    const result = await h.service.findAllAdmin({
      status: 'REQUESTED',
      orderId: 'o1',
      search: '0900',
      sort: 'updatedAt',
      page: 3,
      limit: 5,
    });
    expect(h.calls.andWhere.map(([sql]) => sql)).toEqual([
      'r.status = :status',
      'r.order_id = :orderId',
      expect.stringContaining("shipping_address->>'phone' ILIKE :search"),
    ]);
    expect(h.calls.andWhere[2][1]).toEqual({ search: '%0900%' });
    expect(h.calls.orderBy).toEqual(['r.updatedAt', 'ASC']);
    expect(h.calls.skip).toBe(10);
    expect(result.data[0]).toMatchObject({ id: 'r1', requestedBy: 'u1', order: { customer: { phone: '0900000000' } } });
  });
});

describe('ReturnService.receive — checks the goods and creates the refund request', () => {
  const approved = () => ({
    returns: [returnRow({ status: 'APPROVED' })],
    returnItems: [returnItem({ id: 'ri1', orderItemId: 'i1', quantity: 2 }), returnItem({ id: 'ri2', orderItemId: 'i2', quantity: 1 })],
  });

  it('accepting everything refunds the items pro rata of what was paid (170 of 185 → 4,250,000), shipping excluded', async () => {
    const h = setup(approved());
    const { data } = await h.service.receive('adm', 'r1', {});
    expect(h.rows(Refund)).toEqual([
      expect.objectContaining({
        orderId: 'o1',
        paymentAttemptId: 'a1',
        returnRequestId: 'r1',
        amount: 4_250_000,
        reason: 'RETURN',
        status: 'REQUESTED',
        requestedBy: 'adm',
      }),
    ]);
    expect(data).toMatchObject({ status: 'RECEIVED', shippingRefunded: false, refund: { amount: 4_250_000, status: 'REQUESTED' } });
    expect(data.items.map((i: any) => i.acceptedQuantity)).toEqual([2, 1]);
    expect(data.receivedAt).toBeInstanceOf(Date);
    expect(h.rows(Order)[0].paymentStatus).toBe('paid'); // đơn chưa hoàn xong
    expect(h.manager.locks.map((l) => l.split(':')[0])).toEqual(['Order', 'ReturnRequest']);
  });

  it('accepted quantities per line change the amount (1 shirt + the pants = 110 → 2,750,000)', async () => {
    const h = setup(approved());
    await h.service.receive('adm', 'r1', { items: [{ returnItemId: 'ri1', acceptedQuantity: 1 }] });
    expect(h.rows(Refund)[0].amount).toBe(2_750_000);
    expect(h.rows(ReturnRequestItem).map((i) => i.acceptedQuantity)).toEqual([1, 1]);
  });

  it('refundShipping adds the shipping fee; everything + shipping is exactly what the customer paid', async () => {
    const h = setup(approved());
    const { data } = await h.service.receive('adm', 'r1', { refundShipping: true, note: 'Hàng lỗi' });
    expect(h.rows(Refund)[0].amount).toBe(PAID);
    expect(data).toMatchObject({ shippingRefunded: true, adminNote: 'Hàng lỗi' });
  });

  it('the shipping fee is refunded once per order (1805)', async () => {
    const h = setup({
      ...approved(),
      returns: [returnRow({ status: 'APPROVED' }), returnRow({ id: 'r0', status: 'REFUNDED', shippingRefunded: true })],
    });
    await expect(h.service.receive('adm', 'r1', { refundShipping: true })).rejects.toMatchObject({ response: { errorCode: 1805 } });
    expect(h.rows(Refund)).toHaveLength(0);
    expect(h.rows(ReturnRequest)[0].status).toBe('APPROVED');
  });

  it('rounds pro rata on the amount really paid, not on today’s exchange rate', async () => {
    // đã trả 4 625 000 cho tổng 185: hàng 50 (1 quần) → 4 625 000 × 50 / 185 = 1 250 000
    const h = setup({ ...approved(), attempts: [attempt({ amount: 4_000_000 })] });
    await h.service.receive('adm', 'r1', { items: [{ returnItemId: 'ri1', acceptedQuantity: 0 }] });
    expect(h.rows(Refund)[0].amount).toBe(Math.round((4_000_000 * 5000) / 18500));
  });

  it('invalid acceptance data is refused (1805) and nothing changes', async () => {
    const h = setup(approved());
    for (const bad of [
      [{ returnItemId: 'ri1', acceptedQuantity: 3 }],
      [{ returnItemId: 'nope', acceptedQuantity: 1 }],
      [
        { returnItemId: 'ri1', acceptedQuantity: 1 },
        { returnItemId: 'ri1', acceptedQuantity: 1 },
      ],
      [
        { returnItemId: 'ri1', acceptedQuantity: 0 },
        { returnItemId: 'ri2', acceptedQuantity: 0 },
      ],
    ]) {
      await expect(h.service.receive('adm', 'r1', { items: bad })).rejects.toMatchObject({ response: { errorCode: 1805 } });
    }
    expect(h.rows(Refund)).toHaveLength(0);
    expect(h.rows(ReturnRequest)[0].status).toBe('APPROVED');
    expect(h.rows(ReturnRequestItem).every((i) => i.acceptedQuantity === null)).toBe(true);
  });

  it.each([
    'REQUESTED',
    'RECEIVED',
    'REFUNDED',
    'REJECTED',
    'CANCELLED',
  ])('only an APPROVED return can be received (%s → 1804)', async (status) => {
    const h = setup({ ...approved(), returns: [returnRow({ status })] });
    await expect(h.service.receive('adm', 'r1', {})).rejects.toMatchObject({ response: { errorCode: 1804 } });
    expect(h.rows(Refund)).toHaveLength(0);
  });

  it('an order that is no longer paid cannot get a refund (1805)', async () => {
    const h = setup({ ...approved(), orders: [order({ paymentStatus: 'refunded' })] });
    await expect(h.service.receive('adm', 'r1', {})).rejects.toMatchObject({ response: { errorCode: 1805 } });
  });

  it('a refund still waiting for the same order blocks it (1712) and the return stays APPROVED', async () => {
    const h = setup({
      ...approved(),
      refunds: [
        {
          id: 'rf0',
          orderId: 'o1',
          paymentAttemptId: 'a1',
          amount: 1000,
          status: 'REQUESTED',
          reason: 'ADMIN_CANCELLED',
          returnRequestId: null,
          bankReference: null,
        },
      ],
    });
    await expect(h.service.receive('adm', 'r1', {})).rejects.toMatchObject({ response: { errorCode: 1712 } });
    expect(h.rows(ReturnRequest)[0].status).toBe('APPROVED');
    expect(h.rows(Refund)).toHaveLength(1);
  });

  it('never refunds more than what is left of the payment', async () => {
    const h = setup({
      ...approved(),
      refunds: [
        {
          id: 'rf0',
          orderId: 'o1',
          paymentAttemptId: 'a1',
          amount: 4_000_000,
          status: 'COMPLETED',
          reason: 'RETURN',
          returnRequestId: 'r-old',
          bankReference: 'FT0',
        },
      ],
    });
    await h.service.receive('adm', 'r1', {});
    expect(h.rows(Refund)[1].amount).toBe(625_000);
  });

  it('a paid order without a PAID payment session cannot be refunded (1712)', async () => {
    const h = setup({ ...approved(), attempts: [] });
    await expect(h.service.receive('adm', 'r1', {})).rejects.toMatchObject({ response: { errorCode: 1712 } });
    expect(h.rows(ReturnRequest)[0].status).toBe('APPROVED');
  });
});

describe('return DTOs', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const body = (metatype: any, value: any) => pipe.transform(value, { type: 'body', metatype });
  const valid = { orderId: 'o1', reason: 'WRONG_SIZE', items: [{ orderItemId: 'i1', quantity: 1 }] };

  it('CreateReturnDto accepts a valid body and trims the note', async () => {
    expect(await body(CreateReturnDto, { ...valid, note: '  rộng quá ' })).toMatchObject({ note: 'rộng quá' });
  });

  it.each([
    ['no items', { ...valid, items: [] }],
    ['missing items', { orderId: 'o1', reason: 'OTHER' }],
    ['unknown reason', { ...valid, reason: 'BORED' }],
    ['quantity 0', { ...valid, items: [{ orderItemId: 'i1', quantity: 0 }] }],
    ['fractional quantity', { ...valid, items: [{ orderItemId: 'i1', quantity: 1.5 }] }],
    ['empty orderItemId', { ...valid, items: [{ orderItemId: '', quantity: 1 }] }],
    ['note too long', { ...valid, note: 'x'.repeat(501) }],
    ['unknown field', { ...valid, amount: 1 }],
    ['unknown nested field', { ...valid, items: [{ orderItemId: 'i1', quantity: 1, price: 0 }] }],
  ])('CreateReturnDto rejects %s', async (_name, value) => {
    await expect(body(CreateReturnDto, value)).rejects.toBeDefined();
  });

  it('RejectReturnDto requires a reason', async () => {
    expect(await body(RejectReturnDto, { note: ' hết hạn ' })).toMatchObject({ note: 'hết hạn' });
    await expect(body(RejectReturnDto, {})).rejects.toBeDefined();
    await expect(body(RejectReturnDto, { note: '  ' })).rejects.toBeDefined();
  });

  it('ReceiveReturnDto is all optional but typed', async () => {
    expect(await body(ReceiveReturnDto, {})).toEqual({});
    expect(await body(ReceiveReturnDto, { items: [{ returnItemId: 'ri1', acceptedQuantity: 0 }], refundShipping: true })).toMatchObject({
      refundShipping: true,
    });
    await expect(body(ReceiveReturnDto, { items: [{ returnItemId: 'ri1', acceptedQuantity: -1 }] })).rejects.toBeDefined();
    await expect(body(ReceiveReturnDto, { refundShipping: 'yes' })).rejects.toBeDefined();
    await expect(body(ReceiveReturnDto, { amount: 5 })).rejects.toBeDefined();
  });
});

describe('ReturnService.receive — several returns of one order never drift from what was paid', () => {
  // 3 áo giá 1 đơn vị, không ship; khách trả 1 000 001 VND: chia ba không tròn
  const threeShirts = {
    orders: [order({ subtotal: '3.00', shippingFee: '0.00', total: '3.00' })],
    orderItems: [
      { id: 'a', orderId: 'o1', productName: 'A', price: '1.00', quantity: 1 },
      { id: 'b', orderId: 'o1', productName: 'B', price: '1.00', quantity: 1 },
      { id: 'c', orderId: 'o1', productName: 'C', price: '1.00', quantity: 1 },
    ],
    attempts: [attempt({ amount: 1_000_001 })],
  };

  it('the refunds of three one-item returns add up to exactly the amount paid', async () => {
    const h = setup(threeShirts);
    const amounts: number[] = [];
    for (const [index, itemId] of ['a', 'b', 'c'].entries()) {
      const created = await h.service.create('u1', { orderId: 'o1', reason: 'OTHER', items: [{ orderItemId: itemId, quantity: 1 }] });
      await h.service.approve('adm', created.data.id, {});
      const received = await h.service.receive('adm', created.data.id, {});
      amounts.push(received.data.refund?.amount as number);
      // admin chuyển khoản xong: khoản hoàn và yêu cầu trả hàng đều xong
      h.rows(Refund)[index].status = 'COMPLETED';
      h.rows(ReturnRequest)[index].status = 'REFUNDED';
    }
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(1_000_001);
    expect(amounts).toEqual([333_334, 333_333, 333_334]);
  });
});
