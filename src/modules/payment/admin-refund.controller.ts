import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../user/user.entity';
import { AdminRefundQueryDto } from './dtos/admin-refund-query.dto';
import { CompleteRefundDto } from './dtos/complete-refund.dto';
import { CreateRefundDto } from './dtos/create-refund.dto';
import { RejectRefundDto } from './dtos/reject-refund.dto';
import { RefundService } from './refund.service';

@ApiTags('Admin — Refunds')
@Controller('api/admin/refunds')
@ApiBearerAuth()
export class AdminRefundController {
  constructor(private readonly refundService: RefundService) {}

  @Get()
  @ApiOperation({
    summary: '[Admin] Danh sách yêu cầu hoàn tiền (filter status=REQUESTED để thấy khoản đang chờ chuyển trả khách)',
    description:
      'Mỗi khoản kèm đơn, khách và `payment` (mã chuyển khoản, mã giao dịch, nội dung chuyển khoản đã nhận) để biết hoàn về đúng nguồn.',
  })
  @Permissions(Permission.PAYMENT_ADMIN_VIEW)
  findAll(@Query() query: AdminRefundQueryDto) {
    return this.refundService.findAdmin(query);
  }

  @Post()
  @ApiOperation({
    summary: '[Admin] Tạo yêu cầu hoàn tiền cho đơn đã huỷ mà đã thanh toán',
    description:
      'Dùng cho đơn huỷ trước khi có luồng hoàn tiền hoặc khi yêu cầu cũ đã bị từ chối. Huỷ đơn đã trả bình thường tự tạo yêu cầu.',
  })
  @Permissions(Permission.PAYMENT_ADMIN_REFUND)
  create(@CurrentUser() admin: User, @Body() dto: CreateRefundDto) {
    return this.refundService.createAdmin(admin.id, dto);
  }

  @Post(':refundId/complete')
  @ApiOperation({
    summary: '[Admin] Đã chuyển khoản hoàn tiền cho khách: ghi mã giao dịch ngân hàng',
    description: 'Hệ thống không tự chuyển tiền. Chuyển khoản bằng ngân hàng trước, rồi gọi API này với mã giao dịch và ghi chú.',
  })
  @Permissions(Permission.PAYMENT_ADMIN_REFUND)
  complete(@CurrentUser() admin: User, @Param('refundId') refundId: string, @Body() dto: CompleteRefundDto) {
    return this.refundService.completeAdmin(admin.id, refundId, dto);
  }

  @Post(':refundId/reject')
  @ApiOperation({ summary: '[Admin] Từ chối hoàn tiền (bắt buộc ghi lý do)' })
  @Permissions(Permission.PAYMENT_ADMIN_REFUND)
  reject(@CurrentUser() admin: User, @Param('refundId') refundId: string, @Body() dto: RejectRefundDto) {
    return this.refundService.rejectAdmin(admin.id, refundId, dto);
  }
}
