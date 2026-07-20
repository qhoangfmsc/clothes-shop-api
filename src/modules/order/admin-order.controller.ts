import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminOrderQueryDto } from './dtos/admin-order-query.dto';
import { UpdateOrderStatusDto } from './dtos/admin-order.dto';
import { OrderService } from './order.service';

@ApiTags('Admin — Orders')
@Controller('api/admin/orders')
@ApiBearerAuth()
export class AdminOrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Danh sách tất cả đơn hàng (search, filter, sort, pagination)' })
  @Permissions(Permission.ORDER_ADMIN_VIEW)
  findAll(@Query() query: AdminOrderQueryDto) {
    return this.orderService.findAllAdmin(query);
  }

  @Get(':orderId')
  @ApiOperation({ summary: '[Admin] Chi tiết đơn hàng' })
  @Permissions(Permission.ORDER_ADMIN_VIEW)
  findOne(@Param('orderId') orderId: string) {
    return this.orderService.findOneAdmin(orderId);
  }

  @Patch(':orderId/status')
  @ApiOperation({ summary: '[Admin] Cập nhật trạng thái đơn hàng' })
  @Permissions(Permission.ORDER_ADMIN_UPDATE_STATUS)
  updateStatus(@Param('orderId') orderId: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orderService.updateStatus(orderId, dto);
  }
}
