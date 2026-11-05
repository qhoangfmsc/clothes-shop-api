import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../../user/user.entity';
import { PublicOrderQueryDto } from './dtos/public-order-query.dto';
import { OrderQueryService } from './order-query.service';

@ApiTags('Orders')
@Controller('api/orders')
@ApiBearerAuth()
export class OrderQueryController {
  constructor(private readonly queryService: OrderQueryService) {}

  @Get()
  @ApiOperation({ summary: 'Get order history with pagination and status filter' })
  @Permissions(Permission.ORDER_VIEW_LIST)
  findAll(@CurrentUser() user: User, @Query() query: PublicOrderQueryDto) {
    return this.queryService.findAll(user.id, query);
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get order detail' })
  @Permissions(Permission.ORDER_VIEW_DETAIL)
  findOne(@CurrentUser() user: User, @Param('orderId') orderId: string) {
    return this.queryService.findOne(user.id, orderId);
  }
}
