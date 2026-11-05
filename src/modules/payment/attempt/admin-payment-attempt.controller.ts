import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../../user/user.entity';
import { AdminPaymentAttemptQueryDto } from './dtos/admin-payment-attempt-query.dto';
import { PaymentAttemptService } from './payment-attempt.service';
import { PaymentAttemptQueryService } from './payment-attempt-query.service';

@ApiTags('Admin — Payments')
@Controller('api/admin/payments')
@ApiBearerAuth()
export class AdminPaymentAttemptController {
  constructor(
    private readonly paymentService: PaymentAttemptService,
    private readonly queryService: PaymentAttemptQueryService,
  ) {}

  @Get('attempts')
  @ApiOperation({
    summary: '[Admin] Tra cứu nội dung chuyển khoản đã cấp (kể cả đã hết hạn) → đơn, khách, trạng thái, giao dịch đã gắn',
    description:
      'Gõ đúng nội dung chuyển khoản trên sao kê (vd DHG29JR5A8) vào `search` để biết mã thuộc đơn nào. Dùng `transferCode` + `orderId` ở API confirm để xác nhận đúng mã đó.',
  })
  @Permissions(Permission.PAYMENT_ADMIN_VIEW)
  findAttempts(@Query() query: AdminPaymentAttemptQueryDto) {
    return this.queryService.findAttemptsAdmin(query);
  }

  @Post('orders/:orderId/qr')
  @ApiOperation({
    summary: '[Admin] Tạo mã QR mới cho đơn (vd khách thanh toán tại cửa hàng); mọi mã cũ của đơn hết hạn ngay',
    description:
      'Luôn tạo mã mới và đặt các mã đang chờ của đơn thành EXPIRED (trả về `supersededTransferCodes`). Nếu khách đã chuyển theo mã cũ, tiền được ghi LATE: xác nhận thủ công đúng mã đó ở API confirm. Đơn đã trả/đã huỷ → 1702.',
  })
  @Permissions(Permission.PAYMENT_ADMIN_CREATE_QR)
  createQr(@CurrentUser() admin: User, @Param('orderId') orderId: string) {
    return this.paymentService.createQrAdmin(admin.id, orderId);
  }
}
