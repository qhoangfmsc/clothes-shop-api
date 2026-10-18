import { presentOrder } from './order.presenter';

const order = {
  id: 'o1',
  status: 'pending',
  subtotal: 900_000,
  shippingFee: 50_000,
  total: 950_000,
  exchangeRate: 25_000,
  items: [{ id: 'i1', productName: 'A', price: 450_000, quantity: 2 }],
};

describe('presentOrder', () => {
  it('turns every amount into Vnd/Usd (items included) using the rate frozen on the order', () => {
    const out = presentOrder(order);
    expect(out).toMatchObject({
      id: 'o1',
      subtotalVnd: 900_000,
      subtotalUsd: 36,
      shippingFeeVnd: 50_000,
      shippingFeeUsd: 2,
      totalVnd: 950_000,
      totalUsd: 38,
      exchangeRate: 25_000,
      items: [{ id: 'i1', productName: 'A', priceVnd: 450_000, priceUsd: 18, quantity: 2 }],
    });
    for (const key of ['subtotal', 'shippingFee', 'total']) expect(out).not.toHaveProperty(key);
    expect(out.items?.[0]).not.toHaveProperty('price');
  });

  it('USD of an old order does not move with today’s rate: it follows order.exchangeRate', () => {
    expect(presentOrder({ ...order, exchangeRate: 20_000 })).toMatchObject({ totalVnd: 950_000, totalUsd: 47.5 });
  });

  it('works for orders loaded without items', () => {
    const { items, ...withoutItems } = order;
    const out = presentOrder(withoutItems);
    expect(out).toMatchObject({ totalVnd: 950_000 });
    expect(out).not.toHaveProperty('items');
  });
});
