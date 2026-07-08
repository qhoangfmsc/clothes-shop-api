import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorator/current-user.decorator';
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
  getCart(@CurrentUser() user: User) {
    return this.cartService.getCart(user.id);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add item to cart' })
  addItem(@CurrentUser() user: User, @Body() dto: AddToCartDto) {
    return this.cartService.addItem(user.id, dto);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Update cart item quantity' })
  updateItem(@CurrentUser() user: User, @Param('itemId') itemId: string, @Body() dto: UpdateCartItemDto) {
    return this.cartService.updateItem(user.id, itemId, dto);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove item from cart' })
  removeItem(@CurrentUser() user: User, @Param('itemId') itemId: string) {
    return this.cartService.removeItem(user.id, itemId);
  }

  @Delete('clear')
  @ApiOperation({ summary: 'Clear entire cart' })
  clearCart(@CurrentUser() user: User) {
    return this.cartService.clearCart(user.id);
  }
}
