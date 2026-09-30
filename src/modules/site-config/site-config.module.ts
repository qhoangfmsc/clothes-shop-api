import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminSiteConfigController } from './admin-site-config.controller';
import { SiteConfigController } from './site-config.controller';
import { SiteConfig } from './site-config.entity';
import { SiteConfigService } from './site-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([SiteConfig])],
  controllers: [SiteConfigController, AdminSiteConfigController],
  providers: [SiteConfigService],
  exports: [SiteConfigService],
})
export class SiteConfigModule {}
