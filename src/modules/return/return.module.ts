import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../order/order.entity';
import { OrderItem } from '../order/order-item.entity';
import { RefundModule } from '../refund/refund.module';
import { ShippingModule } from '../shipping/shipping.module';
import { AdminReturnController } from './admin-return.controller';
import { ReturnController } from './return.controller';
import { ReturnService } from './return.service';
import { ReturnQueryService } from './return-query.service';
import { ReturnRequest } from './return-request.entity';
import { ReturnRequestItem } from './return-request-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, ReturnRequest, ReturnRequestItem]), RefundModule, ShippingModule],
  controllers: [ReturnController, AdminReturnController],
  providers: [ReturnService, ReturnQueryService],
  exports: [ReturnQueryService],
})
export class ReturnModule {}
