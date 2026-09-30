import { Public } from '@common/decorator/public.decorator';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicSiteConfigQueryDto } from './dtos/public-site-config-query.dto';
import { SiteConfigService } from './site-config.service';

@ApiTags('Site Config')
@Controller('api/site-config')
@Public()
export class SiteConfigController {
  constructor(private readonly siteConfigService: SiteConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Get one site config by key' })
  async find(@Query() query: PublicSiteConfigQueryDto) {
    return this.siteConfigService.findOnePublic(query.key);
  }
}
