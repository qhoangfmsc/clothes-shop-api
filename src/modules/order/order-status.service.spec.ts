import { createFakeManager } from '../payment/shared/payment.test-utils';
import { PaymentAttempt } from '../payment/shared/payment-attempt.entity';
import { Refund } from '../refund/refund.entity';
import { RefundService } from '../refund/refund.service';
import { RefundQueryService } from '../refund/refund-query.service';
import { Order } from './order.entity';
import { OrderQueryService } from './order-query.service';
import { OrderStatusService } from './order-status.service';

describe('OrderStatusService cancel rules with payments and refunds', () => {
  const paidAttempt = { id: 'att-paid', orderId: 'o1', status: 'PAID', amount: 3_375_000, transferCode: 'DHPAID0000', paidAt: new Date() };
  const base = {
    id: 'o1',
    userId: 'u1',
    status: 'pending',
    paymentStatus: 'unpaid',
    subtotal: 3_375_000,
    shippingFee: 0,
    total: 3_375_000,
    exchangeRate: 25_000,
    items: [],
  };

  function make(order: any, seed: { attempts?: any[]; refunds?: any[] } = {}) {
    const manager = createFakeManager({ orders: [{ ...order }], attempts: seed.attempts ?? [], refunds: seed.refunds ?? [] });
    const dataSource: any = { transaction: (cb: any) => cb(manager) };
    const orderRepo: any = {
      findOne: jest.fn(async ({ where }: any) => {
        const row = manager.tables.get(Order)!.find((o) => o.id === where.id && (!where.userId || o.userId === where.userId));
        return row ?? null;
      }),
    };
    const paymentService: any = {
      listAttemptsForCustomer: jest.fn(async () => []),
      cancelPendingAttempts: jest.fn(async (orderId: string, m: any) =>
        m.update(PaymentAttempt, { orderId, status: 'PENDING' }, { status: 'CANCELLED' }),
      ),
    };
    const refundRepo: any = { find: (opts: any) => manager.find(Refund, opts) };
    const refundQueries = new RefundQueryService(refundRepo, {} as any);
    const refundService = new RefundService(dataSource, refundRepo, refundQueries);
    const service = new OrderStatusService(
      dataSource,
      paymentService,
      refundService,
      new OrderQueryService(orderRepo, paymentService, refundQueries),
    );
    const row = () => manager.tables.get(Order)![0];
    const refunds = () => manager.tables.get(Refund)!;
    return { service, manager, paymentService, row, refunds };
  }

  it('customer cancels an unpaid pending order: its pending payment codes are cancelled and no refund is created', async () => {
    const pending = { id: 'att-1', orderId: 'o1', status: 'PENDING', amount: 1, transferCode: 'DHAAAAAAAA' };
    const { service, paymentService, refunds, manager } = make({ ...base }, { attempts: [pending] });
    const { data } = await service.cancel('u1', 'o1');
    expect(data.status).toBe('cancelled');
    expect(data.refunds).toEqual([]);
    expect(pending.status).toBe('CANCELLED');
    expect(paymentService.cancelPendingAttempts).toHaveBeenCalledWith('o1', manager);
    expect(refunds()).toHaveLength(0);
  });

  it.each([
    'pending',
    'confirmed',
    'shipping',
    'delivered',
    'completed',
  ])('customer cannot cancel a paid order, whatever its status (%s) → 1307; nothing changes, no refund', async (status) => {
    const { service, row, refunds, paymentService } = make({ ...base, status, paymentStatus: 'paid' }, { attempts: [paidAttempt] });
    await expect(service.cancel('u1', 'o1')).rejects.toMatchObject({ status: 400, response: { errorCode: 1307 } });
    expect(row().status).toBe(status);
    expect(row().paymentStatus).toBe('paid');
    expect(refunds()).toHaveLength(0);
    expect(paymentService.cancelPendingAttempts).not.toHaveBeenCalled();
  });

  it.each([
    'paid',
    'refunded',
  ])('cancelling an already cancelled %s order is a plain 400 and creates no second refund', async (paymentStatus) => {
    const { service, refunds } = make({ ...base, status: 'cancelled', paymentStatus }, { attempts: [paidAttempt] });
    await expect(service.cancel('u1', 'o1')).rejects.toMatchObject({ status: 400 });
    expect(refunds()).toHaveLength(0);
  });

  it('customer still gets the plain error for an unpaid order that already moved on', async () => {
    const { service, row } = make({ ...base, status: 'confirmed' });
    await expect(service.cancel('u1', 'o1')).rejects.toMatchObject({ status: 400 });
    expect(row().status).toBe('confirmed');
  });

  it("404 for another user's order and nothing changes", async () => {
    const { service, row, refunds } = make({ ...base, status: 'confirmed', paymentStatus: 'paid' }, { attempts: [paidAttempt] });
    await expect(service.cancel('someone-else', 'o1')).rejects.toMatchObject({ status: 404 });
    expect(row().status).toBe('confirmed');
    expect(refunds()).toHaveLength(0);
  });

  it('admin cancelling a paid order that has no paid payment session is refused (1712) and its status is untouched', async () => {
    const { service, row } = make({ ...base, status: 'confirmed', paymentStatus: 'paid' }, { attempts: [] });
    await expect(service.updateStatus('admin-1', 'o1', { status: 'cancelled' })).rejects.toMatchObject({ response: { errorCode: 1712 } });
    expect(row().status).toBe('confirmed');
  });

  it('admin cancelling a paid order creates the refund request (ADMIN_CANCELLED, requested by that admin)', async () => {
    const { service, row, refunds } = make({ ...base, status: 'confirmed', paymentStatus: 'paid' }, { attempts: [paidAttempt] });
    await service.updateStatus('admin-1', 'o1', { status: 'cancelled' });
    expect(row().status).toBe('cancelled');
    expect(refunds()).toEqual([
      expect.objectContaining({ amount: 3_375_000, status: 'REQUESTED', reason: 'ADMIN_CANCELLED', requestedBy: 'admin-1' }),
    ]);
  });

  it('admin moving an unpaid order to cancelled cancels its pending payment codes and creates no refund; other transitions do neither', async () => {
    const cancelled = make({ ...base });
    await cancelled.service.updateStatus('admin-1', 'o1', { status: 'cancelled' });
    expect(cancelled.paymentService.cancelPendingAttempts).toHaveBeenCalledWith('o1', cancelled.manager);
    expect(cancelled.refunds()).toHaveLength(0);

    const confirmed = make({ ...base, paymentStatus: 'paid' }, { attempts: [paidAttempt] });
    await confirmed.service.updateStatus('admin-1', 'o1', { status: 'confirmed' });
    expect(confirmed.row().status).toBe('confirmed');
    expect(confirmed.paymentService.cancelPendingAttempts).not.toHaveBeenCalled();
    expect(confirmed.refunds()).toHaveLength(0);
  });

  it('admin cannot cancel once shipping (no refund is created by an invalid transition)', async () => {
    const { service, row, refunds } = make({ ...base, status: 'shipping', paymentStatus: 'paid' }, { attempts: [paidAttempt] });
    await expect(service.updateStatus('admin-1', 'o1', { status: 'cancelled' })).rejects.toMatchObject({ response: { errorCode: 1302 } });
    expect(row().status).toBe('shipping');
    expect(refunds()).toHaveLength(0);
  });

  it('admin: unknown order → 1301', async () => {
    const { service } = make({ ...base });
    await expect(service.updateStatus('admin-1', 'nope', { status: 'confirmed' })).rejects.toMatchObject({ response: { errorCode: 1301 } });
  });

  it('moving an order to delivered stamps delivered_at (the start of the return window); other statuses do not', async () => {
    const delivered = make({ ...base, status: 'shipping' });
    await delivered.service.updateStatus('admin-1', 'o1', { status: 'delivered' });
    expect(delivered.row().status).toBe('delivered');
    expect(delivered.row().deliveredAt).toBeInstanceOf(Date);

    const shipping = make({ ...base, status: 'confirmed' });
    await shipping.service.updateStatus('admin-1', 'o1', { status: 'shipping' });
    expect(shipping.row().deliveredAt).toBeUndefined();

    // completed giữ nguyên mốc đã giao
    const stamp = new Date('2026-01-01');
    const completed = make({ ...base, status: 'delivered', deliveredAt: stamp });
    await completed.service.updateStatus('admin-1', 'o1', { status: 'completed' });
    expect(completed.row().deliveredAt).toBe(stamp);
  });
});
