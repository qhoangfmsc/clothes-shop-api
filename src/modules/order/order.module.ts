import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrencyModule } from '../currency/currency.module';
import { PaymentModule } from '../payment/payment.module';
import { RefundModule } from '../refund/refund.module';
import { ShippingModule } from '../shipping/shipping.module';
import { OrderCheckoutController } from './checkout/order-checkout.controller';
import { OrderCheckoutService } from './checkout/order-checkout.service';
import { AdminOrderQueryController } from './query/admin-order-query.controller';
import { OrderQueryController } from './query/order-query.controller';
import { OrderQueryService } from './query/order-query.service';
import { Order } from './shared/order.entity';
import { OrderItem } from './shared/order-item.entity';
import { AdminOrderStatusController } from './status/admin-order-status.controller';
import { OrderStatusController } from './status/order-status.controller';
import { OrderStatusService } from './status/order-status.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem]), ShippingModule, PaymentModule, RefundModule, CurrencyModule],
  controllers: [
    OrderQueryController,
    OrderCheckoutController,
    OrderStatusController,
    AdminOrderQueryController,
    AdminOrderStatusController,
  ],
  providers: [OrderQueryService, OrderCheckoutService, OrderStatusService],
  exports: [OrderQueryService],
})
export class OrderModule {}
