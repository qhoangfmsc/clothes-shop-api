import { Module } from '@nestjs/common';
import { OrderModule } from '../order/order.module';
import { PaymentModule } from '../payment/payment.module';
import { ReturnModule } from '../return/return.module';
import { PendingCountController } from './pending-count.controller';
import { PendingCountService } from './pending-count.service';

@Module({
  imports: [OrderModule, PaymentModule, ReturnModule],
  controllers: [PendingCountController],
  providers: [PendingCountService],
})
export class PendingCountModule {}
