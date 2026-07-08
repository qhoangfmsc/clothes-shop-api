import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Address } from '../address/address.entity';
import { Cart } from '../cart/cart.entity';
import { CartItem } from '../cart/cart-item.entity';
import { OrderController } from './order.controller';
import { Order } from './order.entity';
import { OrderService } from './order.service';
import { OrderItem } from './order-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, Cart, CartItem, Address])],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}
