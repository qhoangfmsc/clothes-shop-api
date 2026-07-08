import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Cart } from '../cart/cart.entity';
import { CartItem } from '../cart/cart-item.entity';
import { Address } from '../address/address.entity';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, Cart, CartItem, Address])],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}
