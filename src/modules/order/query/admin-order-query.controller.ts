import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOrderQueryDto } from './dtos/admin-order-query.dto';
import { OrderQueryService } from './order-query.service';

@ApiTags('Admin — Orders')
@Controller('api/admin/orders')
@ApiBearerAuth()
export class AdminOrderQueryController {
  constructor(private readonly queryService: OrderQueryService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Danh sách tất cả đơn hàng (search, filter, sort, pagination)' })
  @Permissions(Permission.ORDER_ADMIN_VIEW)
  findAll(@Query() query: AdminOrderQueryDto) {
    return this.queryService.findAllAdmin(query);
  }

  @Get(':orderId')
  @ApiOperation({ summary: '[Admin] Chi tiết đơn hàng' })
  @Permissions(Permission.ORDER_ADMIN_VIEW)
  findOne(@Param('orderId') orderId: string) {
    return this.queryService.findOneAdmin(orderId);
  }
}
