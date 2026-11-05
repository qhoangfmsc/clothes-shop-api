import { ValidationPipe } from '@nestjs/common';
import { Order } from '../../order/shared/order.entity';
import { Refund } from '../../refund/refund.entity';
import { attempt, order, PAID, returnItem, returnRow } from '../shared/return.test-utils';
import { ReturnRequest } from '../shared/return-request.entity';
import { ReturnRequestItem } from '../shared/return-request-item.entity';
import { ReceiveReturnDto } from './dtos/receive-return.dto';
import { RejectReturnDto } from './dtos/reject-return.dto';
import { setupProcessing } from './processing.test-utils';

describe('ReturnProcessingService admin approve / reject', () => {
  it('approve: REQUESTED → APPROVED with the instructions the customer will see', async () => {
    const h = setupProcessing({ returns: [returnRow()], returnItems: [returnItem()] });
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
    const h = setupProcessing({ returns: [returnRow({ status: 'APPROVED' })], returnItems: [returnItem()] });
    await expect(h.service.approve('adm', 'r1', {})).rejects.toMatchObject({ response: { errorCode: 1804 } });
    await expect(h.service.approve('adm', 'nope', {})).rejects.toMatchObject({ status: 404, response: { errorCode: 1801 } });
  });

  it.each(['REQUESTED', 'APPROVED'])('reject from %s records the reason', async (status) => {
    const h = setupProcessing({ returns: [returnRow({ status })], returnItems: [returnItem()] });
    const { data } = await h.service.reject('adm', 'r1', { note: 'Quá hạn kiểm hàng' });
    expect(data).toMatchObject({ status: 'REJECTED', adminNote: 'Quá hạn kiểm hàng', processedBy: 'adm' });
  });

  it.each(['RECEIVED', 'REFUNDED', 'REJECTED', 'CANCELLED'])('cannot reject a %s return (1804)', async (status) => {
    const h = setupProcessing({ returns: [returnRow({ status })], returnItems: [returnItem()] });
    await expect(h.service.reject('adm', 'r1', { note: 'x' })).rejects.toMatchObject({ response: { errorCode: 1804 } });
  });

  it('admin list applies filters, search, sort and paging and includes order/customer', async () => {
    const h = setupProcessing({ returns: [returnRow()], returnItems: [returnItem()] });
    const result = await h.queries.findAllAdmin({
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

describe('ReturnProcessingService.receive — checks the goods and creates the refund request', () => {
  const approved = () => ({
    returns: [returnRow({ status: 'APPROVED' })],
    returnItems: [returnItem({ id: 'ri1', orderItemId: 'i1', quantity: 2 }), returnItem({ id: 'ri2', orderItemId: 'i2', quantity: 1 })],
  });

  it('accepting everything refunds the items pro rata of what was paid (items 4,250,000 of an order of 4,625,000), shipping excluded', async () => {
    const h = setupProcessing(approved());
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
    expect(data).toMatchObject({
      status: 'RECEIVED',
      shippingRefunded: false,
      refund: { amountVnd: 4_250_000, amountUsd: 170, status: 'REQUESTED' },
    });
    expect(data.items.map((i: any) => i.acceptedQuantity)).toEqual([2, 1]);
    expect(data.receivedAt).toBeInstanceOf(Date);
    expect(h.rows(Order)[0].paymentStatus).toBe('paid'); // đơn chưa hoàn xong
    expect(h.manager.locks.map((l) => l.split(':')[0])).toEqual(['Order', 'ReturnRequest']);
  });

  it('accepted quantities per line change the amount (1 shirt 1,500,000 + the pants 1,250,000 = 2,750,000)', async () => {
    const h = setupProcessing(approved());
    await h.service.receive('adm', 'r1', { items: [{ returnItemId: 'ri1', acceptedQuantity: 1 }] });
    expect(h.rows(Refund)[0].amount).toBe(2_750_000);
    expect(h.rows(ReturnRequestItem).map((i) => i.acceptedQuantity)).toEqual([1, 1]);
  });

  it('refundShipping adds the shipping fee; everything + shipping is exactly what the customer paid', async () => {
    const h = setupProcessing(approved());
    const { data } = await h.service.receive('adm', 'r1', { refundShipping: true, note: 'Hàng lỗi' });
    expect(h.rows(Refund)[0].amount).toBe(PAID);
    expect(data).toMatchObject({ shippingRefunded: true, adminNote: 'Hàng lỗi' });
  });

  it('the shipping fee is refunded once per order (1805)', async () => {
    const h = setupProcessing({
      ...approved(),
      returns: [returnRow({ status: 'APPROVED' }), returnRow({ id: 'r0', status: 'REFUNDED', shippingRefunded: true })],
    });
    await expect(h.service.receive('adm', 'r1', { refundShipping: true })).rejects.toMatchObject({ response: { errorCode: 1805 } });
    expect(h.rows(Refund)).toHaveLength(0);
    expect(h.rows(ReturnRequest)[0].status).toBe('APPROVED');
  });

  it('rounds pro rata on the amount really paid by the bank', async () => {
    // ngân hàng thực nhận 4 000 000 cho đơn 4 625 000: hàng 1 250 000 (1 quần) → 4 000 000 × 1 250 000 / 4 625 000
    const h = setupProcessing({ ...approved(), attempts: [attempt({ amount: 4_000_000 })] });
    await h.service.receive('adm', 'r1', { items: [{ returnItemId: 'ri1', acceptedQuantity: 0 }] });
    expect(h.rows(Refund)[0].amount).toBe(Math.round((4_000_000 * 1_250_000) / 4_625_000));
  });

  it('invalid acceptance data is refused (1805) and nothing changes', async () => {
    const h = setupProcessing(approved());
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
    const h = setupProcessing({ ...approved(), returns: [returnRow({ status })] });
    await expect(h.service.receive('adm', 'r1', {})).rejects.toMatchObject({ response: { errorCode: 1804 } });
    expect(h.rows(Refund)).toHaveLength(0);
  });

  it('an order that is no longer paid cannot get a refund (1805)', async () => {
    const h = setupProcessing({ ...approved(), orders: [order({ paymentStatus: 'refunded' })] });
    await expect(h.service.receive('adm', 'r1', {})).rejects.toMatchObject({ response: { errorCode: 1805 } });
  });

  it('a refund still waiting for the same order blocks it (1712) and the return stays APPROVED', async () => {
    const h = setupProcessing({
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
    const h = setupProcessing({
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
    const h = setupProcessing({ ...approved(), attempts: [] });
    await expect(h.service.receive('adm', 'r1', {})).rejects.toMatchObject({ response: { errorCode: 1712 } });
    expect(h.rows(ReturnRequest)[0].status).toBe('APPROVED');
  });
});

describe('return processing DTOs', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const body = (metatype: any, value: any) => pipe.transform(value, { type: 'body', metatype });

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

describe('ReturnProcessingService.receive — several returns of one order never drift from what was paid', () => {
  // 3 áo giá 100 000, không ship; khách trả 1 000 001 VND: chia ba không tròn
  const threeShirts = {
    orders: [order({ subtotal: 300_000, shippingFee: 0, total: 300_000 })],
    orderItems: [
      { id: 'a', orderId: 'o1', productName: 'A', price: 100_000, quantity: 1 },
      { id: 'b', orderId: 'o1', productName: 'B', price: 100_000, quantity: 1 },
      { id: 'c', orderId: 'o1', productName: 'C', price: 100_000, quantity: 1 },
    ],
    attempts: [attempt({ amount: 1_000_001 })],
  };

  it('the refunds of three one-item returns add up to exactly the amount paid', async () => {
    const h = setupProcessing({
      ...threeShirts,
      returns: ['r1', 'r2', 'r3'].map((id) => returnRow({ id })),
      returnItems: ['a', 'b', 'c'].map((orderItemId, index) =>
        returnItem({ id: `ri${index + 1}`, returnRequestId: `r${index + 1}`, orderItemId, quantity: 1 }),
      ),
    });
    const amounts: number[] = [];
    for (const [index, id] of ['r1', 'r2', 'r3'].entries()) {
      await h.service.approve('adm', id, {});
      const received = await h.service.receive('adm', id, {});
      amounts.push(received.data.refund?.amountVnd as number);
      // admin chuyển khoản xong: khoản hoàn và yêu cầu trả hàng đều xong
      h.rows(Refund)[index].status = 'COMPLETED';
      h.rows(ReturnRequest)[index].status = 'REFUNDED';
    }
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(1_000_001);
    expect(amounts).toEqual([333_334, 333_333, 333_334]);
  });
});
