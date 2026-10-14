import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../user/user.entity';
import { AdminReturnQueryDto } from './dtos/admin-return-query.dto';
import { ApproveReturnDto } from './dtos/approve-return.dto';
import { ReceiveReturnDto } from './dtos/receive-return.dto';
import { RejectReturnDto } from './dtos/reject-return.dto';
import { ReturnService } from './return.service';

@ApiTags('Admin — Returns')
@Controller('api/admin/returns')
@ApiBearerAuth()
export class AdminReturnController {
  constructor(private readonly returnService: ReturnService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Danh sách yêu cầu trả hàng (search, filter status/orderId, sort, pagination)' })
  @Permissions(Permission.RETURN_ADMIN_VIEW)
  findAll(@Query() query: AdminReturnQueryDto) {
    return this.returnService.findAllAdmin(query);
  }

  @Get(':returnId')
  @ApiOperation({ summary: '[Admin] Chi tiết yêu cầu trả hàng (đơn, khách, dòng hàng, khoản hoàn)' })
  @Permissions(Permission.RETURN_ADMIN_VIEW)
  findOne(@Param('returnId') returnId: string) {
    return this.returnService.findOneAdmin(returnId);
  }

  @Post(':returnId/approve')
  @ApiOperation({ summary: '[Admin] Duyệt: cho phép khách gửi hàng về (note = hướng dẫn gửi hàng, khách thấy)' })
  @Permissions(Permission.RETURN_ADMIN_PROCESS)
  approve(@CurrentUser() admin: User, @Param('returnId') returnId: string, @Body() dto: ApproveReturnDto) {
    return this.returnService.approve(admin.id, returnId, dto);
  }

  @Post(':returnId/reject')
  @ApiOperation({ summary: '[Admin] Từ chối khi chưa nhận hàng (note = lý do, khách thấy)' })
  @Permissions(Permission.RETURN_ADMIN_PROCESS)
  reject(@CurrentUser() admin: User, @Param('returnId') returnId: string, @Body() dto: RejectReturnDto) {
    return this.returnService.reject(admin.id, returnId, dto);
  }

  @Post(':returnId/receive')
  @ApiOperation({
    summary: '[Admin] Đã nhận và kiểm hàng: chốt số lượng chấp nhận và tạo yêu cầu hoàn tiền',
    description:
      'Số tiền hoàn tính từ giá các dòng chấp nhận (+ phí ship nếu refundShipping). Sau đó admin chuyển khoản và bấm hoàn xong ở /api/admin/refunds; yêu cầu trả hàng tự thành REFUNDED.',
  })
  @Permissions(Permission.RETURN_ADMIN_PROCESS)
  receive(@CurrentUser() admin: User, @Param('returnId') returnId: string, @Body() dto: ReceiveReturnDto) {
    return this.returnService.receive(admin.id, returnId, dto);
  }
}
