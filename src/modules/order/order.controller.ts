import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorator/current-user.decorator';
import { User } from '../user/user.entity';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dtos/order.dto';

@ApiTags('Orders')
@Controller('api/orders')
@ApiBearerAuth()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @ApiOperation({ summary: 'Get order history' })
  findAll(@CurrentUser() user: User) {
    return this.orderService.findAll(user.id);
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get order detail' })
  findOne(@CurrentUser() user: User, @Param('orderId') orderId: string) {
    return this.orderService.findOne(user.id, orderId);
  }

  @Post()
  @ApiOperation({ summary: 'Checkout — create order from cart' })
  checkout(@CurrentUser() user: User, @Body() dto: CreateOrderDto) {
    return this.orderService.checkout(user.id, dto);
  }

  @Patch(':orderId/cancel')
  @ApiOperation({ summary: 'Cancel a pending order' })
  cancel(@CurrentUser() user: User, @Param('orderId') orderId: string) {
    return this.orderService.cancel(user.id, orderId);
  }
}
