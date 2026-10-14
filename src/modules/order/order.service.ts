import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { NON_ORDERABLE_BADGES } from '@common/constants/enum-values.constant';
import { throwAppError } from '@common/exceptions/app.exception';
import { EOrderErrorCode } from '@common/exceptions/error-codes';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Address } from '../address/address.entity';
import { Cart } from '../cart/cart.entity';
import { CartItem } from '../cart/cart-item.entity';
import { PaymentService } from '../payment/payment.service';
import { convertToVnd } from '../payment/payment-amount.util';
import { PaymentConfigService } from '../payment/payment-config.service';
import { RefundService } from '../payment/refund.service';
import { ShippingConfigService } from '../shipping/shipping-config.service';
import { UpdateOrderStatusDto } from './dtos/admin-order.dto';
import { AdminOrderQueryDto } from './dtos/admin-order-query.dto';
import { CreateOrderDto, PickupContactDto, QuoteOrderDto } from './dtos/order.dto';
import { PublicOrderQueryDto } from './dtos/public-order-query.dto';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { applyOrderNeedsActionFilter } from './order-needs-action.util';

const roundMoney = (value: number) => Math.round(value * 100) / 100;

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
    private readonly shippingConfigService: ShippingConfigService,
    private readonly paymentConfigService: PaymentConfigService,
    private readonly paymentService: PaymentService,
    private readonly refundService: RefundService,
  ) {}

  async findAll(userId: string, query: PublicOrderQueryDto = {}) {
    const { status, sort } = query;
    const { page, limit } = getPaging(query);

    const qb = this.orderRepo.createQueryBuilder('o').leftJoinAndSelect('o.items', 'items').where('o.userId = :userId', { userId });

    // Filter by status
    if (status) {
      qb.andWhere('o.status = :status', { status });
    }

    // Sort: `field` = ASC, `-field` = DESC
    const { field, direction } = parseSort(sort, '-createdAt');
    qb.orderBy(`o.${field}`, direction);

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return paginated(data, total, page, limit);
  }

  async findOne(userId: string, orderId: string) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, userId },
      relations: ['items'],
    });
    if (!order) throw new NotFoundException('Order not found');
    // Kèm các nội dung chuyển khoản đã cấp cho đơn (kể cả đã hết hạn) để khách xem lại và đọc cho cửa hàng, và các khoản hoàn tiền
    const [paymentAttempts, refunds] = await Promise.all([
      this.paymentService.listAttemptsForCustomer(order),
      this.refundService.listForCustomer(order.id),
    ]);
    return { data: { ...order, paymentAttempts, refunds } };
  }

  /**
   * Báo giá: cùng kiểm tra giỏ và cùng hàm tính tiền với checkout, nhưng không tạo đơn, không xoá giỏ.
   */
  async quote(userId: string, dto: QuoteOrderDto) {
    const shippingMethod = dto.shippingMethod || 'standard';
    const { selectedItems } = await this.loadSelectedItems(this.dataSource.manager, userId, dto.cartItemIds);
    const totals = await this.calculateTotals(selectedItems, shippingMethod);
    // Cùng hàm quy đổi với phiên thanh toán QR → số VND ở checkout và ở trang QR luôn bằng nhau (khi tỷ giá không đổi giữa hai lần)
    const vndPerUnit = this.paymentConfigService.getVndPerUnit();
    return {
      data: {
        shippingMethod,
        ...totals,
        vndPerUnit,
        amountVnd: vndPerUnit === null ? null : convertToVnd(totals.total, vndPerUnit),
      },
    };
  }

  /**
   * Checkout: cart → order
   * Wrapped in a DB transaction — nếu bất kỳ bước nào fail, toàn bộ rollback.
   */
  async checkout(userId: string, dto: CreateOrderDto) {
    const shippingMethod = dto.shippingMethod || 'standard';
    // Kiểm tra tổ hợp phương thức/địa chỉ/người nhận trước khi đụng DB
    const delivery = this.resolveDelivery(shippingMethod, dto);

    return this.dataSource.transaction(async (manager) => {
      const { cart, selectedItems } = await this.loadSelectedItems(manager, userId, dto.cartItemIds);

      // Địa chỉ giao (standard/express, hoặc store-pickup gửi addressId) hoặc người nhận tại cửa hàng
      let shippingAddress: Record<string, string>;
      if (delivery.kind === 'address') {
        const address = await manager.findOne(Address, {
          where: { id: delivery.addressId, userId },
        });
        if (!address) throw new NotFoundException('Address not found');
        shippingAddress = {
          fullName: address.fullName,
          phone: address.phone,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2,
          city: address.city,
          province: address.province,
          postalCode: address.postalCode,
          country: address.country,
        };
      } else {
        shippingAddress = { fullName: delivery.contact.fullName, phone: delivery.contact.phone };
      }

      const { subtotal, shippingFee, total } = await this.calculateTotals(selectedItems, shippingMethod);

      // Create order
      const order = manager.create(Order, {
        userId,
        status: 'pending',
        subtotal,
        shippingFee,
        total,
        shippingMethod,
        shippingAddress,
        note: dto.note || '',
      });
      const savedOrder = await manager.save(order);

      // Create order items (snapshot product info)
      const orderItems = selectedItems.map((cartItem) =>
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

      // Remove only the ordered items from the cart (whole cart when cartItemIds is omitted)
      await manager.delete(CartItem, { cartId: cart.id, id: In(selectedItems.map((item) => item.id)) });

      // Return full order (re-read within transaction for consistency)
      const result = await manager.findOne(Order, {
        where: { id: savedOrder.id },
        relations: ['items'],
      });
      return { data: result };
    });
  }

  /**
   * Quy tắc phương thức giao ↔ địa chỉ/người nhận:
   * - standard/express: bắt buộc addressId, không nhận pickupContact
   * - store-pickup: đúng một trong addressId hoặc pickupContact
   */
  private resolveDelivery(
    shippingMethod: string,
    dto: CreateOrderDto,
  ): { kind: 'address'; addressId: string } | { kind: 'pickup'; contact: PickupContactDto } {
    if (shippingMethod !== 'store-pickup') {
      if (dto.pickupContact) throwAppError(EOrderErrorCode.ORDER_PICKUP_CONTACT_NOT_ALLOWED);
      if (!dto.addressId) throwAppError(EOrderErrorCode.ORDER_ADDRESS_REQUIRED);
      return { kind: 'address', addressId: dto.addressId };
    }

    if (dto.addressId && dto.pickupContact) {
      throwAppError(EOrderErrorCode.ORDER_PICKUP_CONTACT_NOT_ALLOWED, 'For store-pickup send either addressId or pickupContact, not both');
    }
    if (dto.addressId) return { kind: 'address', addressId: dto.addressId };
    if (dto.pickupContact) return { kind: 'pickup', contact: dto.pickupContact };
    return throwAppError(EOrderErrorCode.ORDER_PICKUP_CONTACT_REQUIRED);
  }

  /** Nạp giỏ và các dòng được chọn, kiểm tra tồn tại/còn bán/đặt được — dùng chung cho quote và checkout */
  private async loadSelectedItems(manager: EntityManager, userId: string, cartItemIds?: string[]) {
    // Load cart with items & product info
    const cart = await manager.findOne(Cart, {
      where: { userId },
      relations: ['items', 'items.product'],
    });

    // Tập item sẽ đặt: theo cartItemIds nếu có, ngược lại là cả giỏ
    let selectedItems = cart?.items ?? [];
    if (cartItemIds) {
      const ids = new Set(cartItemIds);
      selectedItems = selectedItems.filter((item) => ids.has(item.id));
      if (selectedItems.length !== ids.size) {
        throw new BadRequestException('Some selected cart items do not exist in your cart');
      }
    }

    if (!cart || !selectedItems.length) {
      throw new BadRequestException('Cart is empty');
    }

    // Validate product availability (sản phẩm bị xoá hoặc disabled)
    const missingProducts = selectedItems.filter((item) => !item.product || item.product.status !== 'active');
    if (missingProducts.length > 0) {
      const names = missingProducts.map((i) => i.product?.name || i.productId).join(', ');
      throw new BadRequestException(`Some products are no longer available: ${names}`);
    }

    // sold_out / custom_order không đặt được qua checkout thường (custom_order sẽ có luồng riêng)
    const notOrderable = selectedItems.filter((item) => item.product?.badge && NON_ORDERABLE_BADGES.includes(item.product.badge));
    if (notOrderable.length > 0) {
      const names = [...new Set(notOrderable.map((i) => i.product.name))].join(', ');
      throwAppError(EOrderErrorCode.ORDER_PRODUCT_NOT_ORDERABLE, `Some products cannot be ordered (sold out or custom order): ${names}`);
    }

    return { cart, selectedItems };
  }

  /** Nơi DUY NHẤT tính tiền đơn: subtotal + phí ship theo `SHIPPING_CONFIG` (ngưỡng miễn phí áp cho mọi phương thức) */
  private async calculateTotals(selectedItems: CartItem[], shippingMethod: string) {
    // Làm tròn 2 chữ số như cột decimal(10,2): tránh nhiễu dấu phẩy động (0.1 × 3 = 0.30000000000000004) làm báo giá,
    // số lưu trong DB và số VND của QR lệch nhau
    const subtotal = roundMoney(selectedItems.reduce((sum, item) => sum + Number(item.product!.price) * item.quantity, 0));
    const shipping = await this.shippingConfigService.get();
    const methodPrice = (shipping.methods.find((m) => m.id === shippingMethod) ?? shipping.methods.find((m) => m.id === 'standard'))!.price;
    const freeShipping = shipping.freeShippingThreshold !== null && subtotal >= shipping.freeShippingThreshold;
    const shippingFee = freeShipping ? 0 : methodPrice;
    return {
      subtotal,
      shippingFee,
      total: roundMoney(subtotal + shippingFee),
      freeShipping,
      freeShippingThreshold: shipping.freeShippingThreshold,
    };
  }

  /**
   * Khách chỉ huỷ được đơn CHƯA thanh toán và còn `pending`. Đơn đã thanh toán (tự sang `confirmed` ngay khi trả tiền) khách không
   * tự huỷ: phải liên hệ cửa hàng, admin huỷ và hoàn tiền (xem `updateStatus`).
   */
  async cancel(userId: string, orderId: string) {
    await this.dataSource.transaction(async (manager) => {
      // Khoá dòng đơn: không đua với webhook đang ghi nhận thanh toán cho đúng đơn này (thứ tự khoá order → attempt như payment)
      const order = await manager.findOne(Order, { where: { id: orderId, userId }, lock: { mode: 'pessimistic_write' } });
      if (!order) throw new NotFoundException('Order not found');

      if (order.paymentStatus === 'unpaid') {
        if (order.status !== 'pending') throw new BadRequestException('Only pending orders can be cancelled');
      } else {
        if (order.status === 'cancelled') throw new BadRequestException('Order has already been cancelled');
        throwAppError(EOrderErrorCode.ORDER_CANCEL_PAID_NOT_ALLOWED);
      }

      // Đơn chưa trả nên không có khoản hoàn
      await this.cancelLocked(manager, order, null);
    });
    return this.findOne(userId, orderId);
  }

  /**
   * Huỷ một đơn đã được khoá: đổi `cancelled`, các mã chuyển khoản còn chờ → `CANCELLED`, và nếu đơn đã trả tiền (chỉ admin huỷ được)
   * thì tạo yêu cầu hoàn tiền — tất cả trong transaction của nơi gọi, nên không bao giờ có đơn huỷ đã thu tiền mà thiếu yêu cầu hoàn.
   */
  private async cancelLocked(manager: EntityManager, order: Order, adminId: string | null) {
    // Yêu cầu hoàn tiền trước: nếu không tạo được (đơn đã trả mà không có phiên PAID) thì không đổi gì cả
    if (order.paymentStatus === 'paid') await this.refundService.createForCancelledOrder(manager, order.id, adminId);
    await manager.update(Order, { id: order.id }, { status: 'cancelled' });
    order.status = 'cancelled';
    await this.paymentService.cancelPendingAttempts(order.id, manager);
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  async findAllAdmin(query: AdminOrderQueryDto) {
    const { userId, search, status, paymentStatus, needsAction, sort } = query;
    const { page, limit } = getPaging(query);

    const qb = this.orderRepo.createQueryBuilder('o').leftJoinAndSelect('o.items', 'items');

    // Filter by userId
    if (userId) {
      qb.andWhere('o.user_id = :userId', { userId });
    }

    // Filter by status
    if (status) {
      qb.andWhere('o.status = :status', { status });
    }

    // Chỉ đơn cần admin thao tác (cùng điều kiện với con số trên menu admin)
    if (needsAction) applyOrderNeedsActionFilter(qb);

    // Filter by payment status (unpaid | paid)
    if (paymentStatus) {
      qb.andWhere('o.payment_status = :paymentStatus', { paymentStatus });
    }

    // Search: id, phone, fullName (phone & fullName nằm trong JSONB shipping_address)
    if (search) {
      qb.andWhere(
        "(o.id ILIKE :search OR o.shipping_address->>'phone' ILIKE :search OR o.shipping_address->>'fullName' ILIKE :search OR EXISTS (SELECT 1 FROM payment_attempts pa WHERE pa.order_id = o.id AND pa.transfer_code ILIKE :search))",
        {
          search: `%${search}%`,
        },
      );
    }

    // Sort: `field` = ASC, `-field` = DESC
    const { field, direction } = parseSort(sort, '-createdAt');
    qb.orderBy(`o.${field}`, direction);

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return paginated(data, total, page, limit);
  }

  /** Số đơn cần admin thao tác — cùng điều kiện với bộ lọc `needsAction` của `findAllAdmin` */
  async countNeedsAction(): Promise<number> {
    return applyOrderNeedsActionFilter(this.orderRepo.createQueryBuilder('o')).getCount();
  }

  async findOneAdmin(orderId: string) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['items'],
    });
    if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND);
    return { data: order };
  }

  async updateStatus(adminId: string, orderId: string, dto: UpdateOrderStatusDto) {
    await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, { where: { id: orderId }, lock: { mode: 'pessimistic_write' } });
      if (!order) throwAppError(EOrderErrorCode.ORDER_NOT_FOUND);

      // Validate status transition (trên bản đã khoá: không đua với thanh toán hay huỷ đồng thời)
      const allowed = VALID_TRANSITIONS[order.status];
      if (!allowed || !allowed.includes(dto.status)) {
        throwAppError(
          EOrderErrorCode.ORDER_STATUS_INVALID_TRANSITION,
          `Cannot change status from '${order.status}' to '${dto.status}'. Allowed transitions: ${allowed?.join(', ') || 'none'}`,
        );
      }

      if (dto.status === 'cancelled') {
        // Đơn đã trả mà bị huỷ → tự có yêu cầu hoàn tiền
        await this.cancelLocked(manager, order, adminId);
      } else {
        // `delivered` là mốc bắt đầu hạn đổi trả
        await manager.update(
          Order,
          { id: order.id },
          { status: dto.status, ...(dto.status === 'delivered' ? { deliveredAt: new Date() } : {}) },
        );
      }
    });

    return this.findOneAdmin(orderId);
  }
}
