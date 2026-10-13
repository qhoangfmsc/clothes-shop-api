import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentModule } from '../payment/payment.module';
import { ShippingModule } from '../shipping/shipping.module';
import { AdminOrderController } from './admin-order.controller';
import { OrderController } from './order.controller';
import { Order } from './order.entity';
import { OrderService } from './order.service';
import { OrderItem } from './order-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem]), ShippingModule, PaymentModule],
  controllers: [OrderController, AdminOrderController],
  providers: [OrderService],
})
export class OrderModule {}
