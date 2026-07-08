import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart } from './cart.entity';
import { CartItem } from './cart-item.entity';
import { AddToCartDto, UpdateCartItemDto } from './dtos/cart.dto';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepo: Repository<CartItem>,
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
      return { data: { items: [], subtotal: 0, itemCount: 0 } };
    }

    const items = cart.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      product: item.product,
      quantity: item.quantity,
      size: item.size,
      color: item.color,
      lineTotal: Number(item.product?.price ?? 0) * item.quantity,
    }));

    const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);

    return {
      data: {
        id: cart.id,
        items,
        subtotal,
        itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
      },
    };
  }

  async addItem(userId: string, dto: AddToCartDto) {
    const cart = await this.getOrCreateCart(userId);

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
    if (!cart) return { data: { items: [], subtotal: 0, itemCount: 0 } };

    await this.cartItemRepo.delete({ cartId: cart.id });

    return { data: { items: [], subtotal: 0, itemCount: 0 } };
  }
}
