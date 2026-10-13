/**
 * Site Config — key/type/value registry
 *
 * `key`  : định danh 1 vị trí cấu hình cụ thể (banner Shop, banner New In, ...)
 * `type` : quy định FE nên render kiểu gì (banner = carousel/hero, text = đoạn text...)
 *
 * `value` luôn là 1 string (thường là JSON.stringify của mảng) — FE tự JSON.parse theo `type`.
 * BE không quan tâm hình dạng bên trong, trừ key mà chính BE đọc để tính toán (vd `SHIPPING_CONFIG`):
 * những key đó có validator riêng ở `site-config.validators.ts`.
 */

export enum SiteConfigType {
  BANNER = 'BANNER',
  TEXT = 'TEXT',
  SHIPPING = 'SHIPPING',
}

export enum SiteConfigKey {
  SHOP_HERO_BANNERS = 'SHOP_HERO_BANNERS',
  NEW_IN_HERO_BANNERS = 'NEW_IN_HERO_BANNERS',
  COLLECTIONS_HERO_BANNERS = 'COLLECTIONS_HERO_BANNERS',
  NAV_MENU_BANNERS = 'NAV_MENU_BANNERS',
  SHIPPING_CONFIG = 'SHIPPING_CONFIG',
}

/** Mỗi key luôn gắn với đúng 1 type cố định — BE tự suy ra, admin không cần truyền type. */
export const SITE_CONFIG_KEY_TYPE: Record<SiteConfigKey, SiteConfigType> = {
  [SiteConfigKey.SHOP_HERO_BANNERS]: SiteConfigType.BANNER,
  [SiteConfigKey.NEW_IN_HERO_BANNERS]: SiteConfigType.BANNER,
  [SiteConfigKey.COLLECTIONS_HERO_BANNERS]: SiteConfigType.BANNER,
  [SiteConfigKey.NAV_MENU_BANNERS]: SiteConfigType.BANNER,
  [SiteConfigKey.SHIPPING_CONFIG]: SiteConfigType.SHIPPING,
};
