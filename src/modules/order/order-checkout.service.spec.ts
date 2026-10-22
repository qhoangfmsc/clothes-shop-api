import { EOrderErrorCode } from '@common/exceptions/error-codes';
import { In } from 'typeorm';
import { Address } from '../address/address.entity';
import { Cart } from '../cart/cart.entity';
import { CartItem } from '../cart/cart-item.entity';
import { PaymentService } from '../payment/payment.service';
import { createFakeManager } from '../payment/payment.test-utils';
import { DEFAULT_SHIPPING_CONFIG, ShippingConfig } from '../shipping/shipping-config';
import { Order } from './order.entity';
import { OrderCheckoutService } from './order-checkout.service';

/** Lỗi `throwAppError` mặc định: HTTP 400 kèm `errorCode` */
const rejection = (errorCode: number) => ({ status: 400, response: { errorCode } });

type Item = { id: string; productId: string; quantity: number; size: string; color: string; product: any };

/** `price` là giá VND của sản phẩm (số nguyên) */
const item = (id: string, price: number, quantity = 1, status = 'active', badge: string | null = null): Item => ({
  id,
  productId: `p-${id}`,
  quantity,
  size: 'M',
  color: 'black',
  product: { name: `Product ${id}`, price, status, badge, images: [] },
});

// Mặc định (DEFAULT_SHIPPING_CONFIG): standard 30 000, express 50 000, store-pickup 0; miễn phí ship từ 1 500 000
function setup(cartItems: Item[], shippingConfig: ShippingConfig = DEFAULT_SHIPPING_CONFIG, vndPerUsd = 25_000) {
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
  const currencyService: any = { getVndPerUsd: jest.fn(async () => vndPerUsd) };
  const service = new OrderCheckoutService(dataSource, shippingConfigService, currencyService);
  return { service, manager, deleted, savedOrders, savedItems, shippingConfigService, currencyService };
}

describe('OrderCheckoutService.checkout', () => {
  const base = { addressId: 'a1' };

  it('orders only the selected items and removes only them from the cart', async () => {
    const { service, deleted, savedOrders, savedItems } = setup([item('1', 200_000), item('2', 300_000), item('3', 400_000)]);
    await service.checkout('u1', { ...base, cartItemIds: ['1', '3'] });

    expect(savedItems.map((i) => i.productId)).toEqual(['p-1', 'p-3']);
    expect(savedOrders[0]).toMatchObject({ subtotal: 600_000, shippingFee: 30_000, total: 630_000 });
    expect(deleted).toHaveLength(1);
    expect(deleted[0].entity).toBe(CartItem);
    expect(deleted[0].criteria).toEqual({ cartId: 'cart-1', id: In(['1', '3']) });
  });

  it('orders the whole cart when cartItemIds is omitted (regression)', async () => {
    const { service, deleted, savedItems } = setup([item('1', 200_000), item('2', 300_000), item('3', 400_000)]);
    await service.checkout('u1', base);

    expect(savedItems).toHaveLength(3);
    expect(deleted[0].criteria).toEqual({ cartId: 'cart-1', id: In(['1', '2', '3']) });
  });

  it('behaves like the whole cart when every id is sent', async () => {
    const { service, deleted, savedItems } = setup([item('1', 200_000), item('2', 300_000)]);
    await service.checkout('u1', { ...base, cartItemIds: ['2', '1'] });

    expect(savedItems).toHaveLength(2);
    expect(deleted[0].criteria.id).toEqual(In(['1', '2']));
  });

  it('computes free shipping on the selected subtotal, not the whole cart', async () => {
    const { service, savedOrders } = setup([item('1', 1_000_000), item('2', 1_000_000), item('3', 100_000)]);
    await service.checkout('u1', { ...base, cartItemIds: ['3'] });
    expect(savedOrders[0]).toMatchObject({ subtotal: 100_000, shippingFee: 30_000, total: 130_000 });
  });

  it('gives free shipping when the selected subtotal reaches the threshold', async () => {
    const { service, savedOrders } = setup([item('1', 1_000_000), item('2', 600_000), item('3', 100_000)]);
    await service.checkout('u1', { ...base, cartItemIds: ['1', '2'] });
    expect(savedOrders[0]).toMatchObject({ subtotal: 1_600_000, shippingFee: 0, total: 1_600_000 });
  });

  it('freezes the current exchange rate on the order and returns every amount in VND and USD', async () => {
    const { service, savedOrders, savedItems } = setup([item('1', 500_000, 2)], DEFAULT_SHIPPING_CONFIG, 26_000);
    const { data } = await service.checkout('u1', { ...base, shippingMethod: 'express' });

    expect(savedOrders[0]).toMatchObject({ subtotal: 1_000_000, shippingFee: 50_000, total: 1_050_000, exchangeRate: 26_000 });
    expect(savedItems[0]).toMatchObject({ price: 500_000, quantity: 2 });
    expect(data).toMatchObject({
      subtotalVnd: 1_000_000,
      subtotalUsd: 38.46,
      shippingFeeVnd: 50_000,
      shippingFeeUsd: 1.92,
      totalVnd: 1_050_000,
      totalUsd: 40.38,
      exchangeRate: 26_000,
      items: [{ productId: 'p-1', priceVnd: 500_000, priceUsd: 19.23, quantity: 2 }],
    });
    // Không còn field tiền không có đơn vị
    for (const key of ['subtotal', 'shippingFee', 'total']) expect(data).not.toHaveProperty(key);
    expect(data.items?.[0]).not.toHaveProperty('price');
  });

  describe('shipping fee comes from the shipping config', () => {
    const config = (over: Partial<ShippingConfig> = {}, prices: Record<string, number> = {}): ShippingConfig => ({
      ...DEFAULT_SHIPPING_CONFIG,
      ...over,
      methods: DEFAULT_SHIPPING_CONFIG.methods.map((m) => ({ ...m, priceVnd: prices[m.id] ?? m.priceVnd })),
    });

    it.each([
      ['standard', 30_000],
      ['express', 50_000],
      ['store-pickup', 0],
    ])('defaults: %s costs %d', async (method, fee) => {
      const { service, savedOrders } = setup([item('1', 200_000)]);
      await service.checkout('u1', { ...base, shippingMethod: method });
      expect(savedOrders[0]).toMatchObject({ shippingFee: fee, shippingMethod: method, total: 200_000 + fee });
    });

    it('uses the configured price per method', async () => {
      const { service, savedOrders } = setup([item('1', 200_000)], config({}, { standard: 35_000, express: 60_000 }));
      await service.checkout('u1', { ...base, shippingMethod: 'express' });
      expect(savedOrders[0]).toMatchObject({ shippingFee: 60_000, total: 260_000 });
    });

    it('uses the configured free-shipping threshold (reached → free, below → paid)', async () => {
      const cfg = config({ freeShippingThresholdVnd: 500_000 });
      const reached = setup([item('1', 500_000)], cfg);
      await reached.service.checkout('u1', base);
      expect(reached.savedOrders[0]).toMatchObject({ subtotal: 500_000, shippingFee: 0 });

      const below = setup([item('1', 499_999)], cfg);
      await below.service.checkout('u1', base);
      expect(below.savedOrders[0]).toMatchObject({ shippingFee: 30_000 });
    });

    it('never gives free shipping when the threshold is null', async () => {
      const { service, savedOrders } = setup([item('1', 1_000_000_000)], config({ freeShippingThresholdVnd: null }));
      await service.checkout('u1', { ...base, shippingMethod: 'express' });
      expect(savedOrders[0]).toMatchObject({ subtotal: 1_000_000_000, shippingFee: 50_000 });
    });

    it('reads the config inside checkout (admin changes apply to the next order)', async () => {
      const { service, shippingConfigService } = setup([item('1', 200_000)]);
      await service.checkout('u1', base);
      expect(shippingConfigService.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('shipping method ↔ address / pickupContact', () => {
    const contact = { fullName: 'Nguyen Van A', phone: '0901234567' };
    const addressLookups = (manager: any) => manager.findOne.mock.calls.filter(([entity]: any[]) => entity === Address);

    it('store-pickup with pickupContact (no addressId) creates the order and snapshots only fullName + phone', async () => {
      const { service, manager, savedOrders } = setup([item('1', 200_000)]);
      await service.checkout('u1', { shippingMethod: 'store-pickup', pickupContact: contact });

      expect(savedOrders[0]).toMatchObject({ shippingMethod: 'store-pickup', shippingFee: 0, total: 200_000 });
      expect(savedOrders[0].shippingAddress).toEqual({ fullName: 'Nguyen Van A', phone: '0901234567' });
      expect(addressLookups(manager)).toHaveLength(0);
    });

    it('store-pickup with only addressId still works and keeps the full address snapshot (backward compatible)', async () => {
      const { service, savedOrders } = setup([item('1', 200_000)]);
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
      const { service, manager, deleted } = setup([item('1', 200_000)]);
      await expect(service.checkout('u1', dto as any)).rejects.toMatchObject({ status: 400, response: { errorCode } });
      expect(manager.save).not.toHaveBeenCalled();
      expect(deleted).toHaveLength(0);
    });

    it('standard/express still return 404 for an address that does not belong to the user', async () => {
      const { service, manager } = setup([item('1', 200_000)]);
      const original = manager.findOne.getMockImplementation()!;
      manager.findOne.mockImplementation(async (entity: any, opts: any) => (entity === Address ? null : original(entity, opts)));
      await expect(service.checkout('u1', { addressId: 'someone-elses', shippingMethod: 'express' })).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('totals per method and threshold', () => {
    const config = (freeShippingThresholdVnd: number | null): ShippingConfig => ({ ...DEFAULT_SHIPPING_CONFIG, freeShippingThresholdVnd });
    const methods = [
      ['standard', 30_000],
      ['express', 50_000],
      ['store-pickup', 0],
    ] as const;

    it.each(methods)('%s: total = subtotal + method price below the threshold', async (method, price) => {
      const { service, savedOrders } = setup([item('1', 1_000_000)], config(1_500_000));
      await service.checkout('u1', { addressId: 'a1', shippingMethod: method });
      expect(savedOrders[0]).toMatchObject({ subtotal: 1_000_000, shippingFee: price, total: 1_000_000 + price });
    });

    it.each(methods)('%s: total = subtotal once the threshold is reached', async (method) => {
      const { service, savedOrders } = setup([item('1', 1_500_000)], config(1_500_000));
      await service.checkout('u1', { addressId: 'a1', shippingMethod: method });
      expect(savedOrders[0]).toMatchObject({ subtotal: 1_500_000, shippingFee: 0, total: 1_500_000 });
    });

    it.each(methods)('%s: threshold null is never free', async (method, price) => {
      const { service, savedOrders } = setup([item('1', 50_000_000)], config(null));
      await service.checkout('u1', { addressId: 'a1', shippingMethod: method });
      expect(savedOrders[0]).toMatchObject({ shippingFee: price, total: 50_000_000 + price });
    });

    it('sums whole VND exactly (price × quantity over several lines, no rounding step)', async () => {
      const { service, savedOrders } = setup([item('1', 33_333, 3), item('2', 12_345, 7)], config(null));
      await service.checkout('u1', { addressId: 'a1', shippingMethod: 'store-pickup' });
      expect(savedOrders[0]).toMatchObject({ subtotal: 33_333 * 3 + 12_345 * 7, total: 33_333 * 3 + 12_345 * 7 });
      expect(Number.isInteger(savedOrders[0].total)).toBe(true);
    });
  });

  describe('quote', () => {
    const lines = () => [item('1', 200_000), item('2', 300_000), item('3', 400_000)];

    it('returns subtotal, fee, total in VND and USD, freeShipping, the threshold and the rate used', async () => {
      const { service } = setup(lines());
      await expect(service.quote('u1', { shippingMethod: 'express' })).resolves.toEqual({
        data: {
          shippingMethod: 'express',
          subtotalVnd: 900_000,
          subtotalUsd: 36,
          shippingFeeVnd: 50_000,
          shippingFeeUsd: 2,
          totalVnd: 950_000,
          totalUsd: 38,
          freeShipping: false,
          freeShippingThresholdVnd: 1_500_000,
          freeShippingThresholdUsd: 60,
          exchangeRate: 25_000,
        },
      });
    });

    it('defaults to standard and the whole cart', async () => {
      const { service } = setup(lines());
      await expect(service.quote('u1', {})).resolves.toMatchObject({
        data: { shippingMethod: 'standard', subtotalVnd: 900_000, shippingFeeVnd: 30_000, totalVnd: 930_000 },
      });
    });

    it('flags freeShipping when the selected subtotal reaches the threshold (and respects cartItemIds)', async () => {
      const { service } = setup([item('1', 1_000_000), item('2', 600_000), item('3', 100_000)]);
      await expect(service.quote('u1', { cartItemIds: ['1', '2'] })).resolves.toMatchObject({
        data: { subtotalVnd: 1_600_000, shippingFeeVnd: 0, totalVnd: 1_600_000, freeShipping: true },
      });
      await expect(service.quote('u1', { cartItemIds: ['3'] })).resolves.toMatchObject({
        data: { subtotalVnd: 100_000, shippingFeeVnd: 30_000, freeShipping: false },
      });
    });

    it('store-pickup has a 0 price but is not "free shipping" below the threshold', async () => {
      const { service } = setup([item('1', 200_000)]);
      await expect(service.quote('u1', { shippingMethod: 'store-pickup' })).resolves.toMatchObject({
        data: { shippingFeeVnd: 0, totalVnd: 200_000, freeShipping: false },
      });
    });

    it('reports a null threshold (both currencies) and never frees shipping', async () => {
      const { service } = setup([item('1', 5_000_000)], { ...DEFAULT_SHIPPING_CONFIG, freeShippingThresholdVnd: null });
      await expect(service.quote('u1', {})).resolves.toMatchObject({
        data: { shippingFeeVnd: 30_000, freeShipping: false, freeShippingThresholdVnd: null, freeShippingThresholdUsd: null },
      });
    });

    it.each([
      ['standard', 30_000],
      ['express', 50_000],
      ['store-pickup', 0],
    ])('gives the same numbers as checkout for %s (single calculation)', async (method, _price) => {
      const q = await setup(lines()).service.quote('u1', { shippingMethod: method });
      const c = setup(lines());
      await c.service.checkout('u1', { addressId: 'a1', shippingMethod: method });
      expect(c.savedOrders[0]).toMatchObject({
        subtotal: q.data.subtotalVnd,
        shippingFee: q.data.shippingFeeVnd,
        total: q.data.totalVnd,
        shippingMethod: q.data.shippingMethod,
      });
    });

    it('USD is derived from the current exchange rate and rounded to 2 decimals', async () => {
      const { service, currencyService } = setup([item('1', 1_000_000)], DEFAULT_SHIPPING_CONFIG, 26_000);
      const { data } = await service.quote('u1', { shippingMethod: 'express' });
      expect(currencyService.getVndPerUsd).toHaveBeenCalled();
      expect(data).toMatchObject({
        exchangeRate: 26_000,
        subtotalVnd: 1_000_000,
        subtotalUsd: 38.46,
        totalVnd: 1_050_000,
        totalUsd: 40.38,
      });
    });

    it('has no VND-per-unit / amountVnd any more: the total is already the VND amount to transfer', async () => {
      const { data } = await setup(lines()).service.quote('u1', {});
      expect(data).not.toHaveProperty('vndPerUnit');
      expect(data).not.toHaveProperty('amountVnd');
    });

    it('quote.totalVnd equals the QR amount created for the order placed with the same input', async () => {
      const q = (await setup([item('1', 1_200_000)]).service.quote('u1', { shippingMethod: 'express' })).data;
      const c = setup([item('1', 1_200_000)]);
      await c.service.checkout('u1', { addressId: 'a1', shippingMethod: 'express' });

      const order = {
        id: 'o1',
        userId: 'u1',
        status: 'pending',
        paymentStatus: 'unpaid',
        total: c.savedOrders[0].total,
        exchangeRate: 25_000,
      };
      const paymentService = new PaymentService(
        { transaction: async (fn: any) => fn(createFakeManager({ orders: [order] })) } as any,
        {} as any,
        {} as any,
        {} as any,
        {
          getQrConfig: () => ({ bankCode: 'VCB', bankName: 'V', account: '1', accountName: 'D', prefix: 'DH' }),
        } as any,
        {} as any,
      );
      const { data } = await paymentService.createQr('u1', { orderId: 'o1' });
      expect(q.totalVnd).toBe(1_250_000);
      expect(data.amountVnd).toBe(q.totalVnd);
      expect(data.amountUsd).toBe(q.totalUsd);
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
      await expect(setup(lines()).service.quote('u1', { cartItemIds: ['1', 'nope'] })).rejects.toMatchObject(
        rejection(EOrderErrorCode.ORDER_CART_ITEMS_INVALID),
      );
      await expect(setup([]).service.quote('u1', {})).rejects.toMatchObject(rejection(EOrderErrorCode.ORDER_CART_EMPTY));
      await expect(setup([item('1', 200_000, 1, 'disabled')]).service.quote('u1', {})).rejects.toMatchObject(
        rejection(EOrderErrorCode.ORDER_PRODUCT_UNAVAILABLE),
      );
      await expect(setup([item('1', 200_000, 1, 'active', 'sold_out')]).service.quote('u1', {})).rejects.toMatchObject({
        response: { errorCode: 1303 },
      });
    });
  });

  it('payment: an express order produces a QR amount of exactly subtotal + express fee (VND, no conversion)', async () => {
    const { service, savedOrders } = setup([item('1', 1_200_000)]);
    await service.checkout('u1', { addressId: 'a1', shippingMethod: 'express' });
    expect(savedOrders[0]).toMatchObject({ subtotal: 1_200_000, shippingFee: 50_000, total: 1_250_000 });

    const order = { id: 'o1', userId: 'u1', status: 'pending', paymentStatus: 'unpaid', total: savedOrders[0].total, exchangeRate: 25_000 };
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
        }),
      } as any,
      {} as any,
    );
    const { data } = await paymentService.createQr('u1', { orderId: 'o1' });
    expect(data.amountVnd).toBe(1_250_000);
    expect(data.amountUsd).toBe(50);
  });

  it.each([
    ['an id of another user / unknown id', ['1', 'other-user-item']],
    ['only unknown ids', ['nope']],
  ])('rejects %s with 400 and changes nothing', async (_name, ids) => {
    const { service, manager, deleted } = setup([item('1', 200_000), item('2', 300_000)]);
    await expect(service.checkout('u1', { ...base, cartItemIds: ids })).rejects.toMatchObject(
      rejection(EOrderErrorCode.ORDER_CART_ITEMS_INVALID),
    );
    expect(manager.save).not.toHaveBeenCalled();
    expect(deleted).toHaveLength(0);
  });

  it('rejects when a selected product is inactive', async () => {
    const { service } = setup([item('1', 200_000), item('2', 300_000, 1, 'disabled')]);
    await expect(service.checkout('u1', { ...base, cartItemIds: ['1', '2'] })).rejects.toMatchObject(
      rejection(EOrderErrorCode.ORDER_PRODUCT_UNAVAILABLE),
    );
  });

  it('ignores inactive products that are not selected', async () => {
    const { service, savedItems } = setup([item('1', 200_000), item('2', 300_000, 1, 'disabled')]);
    await service.checkout('u1', { ...base, cartItemIds: ['1'] });
    expect(savedItems).toHaveLength(1);
  });

  it.each(['sold_out', 'custom_order'])('rejects a selected %s product with error 1303 and changes nothing', async (badge) => {
    const { service, manager, deleted } = setup([item('1', 200_000), item('2', 300_000, 1, 'active', badge)]);
    await expect(service.checkout('u1', { ...base, cartItemIds: ['1', '2'] })).rejects.toMatchObject({
      status: 400,
      response: { errorCode: 1303, message: expect.stringContaining('Product 2') },
    });
    expect(manager.save).not.toHaveBeenCalled();
    expect(deleted).toHaveLength(0);
  });

  it('rejects the whole-cart checkout when the cart holds a sold_out product', async () => {
    const { service } = setup([item('1', 200_000), item('2', 300_000, 1, 'active', 'sold_out')]);
    await expect(service.checkout('u1', base)).rejects.toMatchObject({ response: { errorCode: 1303 } });
  });

  it('ignores sold_out / custom_order products that are not selected', async () => {
    const { service, savedItems } = setup([item('1', 200_000), item('2', 300_000, 1, 'active', 'custom_order')]);
    await service.checkout('u1', { ...base, cartItemIds: ['1'] });
    expect(savedItems.map((i) => i.productId)).toEqual(['p-1']);
  });

  it.each(['new', 'sale', 'bestseller', 'limited'])('still orders a %s product', async (badge) => {
    const { service, savedItems } = setup([item('1', 200_000, 1, 'active', badge)]);
    await service.checkout('u1', base);
    expect(savedItems).toHaveLength(1);
  });

  it('still rejects an empty cart', async () => {
    const { service } = setup([]);
    await expect(service.checkout('u1', base)).rejects.toMatchObject(rejection(EOrderErrorCode.ORDER_CART_EMPTY));
  });
});
