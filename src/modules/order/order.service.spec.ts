import { BadRequestException } from '@nestjs/common';
import { In } from 'typeorm';
import { Address } from '../address/address.entity';
import { Cart } from '../cart/cart.entity';
import { CartItem } from '../cart/cart-item.entity';
import { Order } from './order.entity';
import { OrderService } from './order.service';

type Item = { id: string; productId: string; quantity: number; size: string; color: string; product: any };

const item = (id: string, price: number, quantity = 1, status = 'active'): Item => ({
  id,
  productId: `p-${id}`,
  quantity,
  size: 'M',
  color: 'black',
  product: { name: `Product ${id}`, price, status, images: [] },
});

function setup(cartItems: Item[]) {
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
  const dataSource: any = { transaction: (cb: any) => cb(manager) };
  const service = new OrderService({} as any, dataSource);
  return { service, manager, deleted, savedOrders, savedItems };
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

  it('still rejects an empty cart', async () => {
    const { service } = setup([]);
    await expect(service.checkout('u1', base)).rejects.toBeInstanceOf(BadRequestException);
  });
});
