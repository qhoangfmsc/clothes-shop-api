import { Module } from '@nestjs/common';
import { SiteConfigModule } from '../site-config/site-config.module';
import { ShippingController } from './shipping.controller';
import { ShippingConfigService } from './shipping-config.service';

@Module({
  imports: [SiteConfigModule],
  controllers: [ShippingController],
  providers: [ShippingConfigService],
  exports: [ShippingConfigService],
})
export class ShippingModule {}
