import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentAttempt } from '../payment/shared/payment-attempt.entity';
import { PaymentTransaction } from '../payment/shared/payment-transaction.entity';
import { AdminRefundController } from './admin-refund.controller';
import { Refund } from './refund.entity';
import { RefundService } from './refund.service';
import { RefundQueryService } from './refund-query.service';

@Module({
  imports: [TypeOrmModule.forFeature([Refund, PaymentAttempt, PaymentTransaction])],
  controllers: [AdminRefundController],
  providers: [RefundService, RefundQueryService],
  exports: [RefundService, RefundQueryService],
})
export class RefundModule {}
