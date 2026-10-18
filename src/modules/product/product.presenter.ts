import { type MoneyFields, money, moneyOrNull, type NullableMoneyFields } from '@common/utils/money.util';

export type PresentedProduct<T> = Omit<T, 'price' | 'originalPrice'> & MoneyFields<'price'> & NullableMoneyFields<'originalPrice'>;

/**
 * Sản phẩm trả ra API: `price`/`originalPrice` (VND trong DB) được thay bằng `priceVnd`/`priceUsd` và
 * `originalPriceVnd`/`originalPriceUsd` (`null` khi không có giá gốc). Dùng chung cho mọi nơi trả entity `Product`.
 */
export function presentProduct<T extends { price: number; originalPrice: number | null }>(
  product: T,
  vndPerUsd: number,
): PresentedProduct<T> {
  const { price, originalPrice, ...rest } = product;
  return { ...rest, ...money('price', price, vndPerUsd), ...moneyOrNull('originalPrice', originalPrice, vndPerUsd) };
}
