import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentOverviewService } from './payment-overview.service';

@ApiTags('Admin — Payments')
@Controller('api/admin/payments')
@ApiBearerAuth()
export class AdminPaymentOverviewController {
  constructor(private readonly overviewService: PaymentOverviewService) {}

  @Get('orders/:orderId')
  @ApiOperation({ summary: '[Admin] Toàn cảnh thanh toán của một đơn: tóm tắt đơn, các phiên QR, các giao dịch ngân hàng' })
  @Permissions(Permission.PAYMENT_ADMIN_VIEW)
  getOrderPayments(@Param('orderId') orderId: string) {
    return this.overviewService.getOrderPaymentsAdmin(orderId);
  }
}
