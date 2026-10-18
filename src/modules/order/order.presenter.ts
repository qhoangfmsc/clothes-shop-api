import { type MoneyFields, money } from '@common/utils/money.util';

type ItemLike = { price: number };
type OrderLike = { subtotal: number; shippingFee: number; total: number; exchangeRate: number; items?: ItemLike[] };

export type PresentedOrderItem<I extends ItemLike> = Omit<I, 'price'> & MoneyFields<'price'>;
export type PresentedOrder<O extends OrderLike> = Omit<O, 'subtotal' | 'shippingFee' | 'total' | 'items'> &
  MoneyFields<'subtotal'> &
  MoneyFields<'shippingFee'> &
  MoneyFields<'total'> &
  (O['items'] extends (infer I extends ItemLike)[] | undefined ? { items?: PresentedOrderItem<I>[] } : unknown);

export function presentOrderItem<I extends ItemLike>(item: I, vndPerUsd: number): PresentedOrderItem<I> {
  const { price, ...rest } = item;
  return { ...rest, ...money('price', price, vndPerUsd) };
}

/**
 * Đơn trả ra API: tiền lưu VND, USD suy ra theo `exchangeRate` — tỷ giá chốt lúc đặt đơn, nên số USD của đơn cũ
 * không đổi khi admin đổi tỷ giá. `exchangeRate` (VND/USD) được giữ trong response.
 */
export function presentOrder<O extends OrderLike>(order: O): PresentedOrder<O> {
  const { subtotal, shippingFee, total, items, ...rest } = order;
  const rate = order.exchangeRate;
  return {
    ...rest,
    ...(items ? { items: items.map((item) => presentOrderItem(item, rate)) } : {}),
    ...money('subtotal', subtotal, rate),
    ...money('shippingFee', shippingFee, rate),
    ...money('total', total, rate),
  } as PresentedOrder<O>;
}
