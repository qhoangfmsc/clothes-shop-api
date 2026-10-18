import { vndToUsd } from '@common/utils/money.util';
import { Injectable, Logger } from '@nestjs/common';
import { SiteConfigKey } from '../site-config/site-config.constant';
import { SiteConfigService } from '../site-config/site-config.service';
import { DEFAULT_VND_PER_USD, parseExchangeRateConfig } from './exchange-rate-config';

/** Nguồn duy nhất của tỷ giá VND/USD: dòng `EXCHANGE_RATE` trong `site_configs` (admin chỉnh được) */
@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);

  constructor(private readonly siteConfigService: SiteConfigService) {}

  /** Số VND cho 1 USD. Chưa có dòng hoặc giá trị lưu hỏng → `DEFAULT_VND_PER_USD`, không làm API lỗi */
  async getVndPerUsd(): Promise<number> {
    const raw = await this.siteConfigService.findValue(SiteConfigKey.EXCHANGE_RATE);
    if (raw === null) return DEFAULT_VND_PER_USD;

    const parsed = parseExchangeRateConfig(raw);
    if (!parsed.ok) {
      this.logger.error(`Stored EXCHANGE_RATE is invalid, falling back to ${DEFAULT_VND_PER_USD}: ${parsed.errors.join('; ')}`);
      return DEFAULT_VND_PER_USD;
    }
    return parsed.config.vndPerUsd;
  }

  /** VND → USD theo tỷ giá hiện tại */
  async toUsd(vnd: number | string): Promise<number> {
    return vndToUsd(vnd, await this.getVndPerUsd());
  }
}
