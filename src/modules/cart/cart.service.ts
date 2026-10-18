import { NON_ORDERABLE_BADGES } from '@common/constants/enum-values.constant';
import { throwAppError } from '@common/exceptions/app.exception';
import { EOrderErrorCode, EProductErrorCode } from '@common/exceptions/error-codes';
import { money } from '@common/utils/money.util';
import { BadRequestException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrencyService } from '../currency/currency.service';
import { Product } from '../product/product.entity';
import { presentProduct } from '../product/product.presenter';
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

  /** Get or create cart for user */
  private async getOrCreateCart(userId: string): Promise<Cart> {
    let cart = await this.cartRepo.findOne({ where: { userId } });
    if (!cart) {
      cart = this.cartRepo.create({ userId });
      cart = await this.cartRepo.save(cart);
    }
    return cart;
  }

  async getCart(userId: string) {
    const cart = await this.cartRepo.findOne({
      where: { userId },
      relations: ['items', 'items.product'],
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
    if (product.status !== 'active') throw new BadRequestException('Product is not available');
    // sold_out / custom_order không thêm vào giỏ được (cùng mã lỗi với checkout để FE xử lý một chỗ)
    if (product.badge && NON_ORDERABLE_BADGES.includes(product.badge)) {
      throwAppError(
        EOrderErrorCode.ORDER_PRODUCT_NOT_ORDERABLE,
        `Product cannot be added to cart (sold out or custom order): ${product.name}`,
      );
    }

    // Check if same product+size+color already in cart
    const existing = await this.cartItemRepo.findOne({
      where: { cartId: cart.id, productId: dto.productId, size: dto.size || '', color: dto.color || '' },
    });

    if (existing) {
      existing.quantity += dto.quantity || 1;
      await this.cartItemRepo.save(existing);
    } else {
      const item = this.cartItemRepo.create({
        cartId: cart.id,
        productId: dto.productId,
        quantity: dto.quantity || 1,
        size: dto.size || '',
        color: dto.color || '',
      });
      await this.cartItemRepo.save(item);
    }

    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const cart = await this.cartRepo.findOne({ where: { userId } });
    if (!cart) throw new NotFoundException('Cart not found');

    const item = await this.cartItemRepo.findOne({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw new NotFoundException('Cart item not found');

    item.quantity = dto.quantity;
    await this.cartItemRepo.save(item);

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.cartRepo.findOne({ where: { userId } });
    if (!cart) throw new NotFoundException('Cart not found');

    const item = await this.cartItemRepo.findOne({ where: { id: itemId, cartId: cart.id } });
    if (!item) throw new NotFoundException('Cart item not found');

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
