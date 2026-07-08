import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from '../product/product.entity';
import { Collection } from './collection.entity';

@Injectable()
export class CollectionService {
  constructor(
    @InjectRepository(Collection)
    private readonly collectionRepo: Repository<Collection>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async findAll() {
    const data = await this.collectionRepo.find({ order: { createdAt: 'ASC' } });
    return { data, total: data.length };
  }

  async findBySlug(slug: string) {
    const collection = await this.collectionRepo.findOne({ where: { slug } });
    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    // Resolve products from productIds, maintaining order
    let products: Product[] = [];
    if (collection.productIds && collection.productIds.length > 0) {
      const allProducts = await this.productRepo.find({
        where: { id: In(collection.productIds) },
      });

      // Maintain the order from productIds
      const productMap = new Map(allProducts.map((p) => [p.id, p]));
      products = collection.productIds.map((id) => productMap.get(id)).filter(Boolean) as Product[];
    }

    return { data: collection, products };
  }
}
