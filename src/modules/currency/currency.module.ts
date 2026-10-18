import { Module } from '@nestjs/common';
import { SiteConfigModule } from '../site-config/site-config.module';
import { CurrencyService } from './currency.service';

@Module({
  imports: [SiteConfigModule],
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
