import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrencyModule } from '../currency/currency.module';
import { Order } from '../order/shared/order.entity';
import { AdminPaymentAttemptController } from './attempt/admin-payment-attempt.controller';
import { PaymentAttemptController } from './attempt/payment-attempt.controller';
import { PaymentAttemptService } from './attempt/payment-attempt.service';
import { PaymentAttemptQueryService } from './attempt/payment-attempt-query.service';
import { PaymentExpiryScheduler } from './attempt/payment-expiry.scheduler';
import { AdminPaymentOverviewController } from './order-payments/admin-payment-overview.controller';
import { PaymentOverviewService } from './order-payments/payment-overview.service';
import { SepayWebhookController } from './sepay/sepay-webhook.controller';
import { SepayWebhookService } from './sepay/sepay-webhook.service';
import { PaymentAttempt } from './shared/payment-attempt.entity';
import { PaymentConfigService } from './shared/payment-config.service';
import { PaymentTransaction } from './shared/payment-transaction.entity';
import { AdminPaymentTransactionController } from './transaction/admin-payment-transaction.controller';
import { PaymentConfirmService } from './transaction/payment-confirm.service';
import { PaymentTransactionQueryService } from './transaction/payment-transaction-query.service';

@Module({
  imports: [ScheduleModule.forRoot(), TypeOrmModule.forFeature([Order, PaymentAttempt, PaymentTransaction]), CurrencyModule],
  controllers: [
    PaymentAttemptController,
    AdminPaymentAttemptController,
    AdminPaymentTransactionController,
    AdminPaymentOverviewController,
    SepayWebhookController,
  ],
  providers: [
    PaymentAttemptService,
    PaymentAttemptQueryService,
    PaymentConfirmService,
    PaymentTransactionQueryService,
    PaymentOverviewService,
    SepayWebhookService,
    PaymentConfigService,
    PaymentExpiryScheduler,
  ],
  exports: [PaymentConfigService, PaymentAttemptService, PaymentAttemptQueryService, PaymentTransactionQueryService],
})
export class PaymentModule {}
