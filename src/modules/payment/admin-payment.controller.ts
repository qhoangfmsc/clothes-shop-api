import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../user/user.entity';
import { AdminPaymentAttemptQueryDto } from './dtos/admin-payment-attempt-query.dto';
import { AdminPaymentTransactionQueryDto } from './dtos/admin-payment-transaction-query.dto';
import { ConfirmPaymentDto } from './dtos/confirm-payment.dto';
import { PaymentService } from './payment.service';

@ApiTags('Admin — Payments')
@Controller('api/admin/payments')
@ApiBearerAuth()
export class AdminPaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get('transactions')
  @ApiOperation({ summary: '[Admin] Giao dịch ngân hàng đã nhận qua SePay, kể cả chưa khớp đơn (đối soát)' })
  @Permissions(Permission.PAYMENT_ADMIN_VIEW)
  findTransactions(@Query() query: AdminPaymentTransactionQueryDto) {
    return this.paymentService.findTransactionsAdmin(query);
  }

  @Get('attempts')
  @ApiOperation({
    summary: '[Admin] Tra cứu nội dung chuyển khoản đã cấp (kể cả đã hết hạn) → đơn, khách, trạng thái, giao dịch đã gắn',
    description:
      'Gõ đúng nội dung chuyển khoản trên sao kê (vd DHG29JR5A8) vào `search` để biết mã thuộc đơn nào. Dùng `transferCode` + `orderId` ở API confirm để xác nhận đúng mã đó.',
  })
  @Permissions(Permission.PAYMENT_ADMIN_VIEW)
  findAttempts(@Query() query: AdminPaymentAttemptQueryDto) {
    return this.paymentService.findAttemptsAdmin(query);
  }

  @Get('orders/:orderId')
  @ApiOperation({ summary: '[Admin] Toàn cảnh thanh toán của một đơn: tóm tắt đơn, các phiên QR, các giao dịch ngân hàng' })
  @Permissions(Permission.PAYMENT_ADMIN_VIEW)
  getOrderPayments(@Param('orderId') orderId: string) {
    return this.paymentService.getOrderPaymentsAdmin(orderId);
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

  @Post('orders/:orderId/confirm')
  @ApiOperation({
    summary: '[Admin] Xác nhận thủ công đơn đã thanh toán (khi webhook SePay không tới nhưng tiền đã về)',
    description:
      'Gửi đúng một trong hai: `transactionId` (gắn giao dịch đã có trong danh sách đối soát) hoặc `reference` + `amountVnd` (ghi giao dịch mới). `note` bắt buộc. Số tiền phải khớp phiên thanh toán, trừ khi `acceptAmountMismatch = true`.',
  })
  @Permissions(Permission.PAYMENT_ADMIN_CONFIRM)
  confirmPayment(@CurrentUser() admin: User, @Param('orderId') orderId: string, @Body() dto: ConfirmPaymentDto) {
    return this.paymentService.confirmPaymentAdmin(admin.id, orderId, dto);
  }
}
