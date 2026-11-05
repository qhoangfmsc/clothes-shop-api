import { OrderQueryService } from './order-query.service';

describe('OrderQueryService.findOne — payment attempts and refunds for the customer', () => {
  const attempts = [
    {
      transferCode: 'DHNEW00000',
      amountVnd: 3_375_000,
      amountUsd: 135,
      status: 'PENDING',
      createdAt: new Date('2026-02-01'),
      expiresAt: new Date('2026-02-01T00:30:00Z'),
      paidAt: null,
      transactionRef: null,
    },
    {
      transferCode: 'DHOLD00000',
      amountVnd: 3_375_000,
      amountUsd: 135,
      status: 'EXPIRED',
      createdAt: new Date('2026-01-01'),
      expiresAt: new Date('2026-01-01T00:30:00Z'),
      paidAt: null,
      transactionRef: null,
    },
  ];
  const listedRefunds = [
    {
      amountVnd: 3_375_000,
      amountUsd: 135,
      status: 'COMPLETED',
      reason: 'ADMIN_CANCELLED',
      createdAt: new Date(),
      processedAt: new Date(),
      bankReference: 'FT1',
    },
  ];
  function make(order: any, listed: any[] = attempts, refunds: any[] = []) {
    const orderRepo: any = {
      findOne: jest.fn(async ({ where }: any) => (order && where.id === order.id && where.userId === order.userId ? order : null)),
    };
    const paymentService: any = { listAttemptsForCustomer: jest.fn(async () => listed) };
    const refundService: any = { listForCustomer: jest.fn(async () => refunds) };
    const service = new OrderQueryService(orderRepo, paymentService, refundService);
    return { service, orderRepo, paymentService, refundService };
  }
  const order = {
    id: 'o1',
    userId: 'u1',
    status: 'pending',
    subtotal: 3_000_000,
    shippingFee: 375_000,
    total: 3_375_000,
    exchangeRate: 25_000,
    items: [{ id: 'i1', price: 3_000_000 }],
  };

  it('returns the order with items, paymentAttempts (newest first, as given by the payment service) and refunds', async () => {
    const { service, paymentService, refundService } = make(order, attempts, listedRefunds);
    const { data } = await service.findOne('u1', 'o1');
    expect(data).toMatchObject({
      id: 'o1',
      totalVnd: 3_375_000,
      totalUsd: 135,
      subtotalVnd: 3_000_000,
      shippingFeeVnd: 375_000,
      exchangeRate: 25_000,
      items: [{ id: 'i1', priceVnd: 3_000_000, priceUsd: 120 }],
    });
    expect(data).not.toHaveProperty('total');
    expect(data.paymentAttempts).toEqual(attempts);
    expect(data.refunds).toEqual(listedRefunds);
    expect(paymentService.listAttemptsForCustomer).toHaveBeenCalledWith(order);
    expect(refundService.listForCustomer).toHaveBeenCalledWith(order);
  });

  it('loads each item with its current product, category and subcategory', async () => {
    const { service, orderRepo } = make(order, []);
    await service.findOne('u1', 'o1');
    expect(orderRepo.findOne.mock.calls[0][0].relations).toEqual([
      'items',
      'items.product',
      'items.product.category',
      'items.product.subcategory',
    ]);
  });

  it('returns empty arrays for an order that never had a payment session or a refund', async () => {
    const { service } = make(order, []);
    const { data } = await service.findOne('u1', 'o1');
    expect(data.paymentAttempts).toEqual([]);
    expect(data.refunds).toEqual([]);
  });

  it("404 for another user's order and never asks for its payment attempts or refunds", async () => {
    const { service, paymentService, refundService } = make(order);
    await expect(service.findOne('someone-else', 'o1')).rejects.toMatchObject({ status: 404 });
    await expect(service.findOne('u1', 'nope')).rejects.toMatchObject({ status: 404 });
    expect(paymentService.listAttemptsForCustomer).not.toHaveBeenCalled();
    expect(refundService.listForCustomer).not.toHaveBeenCalled();
  });
});

/** Huỷ đơn với thanh toán + hoàn tiền: dùng `RefundService` thật trên EntityManager giả trong bộ nhớ */
