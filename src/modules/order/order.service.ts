import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from '../address/address.entity';
import { Cart } from '../cart/cart.entity';
import { CartItem } from '../cart/cart-item.entity';
import { CreateOrderDto } from './dtos/order.dto';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';

const SHIPPING_FEES: Record<string, number> = {
  standard: 8,
  express: 15,
  'store-pickup': 0,
};
const FREE_SHIPPING_THRESHOLD = 150;

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepo: Repository<CartItem>,
    @InjectRepository(Address)
    private readonly addressRepo: Repository<Address>,
  ) {}

  async findAll(userId: string) {
    const data = await this.orderRepo.find({
      where: { userId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
    return { data, total: data.length };
  }

  async findOne(userId: string, orderId: string) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, userId },
      relations: ['items'],
    });
    if (!order) throw new NotFoundException('Order not found');
    return { data: order };
  }

  /**
   * Checkout: cart → order
   * 1. Load cart items with product info
   * 2. Snapshot product data into order items
   * 3. Calculate totals
   * 4. Create order
   * 5. Clear cart
   */
  async checkout(userId: string, dto: CreateOrderDto) {
    // Load cart
    const cart = await this.cartRepo.findOne({
      where: { userId },
      relations: ['items', 'items.product'],
    });

    if (!cart || !cart.items || cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // Load address
    const address = await this.addressRepo.findOne({
      where: { id: dto.addressId, userId },
    });
    if (!address) throw new NotFoundException('Address not found');

    // Calculate
    const shippingMethod = dto.shippingMethod || 'standard';
    const subtotal = cart.items.reduce((sum, item) => sum + Number(item.product?.price ?? 0) * item.quantity, 0);
    const shippingFee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : (SHIPPING_FEES[shippingMethod] ?? 8);
    const total = subtotal + shippingFee;

    // Create order
    const order = this.orderRepo.create({
      userId,
      status: 'pending',
      subtotal,
      shippingFee,
      total,
      shippingMethod,
      shippingAddress: {
        fullName: address.fullName,
        phone: address.phone,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        city: address.city,
        province: address.province,
        postalCode: address.postalCode,
        country: address.country,
      },
      note: dto.note || '',
    });
    const savedOrder = await this.orderRepo.save(order);

    // Create order items (snapshot)
    const orderItems = cart.items.map((cartItem) => {
      return this.orderItemRepo.create({
        orderId: savedOrder.id,
        productId: cartItem.productId,
        productName: cartItem.product?.name ?? '',
        productImage: cartItem.product?.images?.[0] ?? '',
        price: Number(cartItem.product?.price ?? 0),
        quantity: cartItem.quantity,
        size: cartItem.size,
        color: cartItem.color,
      });
    });
    await this.orderItemRepo.save(orderItems);

    // Clear cart
    await this.cartItemRepo.delete({ cartId: cart.id });

    // Return full order
    return this.findOne(userId, savedOrder.id);
  }

  async cancel(userId: string, orderId: string) {
    const order = await this.orderRepo.findOne({ where: { id: orderId, userId } });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== 'pending') {
      throw new BadRequestException('Only pending orders can be cancelled');
    }

    order.status = 'cancelled';
    await this.orderRepo.save(order);
    return this.findOne(userId, orderId);
  }
}
