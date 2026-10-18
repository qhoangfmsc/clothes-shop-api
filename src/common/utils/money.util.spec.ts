import { money, moneyOrNull, vndToUsd } from './money.util';

describe('vndToUsd', () => {
  it.each([
    [350_000, 25_000, 14],
    [1_050_000, 26_000, 40.38],
    [500_000, 26_000, 19.23],
    [1, 25_000, 0],
    [12_500, 25_000, 0.5],
    [0, 25_000, 0],
  ])('%d VND at %d VND/USD → %d USD', (vnd, rate, usd) => {
    expect(vndToUsd(vnd, rate)).toBe(usd);
  });

  it('accepts numeric strings (bigint columns come back as strings from the driver)', () => {
    expect(vndToUsd('350000', 25_000)).toBe(14);
  });

  it('always rounds to at most 2 decimal places', () => {
    for (const vnd of [1, 7, 99_999, 1_234_567, 987_654_321]) {
      const usd = vndToUsd(vnd, 25_431.27);
      expect(Math.round(usd * 100) / 100).toBe(usd);
    }
  });
});

describe('money / moneyOrNull', () => {
  it('builds <name>Vnd and <name>Usd', () => {
    expect(money('price', 350_000, 25_000)).toEqual({ priceVnd: 350_000, priceUsd: 14 });
    expect(money('shippingFee', '30000', 25_000)).toEqual({ shippingFeeVnd: 30_000, shippingFeeUsd: 1.2 });
  });

  it('moneyOrNull returns null in both currencies for a missing value, but keeps 0', () => {
    expect(moneyOrNull('originalPrice', null, 25_000)).toEqual({ originalPriceVnd: null, originalPriceUsd: null });
    expect(moneyOrNull('originalPrice', undefined, 25_000)).toEqual({ originalPriceVnd: null, originalPriceUsd: null });
    expect(moneyOrNull('originalPrice', 0, 25_000)).toEqual({ originalPriceVnd: 0, originalPriceUsd: 0 });
    expect(moneyOrNull('originalPrice', 500_000, 25_000)).toEqual({ originalPriceVnd: 500_000, originalPriceUsd: 20 });
  });
});
