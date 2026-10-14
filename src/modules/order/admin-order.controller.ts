import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../user/user.entity';
import { UpdateOrderStatusDto } from './dtos/admin-order.dto';
import { AdminOrderQueryDto } from './dtos/admin-order-query.dto';
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
  @ApiOperation({
    summary: '[Admin] Cập nhật trạng thái đơn hàng',
    description: 'Huỷ đơn đã thanh toán (status=cancelled) tự tạo yêu cầu hoàn tiền, xử lý ở /api/admin/refunds.',
  })
  @Permissions(Permission.ORDER_ADMIN_UPDATE_STATUS)
  updateStatus(@CurrentUser() admin: User, @Param('orderId') orderId: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orderService.updateStatus(admin.id, orderId, dto);
  }
}
