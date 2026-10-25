import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../../user/user.entity';
import { CreateOrderDto, QuoteOrderDto } from './dtos/order.dto';
import { OrderCheckoutService } from './order-checkout.service';

@ApiTags('Orders')
@Controller('api/orders')
@ApiBearerAuth()
export class OrderCheckoutController {
  constructor(private readonly checkoutService: OrderCheckoutService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Quote — subtotal, shipping fee and total for the cart (no side effects)',
    description:
      'Same cart validation and the same fee calculation as checkout, but creates no order and keeps the cart. Both fields are optional: `cartItemIds` (default whole cart), `shippingMethod` (default standard).',
  })
  @Permissions(Permission.ORDER_CREATE)
  quote(@CurrentUser() user: User, @Body() dto: QuoteOrderDto) {
    return this.checkoutService.quote(user.id, dto);
  }

  @Post()
  @ApiOperation({
    summary: 'Checkout — create order from cart',
    description:
      'Optional `cartItemIds` orders only the selected cart items (they are removed from the cart, the rest stay). Omit it to order the whole cart. standard/express require `addressId`; store-pickup takes either `addressId` or `pickupContact { fullName, phone }`.',
  })
  @Permissions(Permission.ORDER_CREATE)
  checkout(@CurrentUser() user: User, @Body() dto: CreateOrderDto) {
    return this.checkoutService.checkout(user.id, dto);
  }
}
