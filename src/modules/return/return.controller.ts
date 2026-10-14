import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../user/user.entity';
import { CreateReturnDto } from './dtos/create-return.dto';
import { PublicReturnQueryDto } from './dtos/public-return-query.dto';
import { ReturnService } from './return.service';

@ApiTags('Returns')
@Controller('api/returns')
@ApiBearerAuth()
export class ReturnController {
  constructor(private readonly returnService: ReturnService) {}

  @Get('eligibility/:orderId')
  @ApiOperation({
    summary: 'Đơn này trả hàng được không, còn trả được bao nhiêu từng dòng, hạn cuối',
    description: '`eligible=false` kèm `reason`: ORDER_NOT_PAID, ORDER_NOT_DELIVERED, RETURN_WINDOW_EXPIRED, NOTHING_TO_RETURN.',
  })
  @Permissions(Permission.RETURN_VIEW)
  getEligibility(@CurrentUser() user: User, @Param('orderId') orderId: string) {
    return this.returnService.getEligibility(user.id, orderId);
  }

  @Post()
  @ApiOperation({ summary: 'Gửi yêu cầu trả hàng cho đơn đã giao và đã thanh toán, trong hạn đổi trả' })
  @Permissions(Permission.RETURN_CREATE)
  create(@CurrentUser() user: User, @Body() dto: CreateReturnDto) {
    return this.returnService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Các yêu cầu trả hàng của tôi (pagination, filter status/orderId)' })
  @Permissions(Permission.RETURN_VIEW)
  findAll(@CurrentUser() user: User, @Query() query: PublicReturnQueryDto) {
    return this.returnService.findAll(user.id, query);
  }

  @Get(':returnId')
  @ApiOperation({ summary: 'Chi tiết một yêu cầu trả hàng của tôi' })
  @Permissions(Permission.RETURN_VIEW)
  findOne(@CurrentUser() user: User, @Param('returnId') returnId: string) {
    return this.returnService.findOne(user.id, returnId);
  }

  @Patch(':returnId/cancel')
  @ApiOperation({ summary: 'Huỷ yêu cầu trả hàng (khi còn REQUESTED hoặc APPROVED)' })
  @Permissions(Permission.RETURN_CREATE)
  cancel(@CurrentUser() user: User, @Param('returnId') returnId: string) {
    return this.returnService.cancel(user.id, returnId);
  }
}
