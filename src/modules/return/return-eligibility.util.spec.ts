import { computeReturnEligibility } from './return-eligibility.util';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-03-31T00:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);
const items = [
  { id: 'i1', quantity: 2 },
  { id: 'i2', quantity: 1 },
];
const delivered = { paymentStatus: 'paid', status: 'delivered', deliveredAt: daysAgo(5) };
const run = (over: Record<string, any> = {}, active = new Map<string, number>(), days = 30) =>
  computeReturnEligibility({ order: { ...delivered, ...over }, items, activeQuantities: active, returnWindowDays: days, now });

describe('computeReturnEligibility', () => {
  it('a paid delivered order inside the window is eligible, with deadline and per-item returnable quantity', () => {
    const result = run();
    expect(result).toMatchObject({ eligible: true, reason: null, returnWindowDays: 30 });
    expect(result.deadline).toEqual(new Date(daysAgo(5).getTime() + 30 * DAY));
    expect(result.items).toEqual([
      { orderItemId: 'i1', quantity: 2, returnableQuantity: 2 },
      { orderItemId: 'i2', quantity: 1, returnableQuantity: 1 },
    ]);
  });

  it('completed orders are returnable too', () => {
    expect(run({ status: 'completed' }).eligible).toBe(true);
  });

  it.each(['pending', 'confirmed', 'shipping', 'cancelled'])('an order that is %s cannot be returned yet', (status) => {
    expect(run({ status })).toMatchObject({ eligible: false, reason: 'ORDER_NOT_DELIVERED' });
  });

  it('a delivered order without delivered_at (should not exist) is treated as not delivered', () => {
    expect(run({ deliveredAt: null })).toMatchObject({ eligible: false, reason: 'ORDER_NOT_DELIVERED', deadline: null });
  });

  it.each(['unpaid', 'refunded'])('a %s order is not returnable', (paymentStatus) => {
    expect(run({ paymentStatus })).toMatchObject({ eligible: false, reason: 'ORDER_NOT_PAID' });
  });

  it('the window is measured from delivery, using the configured number of days (boundary inclusive)', () => {
    expect(run({ deliveredAt: daysAgo(30) }).eligible).toBe(true);
    expect(run({ deliveredAt: new Date(daysAgo(30).getTime() - 1) })).toMatchObject({ eligible: false, reason: 'RETURN_WINDOW_EXPIRED' });
    expect(run({ deliveredAt: daysAgo(10) }, new Map(), 7)).toMatchObject({
      eligible: false,
      reason: 'RETURN_WINDOW_EXPIRED',
      returnWindowDays: 7,
    });
  });

  it('subtracts quantities already covered by active requests; nothing left → not eligible', () => {
    const partial = run({}, new Map([['i1', 1]]));
    expect(partial.eligible).toBe(true);
    expect(partial.items.find((i) => i.orderItemId === 'i1')?.returnableQuantity).toBe(1);

    const all = run(
      {},
      new Map([
        ['i1', 2],
        ['i2', 1],
      ]),
    );
    expect(all).toMatchObject({ eligible: false, reason: 'NOTHING_TO_RETURN' });
    expect(all.items.every((i) => i.returnableQuantity === 0)).toBe(true);
  });

  it('never reports a negative returnable quantity', () => {
    expect(run({}, new Map([['i2', 5]])).items.find((i) => i.orderItemId === 'i2')?.returnableQuantity).toBe(0);
  });
});
