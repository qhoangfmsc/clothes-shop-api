import { Logger } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { DEFAULT_VND_PER_USD, parseExchangeRateConfig, validateExchangeRateConfigValue } from './exchange-rate-config';

const make = (stored: string | null) => {
  const siteConfig: any = { findValue: jest.fn(async () => stored) };
  return { service: new CurrencyService(siteConfig), siteConfig };
};

describe('CurrencyService.getVndPerUsd', () => {
  beforeAll(() => Logger.overrideLogger(false));

  it('returns the stored rate and reads the EXCHANGE_RATE row each time (admin changes apply immediately)', async () => {
    const { service, siteConfig } = make('{"vndPerUsd":26100.5}');
    await expect(service.getVndPerUsd()).resolves.toBe(26_100.5);
    await service.getVndPerUsd();
    expect(siteConfig.findValue).toHaveBeenCalledTimes(2);
    expect(siteConfig.findValue).toHaveBeenCalledWith('EXCHANGE_RATE');
  });

  it('falls back to the default when the row is missing (e.g. admin deleted it)', async () => {
    await expect(make(null).service.getVndPerUsd()).resolves.toBe(DEFAULT_VND_PER_USD);
  });

  it.each([
    ['broken JSON', '{nope'],
    ['wrong shape', '{"vndPerUsd":-5}'],
    ['not an object', '25000'],
  ])('falls back to the default on %s, so every API keeps working', async (_name, stored) => {
    await expect(make(stored).service.getVndPerUsd()).resolves.toBe(DEFAULT_VND_PER_USD);
  });

  it('toUsd converts with the current rate and rounds to 2 decimals', async () => {
    await expect(make('{"vndPerUsd":26000}').service.toUsd(1_050_000)).resolves.toBe(40.38);
  });
});

describe('exchange rate config', () => {
  it('parses a valid value', () => {
    expect(parseExchangeRateConfig('{"vndPerUsd":25000}')).toEqual({ ok: true, config: { vndPerUsd: 25_000 } });
  });

  it('validateExchangeRateConfigValue returns normalised JSON, or throws 1503 (HTTP 400) listing the problem', () => {
    expect(validateExchangeRateConfigValue('{ "vndPerUsd": 25000 }')).toBe('{"vndPerUsd":25000}');
    expect.assertions(5);
    try {
      validateExchangeRateConfigValue('{"vndPerUsd":0}');
    } catch (error: any) {
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse().errorCode).toBe(1503);
      expect(error.getResponse().message).toContain('Invalid EXCHANGE_RATE');
      expect(error.getResponse().message).toContain('vndPerUsd');
    }
  });
});
