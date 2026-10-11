import { ValidationPipe } from '@nestjs/common';
import { CreateOrderDto } from './order.dto';

// Same options as main.ts
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const run = (body: unknown) => pipe.transform(body, { type: 'body', metatype: CreateOrderDto });

describe('CreateOrderDto', () => {
  const base = { addressId: 'a1' };

  it('accepts a body without cartItemIds', async () => {
    await expect(run(base)).resolves.toMatchObject(base);
  });

  it('accepts a valid cartItemIds', async () => {
    await expect(run({ ...base, cartItemIds: ['a', 'b'] })).resolves.toMatchObject({ cartItemIds: ['a', 'b'] });
  });

  it.each([
    ['empty array', { cartItemIds: [] }],
    ['duplicate ids', { cartItemIds: ['a', 'a'] }],
    ['non-array', { cartItemIds: 'a' }],
    ['non-string entry', { cartItemIds: [1] }],
    ['empty-string entry', { cartItemIds: [''] }],
    ['too-long entry', { cartItemIds: ['x'.repeat(17)] }],
    ['more than 100 ids', { cartItemIds: Array.from({ length: 101 }, (_, i) => `id${i}`) }],
    ['unknown field', { unknown: 1 }],
  ])('rejects %s with 400', async (_name, extra) => {
    await expect(run({ ...base, ...extra })).rejects.toMatchObject({ status: 400 });
  });
});
