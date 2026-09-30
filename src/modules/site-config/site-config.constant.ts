/**
 * Site Config — key/type/value registry
 *
 * `key`  : định danh 1 vị trí cấu hình cụ thể (banner Shop, banner New In, ...)
 * `type` : quy định FE nên render kiểu gì (banner = carousel/hero, text = đoạn text...)
 *
 * `value` luôn là 1 string (thường là JSON.stringify của mảng) — BE không quan tâm
 * hình dạng bên trong, FE tự JSON.parse theo `type` mà nó biết cách render.
 */

export enum SiteConfigType {
  BANNER = 'BANNER',
  TEXT = 'TEXT',
}

export enum SiteConfigKey {
  SHOP_HERO_BANNERS = 'SHOP_HERO_BANNERS',
  NEW_IN_HERO_BANNERS = 'NEW_IN_HERO_BANNERS',
  COLLECTIONS_HERO_BANNERS = 'COLLECTIONS_HERO_BANNERS',
  NAV_MENU_BANNERS = 'NAV_MENU_BANNERS',
}

/** Mỗi key luôn gắn với đúng 1 type cố định — BE tự suy ra, admin không cần truyền type. */
export const SITE_CONFIG_KEY_TYPE: Record<SiteConfigKey, SiteConfigType> = {
  [SiteConfigKey.SHOP_HERO_BANNERS]: SiteConfigType.BANNER,
  [SiteConfigKey.NEW_IN_HERO_BANNERS]: SiteConfigType.BANNER,
  [SiteConfigKey.COLLECTIONS_HERO_BANNERS]: SiteConfigType.BANNER,
  [SiteConfigKey.NAV_MENU_BANNERS]: SiteConfigType.BANNER,
};
