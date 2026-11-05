import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../../user/user.entity';
import { AdminPaymentTransactionQueryDto } from './dtos/admin-payment-transaction-query.dto';
import { ConfirmPaymentDto } from './dtos/confirm-payment.dto';
import { PaymentConfirmService } from './payment-confirm.service';
import { PaymentTransactionQueryService } from './payment-transaction-query.service';

@ApiTags('Admin — Payments')
@Controller('api/admin/payments')
@ApiBearerAuth()
export class AdminPaymentTransactionController {
  constructor(
    private readonly confirmService: PaymentConfirmService,
    private readonly queryService: PaymentTransactionQueryService,
  ) {}

  @Get('transactions')
  @ApiOperation({ summary: '[Admin] Giao dịch ngân hàng đã nhận qua SePay, kể cả chưa khớp đơn (đối soát)' })
  @Permissions(Permission.PAYMENT_ADMIN_VIEW)
  findTransactions(@Query() query: AdminPaymentTransactionQueryDto) {
    return this.queryService.findTransactionsAdmin(query);
  }

  @Post('orders/:orderId/confirm')
  @ApiOperation({
    summary: '[Admin] Xác nhận thủ công đơn đã thanh toán (khi webhook SePay không tới nhưng tiền đã về)',
    description:
      'Gửi đúng một trong hai: `transactionId` (gắn giao dịch đã có trong danh sách đối soát) hoặc `reference` + `amountVnd` (ghi giao dịch mới). `note` bắt buộc. Số tiền phải khớp phiên thanh toán, trừ khi `acceptAmountMismatch = true`.',
  })
  @Permissions(Permission.PAYMENT_ADMIN_CONFIRM)
  confirmPayment(@CurrentUser() admin: User, @Param('orderId') orderId: string, @Body() dto: ConfirmPaymentDto) {
    return this.confirmService.confirmPaymentAdmin(admin.id, orderId, dto);
  }
}
