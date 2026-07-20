import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UpdateOrderStatusDto } from './dtos/admin-order.dto';
import { OrderService } from './order.service';

@ApiTags('Admin — Orders')
@Controller('api/admin/orders')
@ApiBearerAuth()
export class AdminOrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Danh sách tất cả đơn hàng' })
  @ApiQuery({ name: 'status', required: false, description: 'Lọc theo trạng thái' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Permissions(Permission.ORDER_ADMIN_VIEW)
  findAll(@Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.orderService.findAllAdmin({
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
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
