import { validateShippingConfigValue } from '../shipping/shipping-config';
import { SiteConfigKey } from './site-config.constant';

/**
 * Validator theo key cho những config mà BE đọc để tính toán (không chỉ lưu hộ FE).
 * Nhận chuỗi `value`, trả về chuỗi chuẩn hoá sẽ được lưu, hoặc ném `SITE_CONFIG_VALUE_INVALID`.
 * Key không có trong map chỉ cần là JSON hợp lệ (đã kiểm ở DTO).
 */
export const SITE_CONFIG_VALUE_VALIDATORS: Partial<Record<SiteConfigKey, (value: string) => string>> = {
  [SiteConfigKey.SHIPPING_CONFIG]: validateShippingConfigValue,
};
