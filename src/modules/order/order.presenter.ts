import { type MoneyFields, money } from '@common/utils/money.util';
import { type ProductSummary, type ProductSummarySource, presentProductSummary } from '../product/product.presenter';

type ItemLike = { price: number; product?: ProductSummarySource | null };
type OrderLike = { subtotal: number; shippingFee: number; total: number; exchangeRate: number; items?: ItemLike[] };

export type PresentedOrderItem<I extends ItemLike> = Omit<I, 'price' | 'product'> &
  MoneyFields<'price'> & { product: ProductSummary | null };
export type PresentedOrder<O extends OrderLike> = Omit<O, 'subtotal' | 'shippingFee' | 'total' | 'items'> &
  MoneyFields<'subtotal'> &
  MoneyFields<'shippingFee'> &
  MoneyFields<'total'> &
  (O['items'] extends (infer I extends ItemLike)[] | undefined ? { items?: PresentedOrderItem<I>[] } : unknown);

/**
 * Dòng hàng: `productId`/`productName`/`productImage`/`price` là ảnh chụp lúc đặt, còn `product` là sản phẩm hiện tại dưới dạng
 * `ProductSummary` để dựng link (`null` khi sản phẩm đã bị xoá). Quan hệ `product` phải được nạp kèm category/subcategory.
 */
export function presentOrderItem<I extends ItemLike>(item: I, vndPerUsd: number): PresentedOrderItem<I> {
  const { price, product, ...rest } = item;
  return {
    ...rest,
    ...money('price', price, vndPerUsd),
    product: product ? presentProductSummary(product) : null,
  } as PresentedOrderItem<I>;
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
