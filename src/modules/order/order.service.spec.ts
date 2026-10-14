import { BadRequestException } from '@nestjs/common';
import { In } from 'typeorm';
import { Address } from '../address/address.entity';
import { Cart } from '../cart/cart.entity';
import { CartItem } from '../cart/cart-item.entity';
import { PaymentService } from '../payment/payment.service';
import { createFakeManager } from '../payment/payment.test-utils';
import { PaymentAttempt } from '../payment/payment-attempt.entity';
import { Refund } from '../payment/refund.entity';
import { RefundService } from '../payment/refund.service';
import { DEFAULT_SHIPPING_CONFIG, ShippingConfig } from '../shipping/shipping-config';
import { Order } from './order.entity';
import { OrderService } from './order.service';

type Item = { id: string; productId: string; quantity: number; size: string; color: string; product: any };

const item = (id: string, price: number, quantity = 1, status = 'active', badge: string | null = null): Item => ({
  id,
  productId: `p-${id}`,
  quantity,
  size: 'M',
  color: 'black',
  product: { name: `Product ${id}`, price, status, badge, images: [] },
});

function setup(cartItems: Item[], shippingConfig: ShippingConfig = DEFAULT_SHIPPING_CONFIG, vndPerUnit: number | null = 25_000) {
  const deleted: any[] = [];
  const savedOrders: any[] = [];
  const savedItems: any[] = [];
  const manager = {
    findOne: jest.fn(async (entity: any, opts: any) => {
      if (entity === Cart) return { id: 'cart-1', userId: 'u1', items: cartItems };
      if (entity === Address)
        return {
          id: 'a1',
          userId: 'u1',
          fullName: 'N',
          phone: '1',
          addressLine1: 'x',
          addressLine2: '',
          city: 'c',
          province: 'p',
          postalCode: '1',
          country: 'VN',
        };
      if (entity === Order) return { ...savedOrders[0], items: savedItems };
      return null;
    }),
    create: jest.fn((_e: any, data: any) => ({ ...data })),
    save: jest.fn(async (data: any) => {
      if (Array.isArray(data)) {
        savedItems.push(...data);
        return data;
      }
      const o = { id: 'o1', ...data };
      savedOrders.push(o);
      return o;
    }),
    delete: jest.fn(async (entity: any, criteria: any) => {
      deleted.push({ entity, criteria });
    }),
  };
  const dataSource: any = { transaction: (cb: any) => cb(manager), manager };
  const shippingConfigService: any = { get: jest.fn(async () => shippingConfig) };
  const paymentConfigService: any = { getVndPerUnit: jest.fn(() => vndPerUnit) };
  const paymentService: any = { listAttemptsForCustomer: jest.fn(async () => []), cancelPendingAttempts: jest.fn(async () => undefined) };
  const service = new OrderService({} as any, dataSource, shippingConfigService, paymentConfigService, paymentService, {} as any);
  return { service, manager, deleted, savedOrders, savedItems, shippingConfigService, paymentService };
}

describe('OrderService.checkout', () => {
  const base = { addressId: 'a1' };

  it('orders only the selected items and removes only them from the cart', async () => {
    const { service, deleted, savedOrders, savedItems } = setup([item('1', 20), item('2', 30), item('3', 40)]);
    await service.checkout('u1', { ...base, cartItemIds: ['1', '3'] });

    expect(savedItems.map((i) => i.productId)).toEqual(['p-1', 'p-3']);
    expect(savedOrders[0]).toMatchObject({ subtotal: 60, shippingFee: 8, total: 68 });
    expect(deleted).toHaveLength(1);
    expect(deleted[0].entity).toBe(CartItem);
    expect(deleted[0].criteria).toEqual({ cartId: 'cart-1', id: In(['1', '3']) });
  });

  it('orders the whole cart when cartItemIds is omitted (regression)', async () => {
    const { service, deleted, savedItems } = setup([item('1', 20), item('2', 30), item('3', 40)]);
    await service.checkout('u1', base);

    expect(savedItems).toHaveLength(3);
    expect(deleted[0].criteria).toEqual({ cartId: 'cart-1', id: In(['1', '2', '3']) });
  });

  it('behaves like the whole cart when every id is sent', async () => {
    const { service, deleted, savedItems } = setup([item('1', 20), item('2', 30)]);
    await service.checkout('u1', { ...base, cartItemIds: ['2', '1'] });

    expect(savedItems).toHaveLength(2);
    expect(deleted[0].criteria.id).toEqual(In(['1', '2']));
  });

  it('computes free shipping on the selected subtotal, not the whole cart', async () => {
    const { service, savedOrders } = setup([item('1', 100), item('2', 100), item('3', 10)]);
    await service.checkout('u1', { ...base, cartItemIds: ['3'] });
    expect(savedOrders[0]).toMatchObject({ subtotal: 10, shippingFee: 8, total: 18 });
  });

  it('gives free shipping when the selected subtotal reaches the threshold', async () => {
    const { service, savedOrders } = setup([item('1', 100), item('2', 60), item('3', 10)]);
    await service.checkout('u1', { ...base, cartItemIds: ['1', '2'] });
    expect(savedOrders[0]).toMatchObject({ subtotal: 160, shippingFee: 0, total: 160 });
  });

  describe('shipping fee comes from the shipping config', () => {
    const config = (over: Partial<ShippingConfig> = {}, prices: Record<string, number> = {}): ShippingConfig => ({
      ...DEFAULT_SHIPPING_CONFIG,
      ...over,
      methods: DEFAULT_SHIPPING_CONFIG.methods.map((m) => ({ ...m, price: prices[m.id] ?? m.price })),
    });

    it.each([
      ['standard', 8],
      ['express', 15],
      ['store-pickup', 0],
    ])('defaults: %s costs %d', async (method, fee) => {
      const { service, savedOrders } = setup([item('1', 20)]);
      await service.checkout('u1', { ...base, shippingMethod: method });
      expect(savedOrders[0]).toMatchObject({ shippingFee: fee, shippingMethod: method, total: 20 + fee });
    });

    it('uses the configured price per method', async () => {
      const { service, savedOrders } = setup([item('1', 20)], config({}, { standard: 30000, express: 50000 }));
      await service.checkout('u1', { ...base, shippingMethod: 'express' });
      expect(savedOrders[0]).toMatchObject({ shippingFee: 50000, total: 50020 });
    });

    it('uses the configured free-shipping threshold (reached → free, below → paid)', async () => {
      const cfg = config({ freeShippingThreshold: 50 });
      const reached = setup([item('1', 50)], cfg);
      await reached.service.checkout('u1', base);
      expect(reached.savedOrders[0]).toMatchObject({ subtotal: 50, shippingFee: 0 });

      const below = setup([item('1', 49.99)], cfg);
      await below.service.checkout('u1', base);
      expect(below.savedOrders[0]).toMatchObject({ shippingFee: 8 });
    });

    it('never gives free shipping when the threshold is null', async () => {
      const { service, savedOrders } = setup([item('1', 1_000_000)], config({ freeShippingThreshold: null }));
      await service.checkout('u1', { ...base, shippingMethod: 'express' });
      expect(savedOrders[0]).toMatchObject({ subtotal: 1_000_000, shippingFee: 15 });
    });

    it('reads the config inside checkout (admin changes apply to the next order)', async () => {
      const { service, shippingConfigService } = setup([item('1', 20)]);
      await service.checkout('u1', base);
      expect(shippingConfigService.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('shipping method ↔ address / pickupContact', () => {
    const contact = { fullName: 'Nguyen Van A', phone: '0901234567' };
    const addressLookups = (manager: any) => manager.findOne.mock.calls.filter(([entity]: any[]) => entity === Address);

    it('store-pickup with pickupContact (no addressId) creates the order and snapshots only fullName + phone', async () => {
      const { service, manager, savedOrders } = setup([item('1', 20)]);
      await service.checkout('u1', { shippingMethod: 'store-pickup', pickupContact: contact });

      expect(savedOrders[0]).toMatchObject({ shippingMethod: 'store-pickup', shippingFee: 0, total: 20 });
      expect(savedOrders[0].shippingAddress).toEqual({ fullName: 'Nguyen Van A', phone: '0901234567' });
      expect(addressLookups(manager)).toHaveLength(0);
    });

    it('store-pickup with only addressId still works and keeps the full address snapshot (backward compatible)', async () => {
      const { service, savedOrders } = setup([item('1', 20)]);
      await service.checkout('u1', { shippingMethod: 'store-pickup', addressId: 'a1' });
      expect(savedOrders[0].shippingAddress).toMatchObject({ fullName: 'N', addressLine1: 'x', city: 'c', country: 'VN' });
    });

    it.each([
      ['store-pickup with neither addressId nor pickupContact', { shippingMethod: 'store-pickup' }, 1305],
      [
        'store-pickup with both addressId and pickupContact',
        { shippingMethod: 'store-pickup', addressId: 'a1', pickupContact: contact },
        1306,
      ],
      ['standard without addressId', { shippingMethod: 'standard' }, 1304],
      ['default method (standard) without addressId', {}, 1304],
      ['express without addressId', { shippingMethod: 'express' }, 1304],
      ['standard with pickupContact', { shippingMethod: 'standard', addressId: 'a1', pickupContact: contact }, 1306],
      ['express with only pickupContact', { shippingMethod: 'express', pickupContact: contact }, 1306],
      ['default method with only pickupContact', { pickupContact: contact }, 1306],
    ])('rejects %s with 400 and changes nothing', async (_name, dto, errorCode) => {
      const { service, manager, deleted } = setup([item('1', 20)]);
      await expect(service.checkout('u1', dto as any)).rejects.toMatchObject({ status: 400, response: { errorCode } });
      expect(manager.save).not.toHaveBeenCalled();
      expect(deleted).toHaveLength(0);
    });

    it('standard/express still return 404 for an address that does not belong to the user', async () => {
      const { service, manager } = setup([item('1', 20)]);
      const original = manager.findOne.getMockImplementation()!;
      manager.findOne.mockImplementation(async (entity: any, opts: any) => (entity === Address ? null : original(entity, opts)));
      await expect(service.checkout('u1', { addressId: 'someone-elses', shippingMethod: 'express' })).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('totals per method and threshold', () => {
    const config = (freeShippingThreshold: number | null): ShippingConfig => ({ ...DEFAULT_SHIPPING_CONFIG, freeShippingThreshold });
    const methods = [
      ['standard', 8],
      ['express', 15],
      ['store-pickup', 0],
    ] as const;

    it.each(methods)('%s: total = subtotal + method price below the threshold', async (method, price) => {
      const { service, savedOrders } = setup([item('1', 100)], config(150));
      await service.checkout('u1', { addressId: 'a1', shippingMethod: method });
      expect(savedOrders[0]).toMatchObject({ subtotal: 100, shippingFee: price, total: 100 + price });
    });

    it.each(methods)('%s: total = subtotal once the threshold is reached', async (method) => {
      const { service, savedOrders } = setup([item('1', 150)], config(150));
      await service.checkout('u1', { addressId: 'a1', shippingMethod: method });
      expect(savedOrders[0]).toMatchObject({ subtotal: 150, shippingFee: 0, total: 150 });
    });

    it.each(methods)('%s: threshold null is never free', async (method, price) => {
      const { service, savedOrders } = setup([item('1', 5000)], config(null));
      await service.checkout('u1', { addressId: 'a1', shippingMethod: method });
      expect(savedOrders[0]).toMatchObject({ shippingFee: price, total: 5000 + price });
    });
  });

  describe('quote', () => {
    const lines = () => [item('1', 20), item('2', 30), item('3', 40)];

    it('returns subtotal, fee, total, freeShipping and the threshold', async () => {
      const { service } = setup(lines());
      await expect(service.quote('u1', { shippingMethod: 'express' })).resolves.toEqual({
        data: {
          shippingMethod: 'express',
          subtotal: 90,
          shippingFee: 15,
          total: 105,
          freeShipping: false,
          freeShippingThreshold: 150,
          vndPerUnit: 25_000,
          amountVnd: 105 * 25_000,
        },
      });
    });

    it('defaults to standard and the whole cart', async () => {
      const { service } = setup(lines());
      await expect(service.quote('u1', {})).resolves.toMatchObject({
        data: { shippingMethod: 'standard', subtotal: 90, shippingFee: 8, total: 98 },
      });
    });

    it('flags freeShipping when the selected subtotal reaches the threshold (and respects cartItemIds)', async () => {
      const { service } = setup([item('1', 100), item('2', 60), item('3', 10)]);
      await expect(service.quote('u1', { cartItemIds: ['1', '2'] })).resolves.toMatchObject({
        data: { subtotal: 160, shippingFee: 0, total: 160, freeShipping: true },
      });
      await expect(service.quote('u1', { cartItemIds: ['3'] })).resolves.toMatchObject({
        data: { subtotal: 10, shippingFee: 8, freeShipping: false },
      });
    });

    it('store-pickup has a 0 price but is not "free shipping" below the threshold', async () => {
      const { service } = setup([item('1', 20)]);
      await expect(service.quote('u1', { shippingMethod: 'store-pickup' })).resolves.toMatchObject({
        data: { shippingFee: 0, total: 20, freeShipping: false },
      });
    });

    it('reports a null threshold and never frees shipping', async () => {
      const { service } = setup([item('1', 5000)], { ...DEFAULT_SHIPPING_CONFIG, freeShippingThreshold: null });
      await expect(service.quote('u1', {})).resolves.toMatchObject({
        data: { shippingFee: 8, freeShipping: false, freeShippingThreshold: null },
      });
    });

    it.each([
      ['standard', 8],
      ['express', 15],
      ['store-pickup', 0],
    ])('gives the same numbers as checkout for %s (single calculation)', async (method, _price) => {
      const q = await setup(lines()).service.quote('u1', { shippingMethod: method });
      const c = setup(lines());
      await c.service.checkout('u1', { addressId: 'a1', shippingMethod: method });
      expect(c.savedOrders[0]).toMatchObject({
        subtotal: q.data.subtotal,
        shippingFee: q.data.shippingFee,
        total: q.data.total,
        shippingMethod: q.data.shippingMethod,
      });
    });

    it('amountVnd = round(total × vndPerUnit), including the shipping fee', async () => {
      const { service } = setup([item('1', 120)]);
      await expect(service.quote('u1', { shippingMethod: 'express' })).resolves.toMatchObject({
        data: { total: 135, vndPerUnit: 25_000, amountVnd: 135 * 25_000 },
      });
      await expect(service.quote('u1', { shippingMethod: 'store-pickup' })).resolves.toMatchObject({
        data: { total: 120, amountVnd: 120 * 25_000 },
      });
    });

    it('rounds fractional VND to a whole number', async () => {
      const { service } = setup([item('1', 10.05)], DEFAULT_SHIPPING_CONFIG, 24_567.5);
      const { data } = await service.quote('u1', { shippingMethod: 'store-pickup' });
      expect(data.amountVnd).toBe(Math.round(10.05 * 24_567.5));
      expect(Number.isInteger(data.amountVnd)).toBe(true);
    });

    it('returns null VND fields (and does not fail) when PAYMENT_VND_PER_UNIT is not configured', async () => {
      const { service } = setup([item('1', 20)], DEFAULT_SHIPPING_CONFIG, null);
      await expect(service.quote('u1', {})).resolves.toMatchObject({
        data: { subtotal: 20, total: 28, vndPerUnit: null, amountVnd: null },
      });
    });

    it('quote.amountVnd equals the QR amount created for the order placed with the same input', async () => {
      const q = (await setup([item('1', 120)]).service.quote('u1', { shippingMethod: 'express' })).data;
      const c = setup([item('1', 120)]);
      await c.service.checkout('u1', { addressId: 'a1', shippingMethod: 'express' });

      const order = { id: 'o1', userId: 'u1', status: 'pending', paymentStatus: 'unpaid', total: String(c.savedOrders[0].total) };
      const paymentService = new PaymentService(
        { transaction: async (fn: any) => fn(createFakeManager({ orders: [order] })) } as any,
        {} as any,
        {} as any,
        {} as any,
        {
          getQrConfig: () => ({ bankCode: 'VCB', bankName: 'V', account: '1', accountName: 'D', prefix: 'DH', vndPerUnit: 25_000 }),
        } as any,
      );
      const { data } = await paymentService.createQr('u1', { orderId: 'o1' });
      expect(q.amountVnd).toBe(data.amount);
    });

    it('rounds money to 2 decimals (no floating-point noise) so quote, saved order and QR amount agree', async () => {
      const lines = [item('1', 0.1, 3)]; // 0.1 × 3 = 0.30000000000000004 in floating point
      const q = (await setup(lines, DEFAULT_SHIPPING_CONFIG).service.quote('u1', { shippingMethod: 'store-pickup' })).data;
      expect(q).toMatchObject({ subtotal: 0.3, total: 0.3, amountVnd: Math.round(0.3 * 25_000) });

      const c = setup(lines);
      await c.service.checkout('u1', { addressId: 'a1', shippingMethod: 'store-pickup' });
      expect(c.savedOrders[0]).toMatchObject({ subtotal: 0.3, shippingFee: 0, total: 0.3 });

      const withFee = (await setup([item('1', 10.1, 1), item('2', 0.2, 1)]).service.quote('u1', {})).data; // 10.1 + 0.2 + 8
      expect(withFee).toMatchObject({ subtotal: 10.3, total: 18.3 });
    });

    it('has no side effects: creates no order and removes nothing from the cart', async () => {
      const { service, manager, deleted, savedOrders, savedItems } = setup(lines());
      await service.quote('u1', { shippingMethod: 'express', cartItemIds: ['1', '2'] });
      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.create).not.toHaveBeenCalled();
      expect(deleted).toHaveLength(0);
      expect(savedOrders).toHaveLength(0);
      expect(savedItems).toHaveLength(0);
    });

    it('validates like checkout: unknown ids, empty cart, inactive and non-orderable products', async () => {
      await expect(setup(lines()).service.quote('u1', { cartItemIds: ['1', 'nope'] })).rejects.toBeInstanceOf(BadRequestException);
      await expect(setup([]).service.quote('u1', {})).rejects.toBeInstanceOf(BadRequestException);
      await expect(setup([item('1', 20, 1, 'disabled')]).service.quote('u1', {})).rejects.toBeInstanceOf(BadRequestException);
      await expect(setup([item('1', 20, 1, 'active', 'sold_out')]).service.quote('u1', {})).rejects.toMatchObject({
        response: { errorCode: 1303 },
      });
    });
  });

  it('payment: an express order produces a QR amount of (subtotal + express fee) × PAYMENT_VND_PER_UNIT', async () => {
    const { service, savedOrders } = setup([item('1', 120)]);
    await service.checkout('u1', { addressId: 'a1', shippingMethod: 'express' });
    expect(savedOrders[0]).toMatchObject({ subtotal: 120, shippingFee: 15, total: 135 });

    const order = { id: 'o1', userId: 'u1', status: 'pending', paymentStatus: 'unpaid', total: String(savedOrders[0].total) };
    const manager = createFakeManager({ orders: [order] });
    const paymentService = new PaymentService(
      { transaction: async (fn: any) => fn(manager) } as any,
      {} as any,
      {} as any,
      {} as any,
      {
        getQrConfig: () => ({
          bankCode: 'VCB',
          bankName: 'Vietcombank',
          account: '0010000000355',
          accountName: 'DOOVAN',
          prefix: 'DH',
          vndPerUnit: 25_000,
        }),
      } as any,
    );
    const { data } = await paymentService.createQr('u1', { orderId: 'o1' });
    expect(data.amount).toBe((120 + 15) * 25_000);
  });

  it.each([
    ['an id of another user / unknown id', ['1', 'other-user-item']],
    ['only unknown ids', ['nope']],
  ])('rejects %s with 400 and changes nothing', async (_name, ids) => {
    const { service, manager, deleted } = setup([item('1', 20), item('2', 30)]);
    await expect(service.checkout('u1', { ...base, cartItemIds: ids })).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
    expect(deleted).toHaveLength(0);
  });

  it('rejects when a selected product is inactive', async () => {
    const { service } = setup([item('1', 20), item('2', 30, 1, 'disabled')]);
    await expect(service.checkout('u1', { ...base, cartItemIds: ['1', '2'] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ignores inactive products that are not selected', async () => {
    const { service, savedItems } = setup([item('1', 20), item('2', 30, 1, 'disabled')]);
    await service.checkout('u1', { ...base, cartItemIds: ['1'] });
    expect(savedItems).toHaveLength(1);
  });

  it.each(['sold_out', 'custom_order'])('rejects a selected %s product with error 1303 and changes nothing', async (badge) => {
    const { service, manager, deleted } = setup([item('1', 20), item('2', 30, 1, 'active', badge)]);
    await expect(service.checkout('u1', { ...base, cartItemIds: ['1', '2'] })).rejects.toMatchObject({
      status: 400,
      response: { errorCode: 1303, message: expect.stringContaining('Product 2') },
    });
    expect(manager.save).not.toHaveBeenCalled();
    expect(deleted).toHaveLength(0);
  });

  it('rejects the whole-cart checkout when the cart holds a sold_out product', async () => {
    const { service } = setup([item('1', 20), item('2', 30, 1, 'active', 'sold_out')]);
    await expect(service.checkout('u1', base)).rejects.toMatchObject({ response: { errorCode: 1303 } });
  });

  it('ignores sold_out / custom_order products that are not selected', async () => {
    const { service, savedItems } = setup([item('1', 20), item('2', 30, 1, 'active', 'custom_order')]);
    await service.checkout('u1', { ...base, cartItemIds: ['1'] });
    expect(savedItems.map((i) => i.productId)).toEqual(['p-1']);
  });

  it.each(['new', 'sale', 'bestseller', 'limited'])('still orders a %s product', async (badge) => {
    const { service, savedItems } = setup([item('1', 20, 1, 'active', badge)]);
    await service.checkout('u1', base);
    expect(savedItems).toHaveLength(1);
  });

  it('still rejects an empty cart', async () => {
    const { service } = setup([]);
    await expect(service.checkout('u1', base)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('OrderService.findOne — payment attempts and refunds for the customer', () => {
  const attempts = [
    {
      transferCode: 'DHNEW00000',
      amount: 3_375_000,
      status: 'PENDING',
      createdAt: new Date('2026-02-01'),
      expiresAt: new Date('2026-02-01T00:30:00Z'),
      paidAt: null,
      transactionRef: null,
    },
    {
      transferCode: 'DHOLD00000',
      amount: 3_375_000,
      status: 'EXPIRED',
      createdAt: new Date('2026-01-01'),
      expiresAt: new Date('2026-01-01T00:30:00Z'),
      paidAt: null,
      transactionRef: null,
    },
  ];
  const listedRefunds = [
    {
      amount: 3_375_000,
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
    const service = new OrderService(orderRepo, {} as any, {} as any, {} as any, paymentService, refundService);
    return { service, orderRepo, paymentService, refundService };
  }
  const order = { id: 'o1', userId: 'u1', status: 'pending', total: '135.00', items: [{ id: 'i1' }] };

  it('returns the order with items, paymentAttempts (newest first, as given by the payment service) and refunds', async () => {
    const { service, paymentService, refundService } = make(order, attempts, listedRefunds);
    const { data } = await service.findOne('u1', 'o1');
    expect(data).toMatchObject({ id: 'o1', total: '135.00', items: [{ id: 'i1' }] });
    expect(data.paymentAttempts).toEqual(attempts);
    expect(data.refunds).toEqual(listedRefunds);
    expect(paymentService.listAttemptsForCustomer).toHaveBeenCalledWith(order);
    expect(refundService.listForCustomer).toHaveBeenCalledWith('o1');
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
describe('OrderService cancel rules with payments and refunds', () => {
  const paidAttempt = { id: 'att-paid', orderId: 'o1', status: 'PAID', amount: 3_375_000, transferCode: 'DHPAID0000', paidAt: new Date() };
  const base = { id: 'o1', userId: 'u1', status: 'pending', paymentStatus: 'unpaid', items: [] };

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
    const refundService = new RefundService(dataSource, refundRepo, {} as any);
    const service = new OrderService(orderRepo, dataSource, {} as any, {} as any, paymentService, refundService);
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
