import { throwAppError } from '@common/exceptions/app.exception';
import { EOrderErrorCode } from '@common/exceptions/error-codes';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Address } from '../address/address.entity';
import { Cart } from '../cart/cart.entity';
import { CartItem } from '../cart/cart-item.entity';
import { UpdateOrderStatusDto } from './dtos/admin-order.dto';
import { AdminOrderQueryDto } from './dtos/admin-order-query.dto';
import { CreateOrderDto } from './dtos/order.dto';
import { PublicOrderQueryDto } from './dtos/public-order-query.dto';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';

const SHIPPING_FEES: Record<string, number> = {
  standard: 8,
  express: 15,
  'store-pickup': 0,
};
const FREE_SHIPPING_THRESHOLD = 150;

/**
 * Luồng trạng thái hợp lệ
 * pending   → confirmed | cancelled
 * confirmed → shipping  | cancelled
 * shipping  → delivered
 * delivered → completed
 * completed → (terminal)
 * cancelled → (terminal)
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipping', 'cancelled'],
  shipping: ['delivered'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findAll(userId: string, query: PublicOrderQueryDto = {}) {
    const { status, sort } = query;
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const qb = this.orderRepo.createQueryBuilder('o').leftJoinAndSelect('o.items', 'items').where('o.userId = :userId', { userId });

    // Filter by status
    if (status) {
      qb.andWhere('o.status = :status', { status });
    }

    // Sort
    if (sort === 'oldest') {
      qb.orderBy('o.createdAt', 'ASC');
    } else {
      qb.orderBy('o.createdAt', 'DESC');
    }

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
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
   * Wrapped in a DB transaction — nếu bất kỳ bước nào fail, toàn bộ rollback.
   */
  async checkout(userId: string, dto: CreateOrderDto) {
    return this.dataSource.transaction(async (manager) => {
      // Load cart with items & product info
      const cart = await manager.findOne(Cart, {
        where: { userId },
        relations: ['items', 'items.product'],
      });

      if (!cart?.items?.length) {
        throw new BadRequestException('Cart is empty');
      }

      // Validate product availability (sản phẩm bị xoá hoặc disabled)
      const missingProducts = cart.items.filter((item) => !item.product || item.product.status !== 'active');
      if (missingProducts.length > 0) {
        const names = missingProducts.map((i) => i.product?.name || i.productId).join(', ');
        throw new BadRequestException(`Some products are no longer available: ${names}`);
      }

      // Load & validate address
      const address = await manager.findOne(Address, {
        where: { id: dto.addressId, userId },
      });
      if (!address) throw new NotFoundException('Address not found');

      // Calculate totals
      const shippingMethod = dto.shippingMethod || 'standard';
      const subtotal = cart.items.reduce((sum, item) => sum + Number(item.product!.price) * item.quantity, 0);
      const shippingFee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : (SHIPPING_FEES[shippingMethod] ?? 8);
      const total = subtotal + shippingFee;

      // Create order
      const order = manager.create(Order, {
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
      const savedOrder = await manager.save(order);

      // Create order items (snapshot product info)
      const orderItems = cart.items.map((cartItem) =>
        manager.create(OrderItem, {
          orderId: savedOrder.id,
          productId: cartItem.productId,
          productName: cartItem.product!.name,
          productImage: cartItem.product!.images?.[0] ?? '',
          price: Number(cartItem.product!.price),
          quantity: cartItem.quantity,
          size: cartItem.size,
          color: cartItem.color,
        }),
      );
      await manager.save(orderItems);

      // Clear cart
      await manager.delete(CartItem, { cartId: cart.id });

      // Return full order (re-read within transaction for consistency)
      const result = await manager.findOne(Order, {
        where: { id: savedOrder.id },
        relations: ['items'],
      });
      return { data: result };
    });
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

  // ============================================
  // ADMIN METHODS
  // ============================================

  async findAllAdmin(query: AdminOrderQueryDto) {
    const { userId, search, status, sort, page = 1, limit = 25 } = query;

    const qb = this.orderRepo.createQueryBuilder('o').leftJoinAndSelect('o.items', 'items');

    // Filter by userId
    if (userId) {
      qb.andWhere('o.user_id = :userId', { userId });
    }

    // Filter by status
    if (status) {
      qb.andWhere('o.status = :status', { status });
    }

    // Search: id, phone, fullName (phone & fullName nằm trong JSONB shipping_address)
    if (search) {
      qb.andWhere("(o.id ILIKE :search OR o.shipping_address->>'phone' ILIKE :search OR o.shipping_address->>'fullName' ILIKE :search)", {
        search: `%${search}%`,
      });
    }

    // Sort: "field" = DESC, "-field" = ASC
    if (sort) {
      const isAsc = sort.startsWith('-');
      const field = isAsc ? sort.slice(1) : sort;
      qb.orderBy(`o.${field}`, isAsc ? 'ASC' : 'DESC');
    } else {
      qb.orderBy('o.createdAt', 'DESC');
    }

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async findOneAdmin(orderId: string) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['items'],
    });
    if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND);
    return { data: order };
  }

  async updateStatus(orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND);

    // Validate status transition
    const allowed = VALID_TRANSITIONS[order.status];
    if (!allowed || !allowed.includes(dto.status)) {
      throwAppError(
        EOrderErrorCode.ORDER_STATUS_INVALID_TRANSITION,
        `Cannot change status from '${order.status}' to '${dto.status}'. Allowed transitions: ${allowed?.join(', ') || 'none'}`,
      );
    }

    order.status = dto.status;
    await this.orderRepo.save(order);

    return this.findOneAdmin(orderId);
  }
}
