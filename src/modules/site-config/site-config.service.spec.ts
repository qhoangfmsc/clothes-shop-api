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
    const value = JSON.stringify({ ...DEFAULT_SHIPPING_CONFIG, freeShippingThreshold: 99 });
    await service.upsert('SHIPPING_CONFIG', value);
    expect(saved[0]).toMatchObject({ key: 'SHIPPING_CONFIG', type: SiteConfigType.SHIPPING });
    expect(JSON.parse(saved[0].value).freeShippingThreshold).toBe(99);
  });

  it('rejects an invalid SHIPPING_CONFIG with 1503 and saves nothing', async () => {
    const { service, saved } = setup();
    await expect(service.upsert('SHIPPING_CONFIG', JSON.stringify({ freeShippingThreshold: -1, methods: [] }))).rejects.toMatchObject({
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
