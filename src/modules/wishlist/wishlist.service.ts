import { throwAppError } from '@common/exceptions/app.exception';
import { EProductErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrencyService } from '../currency/currency.service';
import { Product } from '../product/product.entity';
import { presentProduct } from '../product/product.presenter';
import { Wishlist } from './wishlist.entity';

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(Wishlist)
    private readonly wishlistRepo: Repository<Wishlist>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly currencyService: CurrencyService,
  ) {}

  async findAll(userId: string) {
    const data = await this.wishlistRepo.find({
      where: { userId },
      relations: ['product'],
      order: { createdAt: 'DESC' },
    });
    const rate = await this.currencyService.getVndPerUsd();
    return {
      data: data.map((item) => ({ ...item, product: item.product ? presentProduct(item.product, rate) : item.product })),
      total: data.length,
    };
  }

  async add(userId: string, productId: string) {
    // Validate product exists
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) throwAppError(EProductErrorCode.PRODUCT_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

    const existing = await this.wishlistRepo.findOne({ where: { userId, productId } });
    if (existing) return { data: existing, created: false };

    const item = this.wishlistRepo.create({ userId, productId });
    const saved = await this.wishlistRepo.save(item);
    return { data: saved, created: true };
  }

  async remove(userId: string, productId: string) {
    const item = await this.wishlistRepo.findOne({ where: { userId, productId } });
    if (!item) return { success: true };
    await this.wishlistRepo.remove(item);
    return { success: true };
  }

  async check(userId: string, productId: string) {
    const exists = await this.wishlistRepo.findOne({ where: { userId, productId } });
    return { inWishlist: !!exists };
  }
}
