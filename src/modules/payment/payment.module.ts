import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../order/order.entity';
import { AdminPaymentController } from './admin-payment.controller';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentConfigService } from './payment-config.service';
import { PaymentExpiryScheduler } from './payment-expiry.scheduler';
import { PaymentTransaction } from './payment-transaction.entity';
import { SepayWebhookController } from './sepay-webhook.controller';
import { SepayWebhookService } from './sepay-webhook.service';

@Module({
  imports: [ScheduleModule.forRoot(), TypeOrmModule.forFeature([Order, PaymentAttempt, PaymentTransaction])],
  controllers: [PaymentController, AdminPaymentController, SepayWebhookController],
  providers: [PaymentService, SepayWebhookService, PaymentConfigService, PaymentExpiryScheduler],
  exports: [PaymentConfigService, PaymentService],
})
export class PaymentModule {}
