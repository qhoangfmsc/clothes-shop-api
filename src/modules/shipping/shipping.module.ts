import { Module } from '@nestjs/common';
import { CurrencyModule } from '../currency/currency.module';
import { SiteConfigModule } from '../site-config/site-config.module';
import { ShippingController } from './shipping.controller';
import { ShippingConfigService } from './shipping-config.service';

@Module({
  imports: [SiteConfigModule, CurrencyModule],
  controllers: [ShippingController],
  providers: [ShippingConfigService],
  exports: [ShippingConfigService],
})
export class ShippingModule {}
