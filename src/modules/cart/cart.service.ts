import { isUniqueViolation } from '@common/base/db-error.util';
import { NON_ORDERABLE_BADGES } from '@common/constants/enum-values.constant';
import { throwAppError } from '@common/exceptions/app.exception';
import { ECartErrorCode, EOrderErrorCode, EProductErrorCode } from '@common/exceptions/error-codes';
import { money } from '@common/utils/money.util';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrencyService } from '../currency/currency.service';
import { Product } from '../product/shared/product.entity';
import { presentProduct } from '../product/shared/product.presenter';
import { CART_MAX_ITEM_QUANTITY } from './cart.constant';
import { Cart } from './cart.entity';
import { CartItem } from './cart-item.entity';
import { AddToCartDto, UpdateCartItemDto } from './dtos/cart.dto';

const EMPTY_CART = { items: [], itemCount: 0, subtotalVnd: 0, subtotalUsd: 0 };

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepo: Repository<CartItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly currencyService: CurrencyService,
  ) {}

  /** Lấy hoặc tạo giỏ; thua cuộc đua tạo (`UQ_carts_user`) thì dùng giỏ của request thắng */
  private async getOrCreateCart(userId: string): Promise<Cart> {
    const found = await this.cartRepo.findOne({ where: { userId } });
    if (found) return found;
    try {
      return await this.cartRepo.save(this.cartRepo.create({ userId }));
    } catch (err) {
      const raced = isUniqueViolation(err, 'UQ_carts_user') && (await this.cartRepo.findOne({ where: { userId } }));
      if (!raced) throw err;
      return raced;
    }
  }

  async getCart(userId: string) {
    const cart = await this.cartRepo.findOne({
      where: { userId },
      relations: ['items', 'items.product', 'items.product.category', 'items.product.subcategory'],
    });

    if (!cart) {
      return { data: { ...EMPTY_CART } };
    }

    const rate = await this.currencyService.getVndPerUsd();
    // Tiền tính bằng VND (số nguyên) rồi mới suy ra USD, nên tổng USD luôn là quy đổi của tổng VND
    const lines = cart.items.map((item) => ({ item, lineTotalVnd: Number(item.product?.price ?? 0) * item.quantity }));
    const subtotalVnd = lines.reduce((sum, line) => sum + line.lineTotalVnd, 0);

    return {
      data: {
        id: cart.id,
        items: lines.map(({ item, lineTotalVnd }) => ({
          id: item.id,
          productId: item.productId,
          product: item.product ? presentProduct(item.product, rate) : item.product,
          quantity: item.quantity,
          size: item.size,
          color: item.color,
          ...money('lineTotal', lineTotalVnd, rate),
        })),
        ...money('subtotal', subtotalVnd, rate),
        itemCount: lines.reduce((sum, line) => sum + line.item.quantity, 0),
      },
    };
  }

  async addItem(userId: string, dto: AddToCartDto) {
    const cart = await this.getOrCreateCart(userId);

    // Validate product exists and is active
    const product = await this.productRepo.findOne({ where: { id: dto.productId } });
    if (!product) throwAppError(EProductErrorCode.PRODUCT_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
    if (product.status !== 'active') throwAppError(ECartErrorCode.CART_PRODUCT_UNAVAILABLE);
    // sold_out / custom_order không thêm vào giỏ được (cùng mã lỗi với checkout để FE xử lý một chỗ)
    if (product.badge && NON_ORDERABLE_BADGES.includes(product.badge)) {
      throwAppError(
        EOrderErrorCode.ORDER_PRODUCT_NOT_ORDERABLE,
        `Product cannot be added to cart (sold out or custom order): ${product.name}`,
      );
    }

    await this.addQuantity({ cartId: cart.id, productId: dto.productId, size: dto.size || '', color: dto.color || '' }, dto.quantity || 1);

    return this.getCart(userId);
  }

  /**
   * Cộng dồn nguyên tử trong một câu UPDATE (không mất lần cộng, không vượt trần). Dòng chưa có thì tạo. Hai điểm đua cần thử lại:
   * dòng vừa được request khác tạo (thua `UQ_cart_items_unique`, hoặc UPDATE chạy trước khi dòng xuất hiện) nên chỉ kết luận "đạt giới hạn"
   * khi UPDATE đã thất bại lần thứ hai dù dòng đã tồn tại.
   */
  private async addQuantity(line: { cartId: string; productId: string; size: string; color: string }, quantity: number): Promise<void> {
    let sawExistingLine = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const updated = await this.cartItemRepo
        .createQueryBuilder()
        .update()
        .set({ quantity: () => 'quantity + :quantity' })
        .where('cart_id = :cartId AND product_id = :productId AND size = :size AND color = :color AND quantity + :quantity <= :max', {
          ...line,
          quantity,
          max: CART_MAX_ITEM_QUANTITY,
        })
        .execute();
      if (updated.affected) return;

      if (await this.cartItemRepo.exists({ where: line })) {
        if (sawExistingLine)
          throwAppError(ECartErrorCode.CART_QUANTITY_LIMIT, `Cart item quantity limit (${CART_MAX_ITEM_QUANTITY}) reached`);
        sawExistingLine = true;
        continue;
      }
      try {
        await this.cartItemRepo.save(this.cartItemRepo.create({ ...line, quantity }));
        return;
      } catch (err) {
        if (!isUniqueViolation(err, 'UQ_cart_items_unique')) throw err;
      }
    }
    throwAppError(ECartErrorCode.CART_QUANTITY_LIMIT, `Cart item quantity limit (${CART_MAX_ITEM_QUANTITY}) reached`);
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const cart = await this.cartRepo.findOne({ where: { userId } });
    if (!cart) throwAppError(ECartErrorCode.CART_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

    const item = await this.cartItemRepo.findOne({ where: { id: itemId, cartId: cart.id } });
    if (!item) throwAppError(ECartErrorCode.CART_ITEM_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

    item.quantity = dto.quantity;
    await this.cartItemRepo.save(item);

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.cartRepo.findOne({ where: { userId } });
    if (!cart) throwAppError(ECartErrorCode.CART_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

    const item = await this.cartItemRepo.findOne({ where: { id: itemId, cartId: cart.id } });
    if (!item) throwAppError(ECartErrorCode.CART_ITEM_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

    await this.cartItemRepo.remove(item);

    return this.getCart(userId);
  }

  async clearCart(userId: string) {
    const cart = await this.cartRepo.findOne({ where: { userId } });
    if (!cart) return { data: { ...EMPTY_CART } };

    await this.cartItemRepo.delete({ cartId: cart.id });

    return { data: { ...EMPTY_CART } };
  }
}
