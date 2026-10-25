import { type MoneyFields, money, moneyOrNull, type NullableMoneyFields } from '@common/utils/money.util';

/** Quan hệ phải nạp để `category`/`subcategory` có mặt trong response sản phẩm — dùng ở mọi nơi trả sản phẩm */
export const PRODUCT_RELATIONS = ['category', 'subcategory'];

export type PresentedProduct<T> = Omit<T, 'price' | 'originalPrice'> & MoneyFields<'price'> & NullableMoneyFields<'originalPrice'>;

/**
 * Sản phẩm trả ra API: `price`/`originalPrice` (VND trong DB) được thay bằng `priceVnd`/`priceUsd` và
 * `originalPriceVnd`/`originalPriceUsd` (`null` khi không có giá gốc). Dùng chung cho mọi nơi trả entity `Product`.
 * `category` bỏ `subcategories` và `subcategory` bỏ `category` (do eager relation / cách nạp khác nhau giữa các
 * endpoint), nên hình dạng luôn giống nhau dù nạp bằng `find` hay query builder.
 */
export function presentProduct<T extends { price: number; originalPrice: number | null }>(
  product: T,
  vndPerUsd: number,
): PresentedProduct<T> {
  const { price, originalPrice, ...rest } = product;
  const relations: Record<string, unknown> = {};
  const { category, subcategory } = rest as { category?: Record<string, unknown> | null; subcategory?: Record<string, unknown> | null };
  if (category) relations.category = omit(category, 'subcategories');
  if (subcategory) relations.subcategory = omit(subcategory, 'category');
  return { ...rest, ...relations, ...money('price', price, vndPerUsd), ...moneyOrNull('originalPrice', originalPrice, vndPerUsd) };
}

type CategoryRef = { id: string; slug: string; title: string };
type SubcategoryRef = { id: string; slug: string; label: string };

export type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  badge: string | null;
  category: CategoryRef | null;
  subcategory: SubcategoryRef | null;
};

/**
 * Tóm tắt sản phẩm cho nơi chỉ cần nhận diện và dựng link (autocomplete, đánh giá): luôn đủ `id, name, slug, image, badge`
 * và `category { id, slug, title }`, `subcategory { id, slug, label }` (`null` khi chưa nạp). Cần giá thì thêm `money('price', …)`.
 */
export type ProductSummarySource = {
  id: string;
  name: string;
  slug: string;
  images?: string[] | null;
  badge?: string | null;
  category?: CategoryRef | null;
  subcategory?: SubcategoryRef | null;
};

export function presentProductSummary(product: ProductSummarySource): ProductSummary {
  const { category, subcategory } = product;
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    image: product.images?.[0] ?? null,
    badge: product.badge ?? null,
    category: category ? { id: category.id, slug: category.slug, title: category.title } : null,
    subcategory: subcategory ? { id: subcategory.id, slug: subcategory.slug, label: subcategory.label } : null,
  };
}

function omit(obj: Record<string, unknown>, key: string) {
  const { [key]: _omitted, ...rest } = obj;
  return rest;
}
