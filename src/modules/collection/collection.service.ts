import { throwAppError } from '@common/exceptions/app.exception';
import { ECollectionErrorCode } from '@common/exceptions/error-codes';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsOrder, FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { Product } from '../product/product.entity';
import { Collection } from './collection.entity';
import { AdminCollectionQueryDto } from './dtos/admin-collection-query.dto';
import { CreateCollectionDto, UpdateCollectionDto } from './dtos/collection.dto';
import { PublicCollectionQueryDto } from './dtos/public-collection-query.dto';

@Injectable()
export class CollectionService {
  constructor(
    @InjectRepository(Collection)
    private readonly collectionRepo: Repository<Collection>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async findAll() {
    const data = await this.collectionRepo.find({
      relations: ['products'],
      order: { createdAt: 'ASC' },
    });
    return { data, total: data.length };
  }

  async findAllPublic(query: PublicCollectionQueryDto) {
    const { search, sort } = query;
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const qb = this.collectionRepo.createQueryBuilder('c').leftJoinAndSelect('c.products', 'p');

    // Search
    if (search) {
      qb.andWhere('(c.name ILIKE :q OR c.slug ILIKE :q)', { q: `%${search}%` });
    }

    // Sort
    switch (sort) {
      case 'name_asc':
        qb.orderBy('c.name', 'ASC');
        break;
      case 'name_desc':
        qb.orderBy('c.name', 'DESC');
        break;
      default:
        qb.orderBy('c.createdAt', 'DESC');
        break;
    }

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findBySlug(slug: string) {
    const collection = await this.collectionRepo.findOne({
      where: { slug },
      relations: ['products'],
    });
    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    return { data: collection, products: collection.products };
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  async findAllAdmin(query: AdminCollectionQueryDto) {
    const { search, season, sort, page = 1, limit = 25 } = query;

    // Build base conditions
    const baseConditions: FindOptionsWhere<Collection> = {};
    if (season) baseConditions.season = season;

    // Build where: search creates OR conditions
    let where: FindOptionsWhere<Collection> | FindOptionsWhere<Collection>[];
    if (search) {
      const like = ILike(`%${search}%`);
      where = [
        { slug: like, ...baseConditions },
        { name: like, ...baseConditions },
      ];
    } else {
      where = baseConditions;
    }

    // Sort: "field" = DESC, "-field" = ASC
    let order: FindOptionsOrder<Collection> = { createdAt: 'DESC' };
    if (sort) {
      const isAsc = sort.startsWith('-');
      const field = isAsc ? sort.slice(1) : sort;
      order = { [field]: isAsc ? 'ASC' : 'DESC' };
    }

    const [data, total] = await this.collectionRepo.findAndCount({
      where,
      relations: ['products'],
      order,
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async create(dto: CreateCollectionDto) {
    await this.ensureSlugUnique(dto.slug);

    // Resolve products từ productIds (DTO vẫn nhận mảng ID string)
    let products: Product[] = [];
    if (dto.productIds && dto.productIds.length > 0) {
      products = await this.resolveProducts(dto.productIds);
    }

    const collection = this.collectionRepo.create({
      slug: dto.slug,
      name: dto.name,
      subtitle: dto.subtitle,
      description: dto.description,
      image: dto.image,
      season: dto.season,
      products,
    });
    return { data: await this.collectionRepo.save(collection) };
  }

  async update(id: string, dto: UpdateCollectionDto) {
    const collection = await this.collectionRepo.findOne({
      where: { id },
      relations: ['products'],
    });
    if (!collection) {
      throw new NotFoundException('Collection not found');
    }

    if (dto.slug && dto.slug !== collection.slug) {
      await this.ensureSlugUnique(dto.slug);
    }

    if (dto.productIds !== undefined) {
      collection.products = await this.resolveProducts(dto.productIds);
    }

    // Merge các field còn lại (trừ productIds đã xử lý riêng)
    const { productIds, ...rest } = dto;
    Object.assign(collection, rest);

    return { data: await this.collectionRepo.save(collection) };
  }

  async delete(id: string) {
    const collection = await this.collectionRepo.findOne({ where: { id } });
    if (!collection) {
      throw new NotFoundException('Collection not found');
    }
    await this.collectionRepo.remove(collection);
    return { message: 'Collection deleted successfully' };
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private async ensureSlugUnique(slug: string) {
    const existing = await this.collectionRepo.findOne({ where: { slug } });
    if (existing) {
      throwAppError(ECollectionErrorCode.COLLECTION_SLUG_DUPLICATE);
    }
  }

  private async resolveProducts(productIds: string[]): Promise<Product[]> {
    const found = await this.productRepo.find({ where: { id: In(productIds) } });
    if (found.length !== productIds.length) {
      const foundIds = new Set(found.map((p) => p.id));
      const missing = productIds.filter((id) => !foundIds.has(id));
      throwAppError(ECollectionErrorCode.COLLECTION_PRODUCT_NOT_FOUND, `Products not found: ${missing.join(', ')}`);
    }
    // Giữ thứ tự như input
    const productMap = new Map(found.map((p) => [p.id, p]));
    return productIds.map((id) => productMap.get(id)).filter(Boolean) as Product[];
  }
}
