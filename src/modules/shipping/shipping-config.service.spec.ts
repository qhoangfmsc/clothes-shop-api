import { Logger } from '@nestjs/common';
import { ShippingController } from './shipping.controller';
import { DEFAULT_SHIPPING_CONFIG } from './shipping-config';
import { ShippingConfigService } from './shipping-config.service';

const make = (stored: string | null) => {
  const siteConfig: any = { findValue: jest.fn(async () => stored) };
  return { service: new ShippingConfigService(siteConfig), siteConfig };
};
const custom = { freeShippingThreshold: 300, methods: DEFAULT_SHIPPING_CONFIG.methods.map((m) => ({ ...m, price: m.price + 1 })) };

describe('ShippingConfigService.get', () => {
  beforeAll(() => Logger.overrideLogger(false));

  it('returns the stored config', async () => {
    const { service, siteConfig } = make(JSON.stringify(custom));
    // `custom` không có returnPolicy → được điền chính sách mặc định
    await expect(service.get()).resolves.toEqual({ ...custom, returnPolicy: DEFAULT_SHIPPING_CONFIG.returnPolicy });
    expect(siteConfig.findValue).toHaveBeenCalledWith('SHIPPING_CONFIG');
  });

  it('falls back to defaults when the row is missing (e.g. admin deleted it)', async () => {
    await expect(make(null).service.get()).resolves.toEqual(DEFAULT_SHIPPING_CONFIG);
  });

  it.each([
    ['broken JSON', '{nope'],
    ['wrong shape', '{"freeShippingThreshold":-1,"methods":[]}'],
  ])('falls back to defaults on %s, so checkout keeps working', async (_n, stored) => {
    await expect(make(stored).service.get()).resolves.toEqual(DEFAULT_SHIPPING_CONFIG);
  });

  it('returns a copy, so callers cannot mutate the defaults', async () => {
    const config = await make(null).service.get();
    config.methods[0].price = 999;
    expect(DEFAULT_SHIPPING_CONFIG.methods[0].price).toBe(8);
  });
});

describe('ShippingController.getShippingInfo', () => {
  const info = async (stored: string | null) => (await new ShippingController(make(stored).service).getShippingInfo()).data;

  it('with the default config returns the configured methods, threshold and return policy', async () => {
    const data = await info(null);
    expect(data).toEqual({
      methods: DEFAULT_SHIPPING_CONFIG.methods,
      returnPolicy: DEFAULT_SHIPPING_CONFIG.returnPolicy,
      freeShippingThreshold: 150,
    });
    expect(data.methods.every((m) => !('freeAbove' in m))).toBe(true);
    expect(data.returnPolicy.days).toBe(30);
  });

  it('no longer returns the free-text notes (gift wrapping / international shipping were not real features)', async () => {
    expect(await info(null)).not.toHaveProperty('notes');
    expect(await info(JSON.stringify(custom))).not.toHaveProperty('notes');
  });

  it('reflects admin changes (prices, threshold) from the same source as checkout', async () => {
    const data = await info(JSON.stringify(custom));
    expect(data.freeShippingThreshold).toBe(300);
    expect(data.methods.map((m) => m.price)).toEqual([9, 16, 1]);
    // cấu hình lưu trước khi có returnPolicy → dùng chính sách mặc định
    expect(data.returnPolicy).toEqual(DEFAULT_SHIPPING_CONFIG.returnPolicy);
  });

  it('returns the configured return policy (days, description, conditions)', async () => {
    const returnPolicy = { days: 14, description: 'Đổi trả trong 14 ngày.', conditions: ['Còn nguyên tem mác'] };
    const data = await info(JSON.stringify({ ...custom, returnPolicy }));
    expect(data.returnPolicy).toEqual(returnPolicy);
  });

  it('keeps freeShippingThreshold = null as null', async () => {
    const data = await info(JSON.stringify({ ...custom, freeShippingThreshold: null }));
    expect(data.freeShippingThreshold).toBeNull();
  });
});
