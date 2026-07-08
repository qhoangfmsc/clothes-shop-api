import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wishlist } from './wishlist.entity';

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(Wishlist)
    private readonly wishlistRepo: Repository<Wishlist>,
  ) {}

  async findAll(userId: string) {
    const data = await this.wishlistRepo.find({
      where: { userId },
      relations: ['product'],
      order: { createdAt: 'DESC' },
    });
    return { data, total: data.length };
  }

  async add(userId: string, productId: string) {
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
