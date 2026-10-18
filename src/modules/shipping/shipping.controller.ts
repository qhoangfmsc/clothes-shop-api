import { Public } from '@common/decorator/public.decorator';
import { money, moneyOrNull } from '@common/utils/money.util';
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrencyService } from '../currency/currency.service';
import { ShippingConfigService } from './shipping-config.service';

/**
 * Mọi thông tin (phí ship, ngưỡng miễn phí, nội dung phương thức, chính sách đổi trả) lấy từ `SHIPPING_CONFIG`
 * (site-config, admin chỉnh được) — cùng nguồn với phí tính khi checkout.
 * Phí và ngưỡng lưu bằng VND; USD suy ra từ tỷ giá `EXCHANGE_RATE` (CurrencyService).
 * Không còn `notes`: các câu ghi chú cố định trước đây (gói quà, giao quốc tế) không phải tính năng có thật.
 */
@ApiTags('Shipping')
@Controller('api/shipping')
@Public()
export class ShippingController {
  constructor(
    private readonly shippingConfigService: ShippingConfigService,
    private readonly currencyService: CurrencyService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get shipping methods, free-shipping threshold and return policy' })
  async getShippingInfo() {
    const { methods, freeShippingThresholdVnd, returnPolicy } = await this.shippingConfigService.get();
    const rate = await this.currencyService.getVndPerUsd();
    return {
      data: {
        methods: methods.map(({ priceVnd, ...method }) => ({ ...method, ...money('price', priceVnd, rate) })),
        returnPolicy,
        ...moneyOrNull('freeShippingThreshold', freeShippingThresholdVnd, rate),
      },
    };
  }
}
