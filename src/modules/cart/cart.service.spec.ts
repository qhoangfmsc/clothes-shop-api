import { CartService } from './cart.service';

function setup(product: any) {
  const cartRepo: any = {
    findOne: jest.fn(async () => ({ id: 'cart-1', userId: 'u1', items: [] })),
    create: jest.fn(),
    save: jest.fn(),
  };
  const cartItemRepo: any = { findOne: jest.fn(async () => null), create: jest.fn((d: any) => d), save: jest.fn() };
  const productRepo: any = { findOne: jest.fn(async () => product) };
  return { service: new CartService(cartRepo, cartItemRepo, productRepo), cartItemRepo };
}

const product = (badge: string | null) => ({ id: 'p1', name: 'Áo A', status: 'active', badge });

describe('CartService.addItem', () => {
  it.each(['sold_out', 'custom_order'])('rejects a %s product with error 1303 and adds nothing', async (badge) => {
    const { service, cartItemRepo } = setup(product(badge));
    await expect(service.addItem('u1', { productId: 'p1' } as any)).rejects.toMatchObject({
      status: 400,
      response: { errorCode: 1303, message: expect.stringContaining('Áo A') },
    });
    expect(cartItemRepo.save).not.toHaveBeenCalled();
  });

  it.each([null, 'new', 'sale', 'bestseller', 'limited'])('still adds a product with badge %s', async (badge) => {
    const { service, cartItemRepo } = setup(product(badge));
    await service.addItem('u1', { productId: 'p1' } as any);
    expect(cartItemRepo.save).toHaveBeenCalledTimes(1);
  });
});
