import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../user/user.entity';
import { CreateQrPaymentDto } from './dtos/create-qr-payment.dto';
import { PaymentService } from './payment.service';

@ApiTags('Payments')
@Controller('api/payments')
@ApiBearerAuth()
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('qr')
  @ApiOperation({
    summary: 'Create (or reuse) a VietQR payment session for an order',
    description: 'Returns the pending session if one is still valid. Amount comes from the order in the database, never from the client.',
  })
  @Permissions(Permission.PAYMENT_CREATE)
  createQr(@CurrentUser() user: User, @Body() dto: CreateQrPaymentDto) {
    return this.paymentService.createQr(user.id, dto);
  }

  @Get(':orderId/status')
  @ApiOperation({ summary: 'Payment status of an order (PENDING | PAID | EXPIRED | CANCELLED) — reads the database only' })
  @Permissions(Permission.PAYMENT_VIEW)
  getStatus(@CurrentUser() user: User, @Param('orderId') orderId: string) {
    return this.paymentService.getStatus(user.id, orderId);
  }
}
