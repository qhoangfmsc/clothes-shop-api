import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Controller, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../../user/user.entity';
import { OrderStatusService } from './order-status.service';

@ApiTags('Orders')
@Controller('api/orders')
@ApiBearerAuth()
export class OrderStatusController {
  constructor(private readonly statusService: OrderStatusService) {}

  @Patch(':orderId/cancel')
  @ApiOperation({ summary: 'Cancel a pending order' })
  @Permissions(Permission.ORDER_CANCEL)
  cancel(@CurrentUser() user: User, @Param('orderId') orderId: string) {
    return this.statusService.cancel(user.id, orderId);
  }
}
