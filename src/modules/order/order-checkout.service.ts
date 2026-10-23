import { NON_ORDERABLE_BADGES } from '@common/constants/enum-values.constant';
import { throwAppError } from '@common/exceptions/app.exception';
import { EAddressErrorCode, EOrderErrorCode } from '@common/exceptions/error-codes';
import { money, moneyOrNull } from '@common/utils/money.util';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Address } from '../address/address.entity';
import { Cart } from '../cart/cart.entity';
import { removeOrderedCartItems } from '../cart/cart-checkout.util';
import { CartItem } from '../cart/cart-item.entity';
import { CurrencyService } from '../currency/currency.service';
import { ShippingConfigService } from '../shipping/shipping-config.service';
import { CreateOrderDto, PickupContactDto, QuoteOrderDto } from './dtos/order.dto';
import { ORDER_RELATIONS } from './order.constant';
import { Order } from './order.entity';
import { presentOrder } from './order.presenter';
import { OrderItem } from './order-item.entity';

/** Báo giá và đặt hàng từ giỏ (checkout). */
@Injectable()
export class OrderCheckoutService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly shippingConfigService: ShippingConfigService,
    private readonly currencyService: CurrencyService,
  ) {}

  /**
   * Báo giá: cùng kiểm tra giỏ và cùng hàm tính tiền với checkout, nhưng không tạo đơn, không xoá giỏ.
   */
  async quote(userId: string, dto: QuoteOrderDto) {
    const shippingMethod = dto.shippingMethod || 'standard';
    const { selectedItems } = await this.loadSelectedItems(this.dataSource.manager, userId, dto.cartItemIds);
    const totals = await this.calculateTotals(selectedItems, shippingMethod);
    // Tiền gốc là VND nên `totalVnd` chính là số khách sẽ chuyển ở trang QR; USD suy ra theo tỷ giá hiện tại
    const rate = await this.currencyService.getVndPerUsd();
    return {
      data: {
        shippingMethod,
        ...money('subtotal', totals.subtotal, rate),
        ...money('shippingFee', totals.shippingFee, rate),
        ...money('total', totals.total, rate),
        freeShipping: totals.freeShipping,
        ...moneyOrNull('freeShippingThreshold', totals.freeShippingThresholdVnd, rate),
        exchangeRate: rate,
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
        if (!address) throwAppError(EAddressErrorCode.ADDRESS_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
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

      // Create order (chốt tỷ giá lúc đặt: USD của đơn này không đổi khi admin đổi tỷ giá sau đó)
      const order = manager.create(Order, {
        userId,
        status: 'pending',
        subtotal,
        shippingFee,
        total,
        exchangeRate: await this.currencyService.getVndPerUsd(),
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
      await removeOrderedCartItems(
        manager,
        cart.id,
        selectedItems.map((item) => item.id),
      );

      // Return full order (re-read within transaction for consistency)
      const result = await manager.findOne(Order, {
        where: { id: savedOrder.id },
        relations: ORDER_RELATIONS,
      });
      return { data: presentOrder(result!) };
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
        throwAppError(EOrderErrorCode.ORDER_CART_ITEMS_INVALID);
      }
    }

    if (!cart || !selectedItems.length) {
      throwAppError(EOrderErrorCode.ORDER_CART_EMPTY);
    }

    // Validate product availability (sản phẩm bị xoá hoặc disabled)
    const missingProducts = selectedItems.filter((item) => !item.product || item.product.status !== 'active');
    if (missingProducts.length > 0) {
      const names = missingProducts.map((i) => i.product?.name || i.productId).join(', ');
      throwAppError(EOrderErrorCode.ORDER_PRODUCT_UNAVAILABLE, `Some products are no longer available: ${names}`);
    }

    // sold_out / custom_order không đặt được qua checkout thường (custom_order sẽ có luồng riêng)
    const notOrderable = selectedItems.filter((item) => item.product?.badge && NON_ORDERABLE_BADGES.includes(item.product.badge));
    if (notOrderable.length > 0) {
      const names = [...new Set(notOrderable.map((i) => i.product.name))].join(', ');
      throwAppError(EOrderErrorCode.ORDER_PRODUCT_NOT_ORDERABLE, `Some products cannot be ordered (sold out or custom order): ${names}`);
    }

    return { cart, selectedItems };
  }

  /** Nơi DUY NHẤT tính tiền đơn (VND, số nguyên): subtotal + phí ship theo `SHIPPING_CONFIG` (ngưỡng miễn phí áp cho mọi phương thức) */
  private async calculateTotals(selectedItems: CartItem[], shippingMethod: string) {
    const subtotal = selectedItems.reduce((sum, item) => sum + Number(item.product!.price) * item.quantity, 0);
    const shipping = await this.shippingConfigService.get();
    const methodPrice = (shipping.methods.find((m) => m.id === shippingMethod) ?? shipping.methods.find((m) => m.id === 'standard'))!
      .priceVnd;
    const freeShipping = shipping.freeShippingThresholdVnd !== null && subtotal >= shipping.freeShippingThresholdVnd;
    const shippingFee = freeShipping ? 0 : methodPrice;
    return {
      subtotal,
      shippingFee,
      total: subtotal + shippingFee,
      freeShipping,
      freeShippingThresholdVnd: shipping.freeShippingThresholdVnd,
    };
  }
}
