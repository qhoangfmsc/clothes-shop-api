import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../order/shared/order.entity';
import { OrderItem } from '../order/shared/order-item.entity';
import { RefundModule } from '../refund/refund.module';
import { ShippingModule } from '../shipping/shipping.module';
import { AdminReturnController } from './processing/admin-return.controller';
import { ReturnProcessingService } from './processing/return-processing.service';
import { ReturnProcessingQueryService } from './processing/return-processing-query.service';
import { ReturnController } from './request/return.controller';
import { ReturnRequestService } from './request/return-request.service';
import { ReturnRequestQueryService } from './request/return-request-query.service';
import { ReturnRequest } from './shared/return-request.entity';
import { ReturnRequestItem } from './shared/return-request-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, ReturnRequest, ReturnRequestItem]), RefundModule, ShippingModule],
  controllers: [ReturnController, AdminReturnController],
  providers: [ReturnRequestService, ReturnRequestQueryService, ReturnProcessingService, ReturnProcessingQueryService],
  exports: [ReturnProcessingQueryService],
})
export class ReturnModule {}
