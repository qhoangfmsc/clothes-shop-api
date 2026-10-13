import { Injectable, Logger } from '@nestjs/common';
import { SiteConfigKey } from '../site-config/site-config.constant';
import { SiteConfigService } from '../site-config/site-config.service';
import { DEFAULT_SHIPPING_CONFIG, parseShippingConfig, ShippingConfig } from './shipping-config';

/** Nguồn duy nhất của phí ship / ngưỡng miễn phí: dòng `SHIPPING_CONFIG` trong `site_configs` (admin chỉnh được) */
@Injectable()
export class ShippingConfigService {
  private readonly logger = new Logger(ShippingConfigService.name);

  constructor(private readonly siteConfigService: SiteConfigService) {}

  /** Chưa có dòng hoặc giá trị lưu hỏng → trả `DEFAULT_SHIPPING_CONFIG`, không làm checkout lỗi */
  async get(): Promise<ShippingConfig> {
    const raw = await this.siteConfigService.findValue(SiteConfigKey.SHIPPING_CONFIG);
    if (raw === null) return structuredClone(DEFAULT_SHIPPING_CONFIG);

    const parsed = parseShippingConfig(raw);
    if (!parsed.ok) {
      this.logger.error(`Stored SHIPPING_CONFIG is invalid, falling back to defaults: ${parsed.errors.join('; ')}`);
      return structuredClone(DEFAULT_SHIPPING_CONFIG);
    }
    return parsed.config;
  }
}
