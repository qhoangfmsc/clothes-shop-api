import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../../user/user.entity';
import { UpdateOrderStatusDto } from './dtos/admin-order.dto';
import { OrderStatusService } from './order-status.service';

@ApiTags('Admin — Orders')
@Controller('api/admin/orders')
@ApiBearerAuth()
export class AdminOrderStatusController {
  constructor(private readonly statusService: OrderStatusService) {}

  @Patch(':orderId/status')
  @ApiOperation({
    summary: '[Admin] Cập nhật trạng thái đơn hàng',
    description: 'Huỷ đơn đã thanh toán (status=cancelled) tự tạo yêu cầu hoàn tiền, xử lý ở /api/admin/refunds.',
  })
  @Permissions(Permission.ORDER_ADMIN_UPDATE_STATUS)
  updateStatus(@CurrentUser() admin: User, @Param('orderId') orderId: string, @Body() dto: UpdateOrderStatusDto) {
    return this.statusService.updateStatus(admin.id, orderId, dto);
  }
}
