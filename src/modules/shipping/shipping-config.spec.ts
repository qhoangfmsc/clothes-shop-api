import { DEFAULT_SHIPPING_CONFIG, parseShippingConfig, validateShippingConfigValue } from './shipping-config';

const clone = () => structuredClone(DEFAULT_SHIPPING_CONFIG) as any;
const parse = (value: unknown) => parseShippingConfig(typeof value === 'string' ? value : JSON.stringify(value));

describe('parseShippingConfig', () => {
  it('accepts the default config unchanged', () => {
    expect(parse(DEFAULT_SHIPPING_CONFIG)).toEqual({ ok: true, config: DEFAULT_SHIPPING_CONFIG });
  });

  it('accepts whole-VND prices, price 0, and threshold null', () => {
    const cfg = clone();
    cfg.freeShippingThresholdVnd = null;
    cfg.methods[0].priceVnd = 35_000;
    cfg.methods[1].priceVnd = 0;
    expect(parse(cfg)).toMatchObject({ ok: true, config: { freeShippingThresholdVnd: null } });
  });

  it('normalises the method order', () => {
    const cfg = clone();
    cfg.methods.reverse();
    const result = parse(cfg);
    expect(result.ok && result.config.methods.map((m) => m.id)).toEqual(['standard', 'express', 'store-pickup']);
  });

  it('fills the default return policy when a stored config has none (older rows stay valid)', () => {
    const cfg = clone();
    delete cfg.returnPolicy;
    expect(parse(cfg)).toEqual({ ok: true, config: DEFAULT_SHIPPING_CONFIG });
  });

  it('accepts a custom return policy and normalises it', () => {
    const cfg = clone();
    cfg.returnPolicy = { days: 14, description: '', conditions: [] };
    expect(parse(cfg)).toMatchObject({ ok: true, config: { returnPolicy: { days: 14, description: '', conditions: [] } } });
  });

  it.each([
    ['not JSON', 'nope', 'valid JSON'],
    ['an array', '[]', 'JSON object'],
    [
      'missing threshold',
      (() => {
        const c = clone();
        delete c.freeShippingThresholdVnd;
        return c;
      })(),
      'freeShippingThresholdVnd',
    ],
    ['zero threshold', { ...clone(), freeShippingThresholdVnd: 0 }, 'freeShippingThresholdVnd'],
    ['negative threshold', { ...clone(), freeShippingThresholdVnd: -1 }, 'freeShippingThresholdVnd'],
    ['string threshold', { ...clone(), freeShippingThresholdVnd: '1500000' }, 'freeShippingThresholdVnd'],
    ['fractional threshold', { ...clone(), freeShippingThresholdVnd: 1500000.5 }, 'freeShippingThresholdVnd'],
    ['threshold above the maximum', { ...clone(), freeShippingThresholdVnd: 1_000_000_001 }, 'freeShippingThresholdVnd'],
    [
      'the old USD-era key',
      (() => {
        const c = clone();
        c.freeShippingThreshold = 150;
        return c;
      })(),
      'freeShippingThreshold',
    ],
    ['unknown top-level field', { ...clone(), extra: 1 }, 'extra'],
    ['missing methods', { freeShippingThresholdVnd: 1_500_000 }, 'methods'],
    ['too few methods', { ...clone(), methods: clone().methods.slice(0, 2) }, 'methods'],
    [
      'negative price',
      (() => {
        const c = clone();
        c.methods[0].priceVnd = -1;
        return c;
      })(),
      'methods.0.priceVnd',
    ],
    [
      'price as string',
      (() => {
        const c = clone();
        c.methods[0].priceVnd = '30000';
        return c;
      })(),
      'methods.0.priceVnd',
    ],
    [
      'fractional price',
      (() => {
        const c = clone();
        c.methods[0].priceVnd = 30000.5;
        return c;
      })(),
      'methods.0.priceVnd',
    ],
    [
      'the old USD-era price key',
      (() => {
        const c = clone();
        c.methods[0].price = 8;
        return c;
      })(),
      'methods.0.price',
    ],
    [
      'unknown method id',
      (() => {
        const c = clone();
        c.methods[2].id = 'drone';
        return c;
      })(),
      'methods.2.id',
    ],
    [
      'duplicate method id',
      (() => {
        const c = clone();
        c.methods[2].id = 'express';
        return c;
      })(),
      'exactly once',
    ],
    [
      'empty name',
      (() => {
        const c = clone();
        c.methods[0].name = '';
        return c;
      })(),
      'methods.0.name',
    ],
    [
      'unknown icon',
      (() => {
        const c = clone();
        c.methods[0].icon = 'rocket';
        return c;
      })(),
      'methods.0.icon',
    ],
    [
      'unknown field in a method',
      (() => {
        const c = clone();
        c.methods[0].freeAbove = 1;
        return c;
      })(),
      'freeAbove',
    ],
  ])('rejects %s', (_name, value, expected) => {
    const result = parse(value);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(' | ')).toContain(expected);
  });
});

describe('validateShippingConfigValue', () => {
  it('returns normalised JSON for a valid value', () => {
    expect(JSON.parse(validateShippingConfigValue(JSON.stringify(DEFAULT_SHIPPING_CONFIG)))).toEqual(DEFAULT_SHIPPING_CONFIG);
  });

  it('throws SITE_CONFIG_VALUE_INVALID (1503, HTTP 400) listing the problems', () => {
    const cfg = clone();
    cfg.methods[0].priceVnd = -5;
    expect.assertions(3);
    try {
      validateShippingConfigValue(JSON.stringify(cfg));
    } catch (error: any) {
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse().errorCode).toBe(1503);
      expect(error.getResponse().message).toContain('methods.0.priceVnd');
    }
  });
});
