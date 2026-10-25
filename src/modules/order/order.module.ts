import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrencyModule } from '../currency/currency.module';
import { PaymentModule } from '../payment/payment.module';
import { RefundModule } from '../refund/refund.module';
import { ShippingModule } from '../shipping/shipping.module';
import { AdminOrderController } from './admin-order.controller';
import { OrderController } from './order.controller';
import { Order } from './order.entity';
import { OrderCheckoutService } from './order-checkout.service';
import { OrderItem } from './order-item.entity';
import { OrderQueryService } from './order-query.service';
import { OrderStatusService } from './order-status.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem]), ShippingModule, PaymentModule, RefundModule, CurrencyModule],
  controllers: [OrderController, AdminOrderController],
  providers: [OrderQueryService, OrderCheckoutService, OrderStatusService],
  exports: [OrderQueryService],
})
export class OrderModule {}
