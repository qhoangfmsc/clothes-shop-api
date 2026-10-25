import { Order } from './order.entity';
import { markOrderPaid, markOrderRefunded } from './order-payment-state.util';

const fakeManager = () => ({ update: jest.fn(async () => ({ affected: 1 })) });

describe('order payment state', () => {
  it('marks the order paid, then confirms it only if it is still pending', async () => {
    const manager = fakeManager();
    const paidAt = new Date('2026-10-24T01:00:00Z');

    await markOrderPaid(manager as never, 'o1', paidAt);

    expect(manager.update.mock.calls).toEqual([
      [Order, { id: 'o1' }, { paymentStatus: 'paid', paidAt }],
      [Order, { id: 'o1', status: 'pending' }, { status: 'confirmed' }],
    ]);
  });

  it('marks the order refunded', async () => {
    const manager = fakeManager();

    await markOrderRefunded(manager as never, 'o1');

    expect(manager.update.mock.calls).toEqual([[Order, { id: 'o1' }, { paymentStatus: 'refunded' }]]);
  });
});
