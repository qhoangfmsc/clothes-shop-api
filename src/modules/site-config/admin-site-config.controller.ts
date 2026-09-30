import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpsertSiteConfigDto } from './dtos/site-config.dto';
import { SiteConfigService } from './site-config.service';

@ApiTags('Admin — Site Config')
@Controller('api/admin/site-config')
@ApiBearerAuth()
export class AdminSiteConfigController {
  constructor(private readonly siteConfigService: SiteConfigService) {}

  @Get('keys')
  @ApiOperation({ summary: '[Admin] Danh sách key khả dụng kèm type (kể cả key chưa được cấu hình)' })
  @Permissions(Permission.SITE_CONFIG_VIEW)
  listAvailableKeys() {
    return this.siteConfigService.listAvailableKeys();
  }

  @Get()
  @ApiOperation({ summary: '[Admin] Danh sách site config đã lưu' })
  @Permissions(Permission.SITE_CONFIG_VIEW)
  findAll() {
    return this.siteConfigService.findAllAdmin();
  }

  @Put(':key')
  @ApiOperation({ summary: '[Admin] Tạo mới hoặc cập nhật config theo key (type tự suy ra từ key)' })
  @Permissions(Permission.SITE_CONFIG_UPSERT)
  upsert(@Param('key') key: string, @Body() dto: UpsertSiteConfigDto) {
    return this.siteConfigService.upsert(key, dto.value);
  }

  @Delete(':key')
  @ApiOperation({ summary: '[Admin] Xoá config theo key' })
  @Permissions(Permission.SITE_CONFIG_DELETE)
  delete(@Param('key') key: string) {
    return this.siteConfigService.delete(key);
  }
}
