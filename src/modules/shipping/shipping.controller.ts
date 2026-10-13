import { Public } from '@common/decorator/public.decorator';
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ShippingConfigService } from './shipping-config.service';

/**
 * Mọi thông tin (phí ship, ngưỡng miễn phí, nội dung phương thức, chính sách đổi trả) lấy từ `SHIPPING_CONFIG`
 * (site-config, admin chỉnh được) — cùng nguồn với phí tính khi checkout.
 * Không còn `notes`: các câu ghi chú cố định trước đây (gói quà, giao quốc tế) không phải tính năng có thật.
 */
@ApiTags('Shipping')
@Controller('api/shipping')
@Public()
export class ShippingController {
  constructor(private readonly shippingConfigService: ShippingConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Get shipping methods, free-shipping threshold and return policy' })
  async getShippingInfo() {
    const { methods, freeShippingThreshold, returnPolicy } = await this.shippingConfigService.get();
    return { data: { methods, returnPolicy, freeShippingThreshold } };
  }
}
