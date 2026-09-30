import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { SiteConfigKey } from '../site-config.constant';

export class PublicSiteConfigQueryDto {
  @ApiProperty({ enum: SiteConfigKey, description: 'Site config key cần lấy' })
  @IsEnum(SiteConfigKey)
  @IsNotEmpty()
  key: SiteConfigKey;
}
