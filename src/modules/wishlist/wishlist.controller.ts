import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../user/user.entity';
import { WishlistService } from './wishlist.service';

@ApiTags('Wishlist')
@Controller('api/wishlist')
@ApiBearerAuth()
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'Get user wishlist' })
  @Permissions(Permission.WISHLIST_VIEW)
  findAll(@CurrentUser() user: User) {
    return this.wishlistService.findAll(user.id);
  }

  @Post(':productId')
  @ApiOperation({ summary: 'Add product to wishlist' })
  @Permissions(Permission.WISHLIST_ADD)
  add(@CurrentUser() user: User, @Param('productId') productId: string) {
    return this.wishlistService.add(user.id, productId);
  }

  @Delete(':productId')
  @ApiOperation({ summary: 'Remove product from wishlist' })
  @Permissions(Permission.WISHLIST_REMOVE)
  remove(@CurrentUser() user: User, @Param('productId') productId: string) {
    return this.wishlistService.remove(user.id, productId);
  }

  @Get('check/:productId')
  @ApiOperation({ summary: 'Check if product is in wishlist' })
  @Permissions(Permission.WISHLIST_CHECK)
  check(@CurrentUser() user: User, @Param('productId') productId: string) {
    return this.wishlistService.check(user.id, productId);
  }
}
