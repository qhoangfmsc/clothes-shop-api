import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { ECollectionErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
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
    const { page, limit } = getPaging(query);

    // Không join "products" (many-to-many) ở đây: join + skip/take sẽ áp LIMIT/OFFSET
    // lên các dòng SQL đã bị nhân theo product, làm sai lệch cả `total` lẫn số
    // collection thực trả về mỗi trang. Paginate trước trên "collections" thuần, xong
    // load products riêng cho đúng tập id đã phân trang (bên dưới).
    const qb = this.collectionRepo.createQueryBuilder('c');

    // Search
    if (search) {
      qb.andWhere('(c.name ILIKE :q OR c.slug ILIKE :q)', { q: `%${search}%` });
    }

    // Sort: `field` = ASC, `-field` = DESC
    const { field, direction } = parseSort(sort, '-createdAt');
    qb.orderBy(`c.${field}`, direction);

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    if (data.length > 0) {
      const withProducts = await this.collectionRepo.find({
        where: { id: In(data.map((c) => c.id)) },
        relations: ['products'],
      });
      const productsById = new Map(withProducts.map((c) => [c.id, c.products]));
      for (const coll of data) {
        coll.products = productsById.get(coll.id) ?? [];
      }
    }

    return paginated(data, total, page, limit);
  }

  async findBySlug(slug: string) {
    const collection = await this.collectionRepo.findOne({
      where: { slug },
      relations: ['products', 'products.category', 'products.subcategory'],
    });
    if (!collection) {
      throwAppError(ECollectionErrorCode.COLLECTION_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
    }

    return { data: collection, products: collection.products };
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  async findAllAdmin(query: AdminCollectionQueryDto) {
    const { search, season, sort } = query;
    const { page, limit } = getPaging(query);

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

    // Sort: `field` = ASC, `-field` = DESC
    const { field, direction } = parseSort(sort, '-createdAt');
    const order: FindOptionsOrder<Collection> = { [field]: direction };

    const [data, total] = await this.collectionRepo.findAndCount({
      where,
      relations: ['products'],
      order,
      skip: (page - 1) * limit,
      take: limit,
    });

    return paginated(data, total, page, limit);
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
      throwAppError(ECollectionErrorCode.COLLECTION_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
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
      throwAppError(ECollectionErrorCode.COLLECTION_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
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
