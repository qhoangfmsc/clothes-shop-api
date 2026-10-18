import { DEFAULT_SHIPPING_CONFIG } from '../shipping/shipping-config';
import { SiteConfigType } from './site-config.constant';
import { SiteConfigService } from './site-config.service';

function setup(existing: any = null) {
  const saved: any[] = [];
  const repo: any = {
    findOne: jest.fn(async () => existing),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (data: any) => {
      saved.push(data);
      return data;
    }),
  };
  return { service: new SiteConfigService(repo), saved, repo };
}

describe('SiteConfigService.upsert', () => {
  it('stores SHIPPING_CONFIG with type SHIPPING after validating it', async () => {
    const { service, saved } = setup();
    const value = JSON.stringify({ ...DEFAULT_SHIPPING_CONFIG, freeShippingThresholdVnd: 990_000 });
    await service.upsert('SHIPPING_CONFIG', value);
    expect(saved[0]).toMatchObject({ key: 'SHIPPING_CONFIG', type: SiteConfigType.SHIPPING });
    expect(JSON.parse(saved[0].value).freeShippingThresholdVnd).toBe(990_000);
  });

  it('rejects an invalid SHIPPING_CONFIG with 1503 and saves nothing', async () => {
    const { service, saved } = setup();
    await expect(service.upsert('SHIPPING_CONFIG', JSON.stringify({ freeShippingThresholdVnd: -1, methods: [] }))).rejects.toMatchObject({
      response: { errorCode: 1503 },
    });
    expect(saved).toHaveLength(0);
  });

  it('updates an existing SHIPPING_CONFIG row in place', async () => {
    const existing = { key: 'SHIPPING_CONFIG', type: 'SHIPPING', value: '{}' };
    const { service, saved } = setup(existing);
    await service.upsert('SHIPPING_CONFIG', JSON.stringify(DEFAULT_SHIPPING_CONFIG));
    expect(saved[0]).toBe(existing);
    expect(JSON.parse(existing.value)).toEqual(DEFAULT_SHIPPING_CONFIG);
  });

  it('stores EXCHANGE_RATE with type CURRENCY after validating it', async () => {
    const { service, saved } = setup();
    await service.upsert('EXCHANGE_RATE', '{"vndPerUsd": 25500.5}');
    expect(saved[0]).toMatchObject({ key: 'EXCHANGE_RATE', type: SiteConfigType.CURRENCY });
    expect(JSON.parse(saved[0].value)).toEqual({ vndPerUsd: 25500.5 });
  });

  it.each([
    ['missing vndPerUsd', '{}'],
    ['zero', '{"vndPerUsd":0}'],
    ['negative', '{"vndPerUsd":-1}'],
    ['a string', '{"vndPerUsd":"25000"}'],
    ['3 decimal places', '{"vndPerUsd":25000.123}'],
    ['above the maximum', '{"vndPerUsd":1000001}'],
    ['an unknown field', '{"vndPerUsd":25000,"usdPerVnd":1}'],
    ['not an object', '[25000]'],
  ])('rejects an EXCHANGE_RATE with %s (1503) and saves nothing', async (_name, value) => {
    const { service, saved } = setup();
    await expect(service.upsert('EXCHANGE_RATE', value)).rejects.toMatchObject({ response: { errorCode: 1503 } });
    expect(saved).toHaveLength(0);
  });

  it('keeps banner keys free-form (any JSON), unchanged behaviour', async () => {
    const { service, saved } = setup();
    await service.upsert('SHOP_HERO_BANNERS', '[{"x":1}]');
    expect(saved[0]).toMatchObject({ type: SiteConfigType.BANNER, value: '[{"x":1}]' });
  });

  it('still rejects unknown keys', async () => {
    await expect(setup().service.upsert('NOPE', '[]')).rejects.toMatchObject({ response: { errorCode: 1502 } });
  });
});

describe('SiteConfigService.findValue', () => {
  it('returns the raw value or null', async () => {
    expect(await setup({ value: 'abc' }).service.findValue('SHIPPING_CONFIG' as any)).toBe('abc');
    expect(await setup(null).service.findValue('SHIPPING_CONFIG' as any)).toBeNull();
  });
});
