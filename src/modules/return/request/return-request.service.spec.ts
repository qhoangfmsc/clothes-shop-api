import { ValidationPipe } from '@nestjs/common';
import { DAY, items, order, orderItems, returnItem, returnRow } from '../shared/return.test-utils';
import { ReturnRequest } from '../shared/return-request.entity';
import { CreateReturnDto } from './dtos/create-return.dto';
import { setupRequest } from './request.test-utils';

describe('ReturnRequestQueryService.getEligibility', () => {
  it('shows the deadline from the configured policy and what can still be returned per item', async () => {
    const h = setupRequest({ returns: [returnRow()], returnItems: [returnItem({ quantity: 1 })] });
    const { data } = await h.queries.getEligibility('u1', 'o1');
    expect(data).toMatchObject({ orderId: 'o1', eligible: true, reason: null, returnWindowDays: 30 });
    expect(data.items).toEqual([
      { orderItemId: 'i1', quantity: 2, returnableQuantity: 1 },
      { orderItemId: 'i2', quantity: 1, returnableQuantity: 1 },
    ]);
    expect(h.shipping.get).toHaveBeenCalled();
  });

  it('a shorter policy closes the window', async () => {
    const h = setupRequest({}, 3);
    expect((await h.queries.getEligibility('u1', 'o1')).data).toMatchObject({
      eligible: false,
      reason: 'RETURN_WINDOW_EXPIRED',
      returnWindowDays: 3,
    });
  });

  it("another user's or unknown order → 404 / 1301", async () => {
    const h = setupRequest();
    await expect(h.queries.getEligibility('someone-else', 'o1')).rejects.toMatchObject({ status: 404, response: { errorCode: 1301 } });
    await expect(h.queries.getEligibility('u1', 'nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('ReturnRequestService.create', () => {
  it('creates a REQUESTED return with product snapshots and locks the order first', async () => {
    const h = setupRequest();
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
        priceVnd: 1_500_000,
        priceUsd: 60,
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
    const h = setupRequest();
    expect((await h.service.create('u1', { orderId: 'o1', reason: 'OTHER', items: items(['i2', 1]) })).data.note).toBe('');
  });

  it.each([
    ['not delivered', { status: 'shipping', deliveredAt: null }, 'delivered'],
    ['unpaid', { paymentStatus: 'unpaid' }, 'paid'],
    ['refunded', { paymentStatus: 'refunded' }, 'paid'],
    ['past the window', { deliveredAt: new Date(Date.now() - 31 * DAY) }, 'period'],
  ])('refuses an order that is %s (1802) and writes nothing', async (_name, over, word) => {
    const h = setupRequest({ orders: [order(over)] });
    await expect(h.service.create('u1', { orderId: 'o1', reason: 'OTHER', items: items(['i1', 1]) })).rejects.toMatchObject({
      response: { errorCode: 1802, message: expect.stringContaining(word) },
    });
    expect(h.rows(ReturnRequest)).toHaveLength(0);
  });

  it('refuses more than was bought, unknown lines, lines of another order and duplicated lines (1803)', async () => {
    const h = setupRequest({ orderItems: [...orderItems, { id: 'x1', orderId: 'other', price: 1, quantity: 1 }] });
    for (const bad of [items(['i1', 3]), items(['nope', 1]), items(['x1', 1]), items(['i1', 1], ['i1', 1])]) {
      await expect(h.service.create('u1', { orderId: 'o1', reason: 'OTHER', items: bad })).rejects.toMatchObject({
        response: { errorCode: 1803 },
      });
    }
    expect(h.rows(ReturnRequest)).toHaveLength(0);
  });

  it('active requests use up the quantity; rejected and cancelled ones give it back', async () => {
    const h = setupRequest();
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
    const h = setupRequest();
    await expect(h.service.create('someone-else', { orderId: 'o1', reason: 'OTHER', items: items(['i1', 1]) })).rejects.toMatchObject({
      status: 404,
    });
    expect(h.rows(ReturnRequest)).toHaveLength(0);
  });
});

describe('ReturnRequestService customer read / cancel', () => {
  const seed = { returns: [returnRow()], returnItems: [returnItem()] };

  it('findOne returns the customer view; other customers get 404 / 1801', async () => {
    const h = setupRequest(seed);
    expect((await h.queries.findOne('u1', 'r1')).data).toMatchObject({
      id: 'r1',
      items: [expect.objectContaining({ productName: 'Linen Shirt' })],
    });
    await expect(h.queries.findOne('someone-else', 'r1')).rejects.toMatchObject({ status: 404, response: { errorCode: 1801 } });
    await expect(h.queries.findOne('u1', 'nope')).rejects.toMatchObject({ status: 404, response: { errorCode: 1801 } });
  });

  it('findAll is limited to my orders, supports filters and the standard paging shape', async () => {
    const h = setupRequest({
      ...seed,
      orders: [order(), order({ id: 'o2', userId: 'u2' })],
      returns: [returnRow(), returnRow({ id: 'r2', orderId: 'o2' })],
      returnItems: [returnItem(), returnItem({ id: 'ri2', returnRequestId: 'r2' })],
    });
    const result = await h.queries.findAll('u1', { page: 1, limit: 10, status: 'REQUESTED', orderId: 'o1' });
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
    const h = setupRequest({ ...seed, returns: [returnRow({ status })] });
    const { data } = await h.service.cancel('u1', 'r1');
    expect(data.status).toBe('CANCELLED');
  });

  it.each(['RECEIVED', 'REFUNDED', 'REJECTED', 'CANCELLED'])('customer cannot cancel a %s return (1804)', async (status) => {
    const h = setupRequest({ ...seed, returns: [returnRow({ status })] });
    await expect(h.service.cancel('u1', 'r1')).rejects.toMatchObject({ response: { errorCode: 1804 } });
    expect(h.rows(ReturnRequest)[0].status).toBe(status);
  });

  it("cancelling someone else's return → 404 and unchanged", async () => {
    const h = setupRequest(seed);
    await expect(h.service.cancel('someone-else', 'r1')).rejects.toMatchObject({ status: 404, response: { errorCode: 1801 } });
    expect(h.rows(ReturnRequest)[0].status).toBe('REQUESTED');
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
});
