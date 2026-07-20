import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../user/user.entity';
import { CreateOrderDto } from './dtos/order.dto';
import { OrderService } from './order.service';

@ApiTags('Orders')
@Controller('api/orders')
@ApiBearerAuth()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @ApiOperation({ summary: 'Get order history' })
  @Permissions(Permission.ORDER_VIEW_LIST)
  findAll(@CurrentUser() user: User) {
    return this.orderService.findAll(user.id);
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get order detail' })
  @Permissions(Permission.ORDER_VIEW_DETAIL)
  findOne(@CurrentUser() user: User, @Param('orderId') orderId: string) {
    return this.orderService.findOne(user.id, orderId);
  }

  @Post()
  @ApiOperation({ summary: 'Checkout — create order from cart' })
  @Permissions(Permission.ORDER_CREATE)
  checkout(@CurrentUser() user: User, @Body() dto: CreateOrderDto) {
    return this.orderService.checkout(user.id, dto);
  }

  @Patch(':orderId/cancel')
  @ApiOperation({ summary: 'Cancel a pending order' })
  @Permissions(Permission.ORDER_CANCEL)
  cancel(@CurrentUser() user: User, @Param('orderId') orderId: string) {
    return this.orderService.cancel(user.id, orderId);
  }
}
