import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../user/user.entity';
import { CartService } from './cart.service';
import { AddToCartDto, UpdateCartItemDto } from './dtos/cart.dto';

@ApiTags('Cart')
@Controller('api/cart')
@ApiBearerAuth()
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get current cart' })
  @Permissions(Permission.CART_VIEW)
  getCart(@CurrentUser() user: User) {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add item to cart' })
  @Permissions(Permission.CART_ADD_ITEM)
  addItem(@CurrentUser() user: User, @Body() dto: AddToCartDto) {
    return this.cartService.addItem(user.id, dto);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Update cart item quantity' })
  @Permissions(Permission.CART_UPDATE_ITEM)
  updateItem(@CurrentUser() user: User, @Param('itemId') itemId: string, @Body() dto: UpdateCartItemDto) {
    return this.cartService.updateItem(user.id, itemId, dto);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove item from cart' })
  @Permissions(Permission.CART_REMOVE_ITEM)
  removeItem(@CurrentUser() user: User, @Param('itemId') itemId: string) {
    return this.cartService.removeItem(user.id, itemId);
  }

  @Delete('clear')
  @ApiOperation({ summary: 'Clear entire cart' })
  @Permissions(Permission.CART_CLEAR)
  clearCart(@CurrentUser() user: User) {
    return this.cartService.clearCart(user.id);
  }
}
