/**
 * Tiền tệ gốc của hệ thống là VND (số nguyên). USD chỉ là giá trị suy ra khi trả API: `usd = vnd / vndPerUsd`, làm tròn 2 chữ số.
 * Mọi field tiền trong response có đủ hai bản `<tên>Vnd` và `<tên>Usd`.
 */

/** Giá/phí tối đa của một đơn vị tiền VND được nhận qua API (1 tỷ) */
export const MAX_MONEY_VND = 1_000_000_000;

export type MoneyFields<K extends string> = Record<`${K}Vnd` | `${K}Usd`, number>;
export type NullableMoneyFields<K extends string> = Record<`${K}Vnd` | `${K}Usd`, number | null>;

/** VND → USD theo tỷ giá `vndPerUsd` (số VND cho 1 USD), làm tròn 2 chữ số thập phân */
export function vndToUsd(vnd: number | string, vndPerUsd: number): number {
  return Math.round((Number(vnd) / vndPerUsd) * 100) / 100;
}

/** `money('price', 350000, 25000)` → `{ priceVnd: 350000, priceUsd: 14 }` */
export function money<K extends string>(key: K, vnd: number | string, vndPerUsd: number): MoneyFields<K> {
  return { [`${key}Vnd`]: Number(vnd), [`${key}Usd`]: vndToUsd(vnd, vndPerUsd) } as MoneyFields<K>;
}

/** Như `money` nhưng giá trị có thể vắng (`null`/`undefined`) → cả hai field là `null` */
export function moneyOrNull<K extends string>(key: K, vnd: number | string | null | undefined, vndPerUsd: number): NullableMoneyFields<K> {
  if (vnd === null || vnd === undefined) return { [`${key}Vnd`]: null, [`${key}Usd`]: null } as NullableMoneyFields<K>;
  return money(key, vnd, vndPerUsd);
}
