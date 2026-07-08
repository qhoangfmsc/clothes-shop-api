import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './product.entity';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async findAll(query: { category?: string; subcategory?: string; badge?: string; sort?: string; limit?: number }) {
    const qb = this.productRepo.createQueryBuilder('p').where('p.status = :status', { status: 'active' });

    if (query.category) {
      qb.andWhere('p.category = :category', { category: query.category });
    }

    if (query.subcategory) {
      qb.andWhere('p.subcategory = :subcategory', { subcategory: query.subcategory });
    }

    if (query.badge) {
      qb.andWhere('p.badge = :badge', { badge: query.badge });
    }

    // Sort
    if (query.sort) {
      switch (query.sort) {
        case 'price_asc':
          qb.orderBy('p.price', 'ASC');
          break;
        case 'price_desc':
          qb.orderBy('p.price', 'DESC');
          break;
        case 'newest':
          qb.orderBy('p.created_at', 'DESC');
          break;
        default:
          qb.orderBy('p.created_at', 'DESC');
      }
    } else {
      qb.orderBy('p.created_at', 'DESC');
    }

    if (query.limit && query.limit > 0) {
      qb.take(query.limit);
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findById(id: string) {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Get related products (same category, exclude self)
    const related = await this.productRepo
      .createQueryBuilder('p')
      .where('p.category = :category', { category: product.category })
      .andWhere('p.id != :id', { id: product.id })
      .andWhere('p.status = :status', { status: 'active' })
      .orderBy('p.created_at', 'DESC')
      .take(4)
      .getMany();

    return { data: product, related };
  }
}
