import { ValidationPipe } from '@nestjs/common';
import { CreateOrderDto, QuoteOrderDto } from './order.dto';

// Same options as main.ts
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const run = (body: unknown) => pipe.transform(body, { type: 'body', metatype: CreateOrderDto });
const runQuote = (body: unknown) => pipe.transform(body, { type: 'body', metatype: QuoteOrderDto });

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

describe('CreateOrderDto — shippingMethod / addressId / pickupContact', () => {
  it.each(['standard', 'express', 'store-pickup'])('accepts shippingMethod %s', async (shippingMethod) => {
    await expect(run({ addressId: 'a1', shippingMethod })).resolves.toMatchObject({ shippingMethod });
  });

  it.each([
    ['unknown method', 'drone'],
    ['empty string', ''],
    ['wrong case', 'Express'],
  ])('rejects %s with 400', async (_n, shippingMethod) => {
    await expect(run({ addressId: 'a1', shippingMethod })).rejects.toMatchObject({ status: 400 });
  });

  it('accepts store-pickup with only pickupContact (no addressId)', async () => {
    const dto = await run({ shippingMethod: 'store-pickup', pickupContact: { fullName: 'Nguyen Van A', phone: '0901234567' } });
    expect(dto).toMatchObject({ pickupContact: { fullName: 'Nguyen Van A', phone: '0901234567' } });
    expect(dto.addressId).toBeUndefined();
  });

  it('trims pickupContact values', async () => {
    const dto = await run({ pickupContact: { fullName: '  A  ', phone: ' 090 ' } });
    expect(dto.pickupContact).toEqual({ fullName: 'A', phone: '090' });
  });

  it.each([
    ['missing phone', { fullName: 'A' }],
    ['missing fullName', { phone: '1' }],
    ['blank phone', { fullName: 'A', phone: '   ' }],
    ['blank fullName', { fullName: '', phone: '1' }],
    ['fullName > 255', { fullName: 'x'.repeat(256), phone: '1' }],
    ['phone > 50', { fullName: 'A', phone: '1'.repeat(51) }],
    ['non-string phone', { fullName: 'A', phone: 123 }],
    ['unknown key inside', { fullName: 'A', phone: '1', email: 'a@b.c' }],
  ])('rejects pickupContact with %s (400)', async (_n, pickupContact) => {
    await expect(run({ shippingMethod: 'store-pickup', pickupContact })).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an empty addressId and a non-object pickupContact', async () => {
    await expect(run({ addressId: '' })).rejects.toMatchObject({ status: 400 });
    await expect(run({ pickupContact: 'x' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('QuoteOrderDto', () => {
  it('accepts an empty body, both optional fields, and rejects checkout-only fields', async () => {
    await expect(runQuote({})).resolves.toBeDefined();
    await expect(runQuote({ cartItemIds: ['a'], shippingMethod: 'express' })).resolves.toMatchObject({ shippingMethod: 'express' });
    await expect(runQuote({ addressId: 'a1' })).rejects.toMatchObject({ status: 400 });
    await expect(runQuote({ shippingMethod: 'drone' })).rejects.toMatchObject({ status: 400 });
    await expect(runQuote({ cartItemIds: [] })).rejects.toMatchObject({ status: 400 });
  });
});
