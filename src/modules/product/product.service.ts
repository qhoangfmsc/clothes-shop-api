import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EProductErrorCode } from '@common/exceptions/error-codes';
import { money } from '@common/utils/money.util';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsOrder, FindOptionsWhere, ILike, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { Category } from '../category/category.entity';
import { SubCategory } from '../category/sub-category.entity';
import { CurrencyService } from '../currency/currency.service';
import { AdminProductQueryDto } from './dtos/admin-product-query.dto';
import { CreateProductDto, UpdateProductDto } from './dtos/product.dto';
import { AUTOCOMPLETE_DEFAULT_LIMIT, ProductAutocompleteQueryDto } from './dtos/product-autocomplete-query.dto';
import { ProductDetailQueryDto, RELATED_DEFAULT_LIMIT } from './dtos/product-detail-query.dto';
import { PublicProductQueryDto } from './dtos/public-product-query.dto';
import { Product } from './product.entity';
import { presentProduct } from './product.presenter';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(SubCategory)
    private readonly subCategoryRepo: Repository<SubCategory>,
    private readonly currencyService: CurrencyService,
  ) {}

  // ============================================
  // PUBLIC METHODS (Phase 1)
  // ============================================

  async findAllPublic(query: PublicProductQueryDto) {
    const { search, category, subcategory, badge, sort, minPrice, maxPrice, minRating, sizes, colors } = query;
    const { page, limit } = getPaging(query);

    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'cat')
      .leftJoinAndSelect('p.subcategory', 'sub')
      .where('p.status = :status', { status: 'active' });

    // Search: ILIKE on name, slug, description
    if (search) {
      qb.andWhere('(p.name ILIKE :q OR p.slug ILIKE :q OR p.description ILIKE :q)', { q: `%${search}%` });
    }

    // Filter by category slug
    if (category) {
      qb.andWhere('cat.slug = :catSlug', { catSlug: category });
    }

    // Filter by subcategory slug
    if (subcategory) {
      qb.andWhere('sub.slug = :subSlug', { subSlug: subcategory });
    }

    // Filter by badge
    if (badge) {
      qb.andWhere('p.badge = :badge', { badge });
    }

    // Filter by price range (VND)
    if (minPrice != null) {
      qb.andWhere('p.price >= :minPrice', { minPrice: Number(minPrice) });
    }
    if (maxPrice != null) {
      qb.andWhere('p.price <= :maxPrice', { maxPrice: Number(maxPrice) });
    }

    // Filter by average rating (sản phẩm chưa có đánh giá có rating_average NULL nên bị loại)
    if (minRating != null) {
      qb.andWhere('p.ratingAverage >= :minRating', { minRating: Number(minRating) });
    }

    // Filter by sizes — JSONB array, use jsonb_array_elements_text for containment
    if (sizes) {
      const sizeArr = sizes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (sizeArr.length > 0) {
        qb.andWhere('EXISTS (SELECT 1 FROM jsonb_array_elements_text(p.sizes) AS sz WHERE sz IN (:...sizeArr))', { sizeArr });
      }
    }

    // Filter by colors — JSONB array of {name, hex}, match against name field
    if (colors) {
      const colorArr = colors
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      if (colorArr.length > 0) {
        qb.andWhere("EXISTS (SELECT 1 FROM jsonb_array_elements(p.colors) AS c WHERE c->>'name' IN (:...colorArr))", { colorArr });
      }
    }

    // Sort: `field` = ASC, `-field` = DESC
    // Sản phẩm chưa có đánh giá (rating_average NULL) luôn xếp cuối, kể cả khi sort tăng dần; `id` làm thứ tự phụ để phân trang ổn định
    const { field, direction } = parseSort(sort, '-createdAt');
    qb.orderBy(`p.${field}`, direction, 'NULLS LAST').addOrderBy('p.id', 'ASC');

    // Pagination
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const rate = await this.currencyService.getVndPerUsd();

    return paginated(
      data.map((product) => presentProduct(product, rate)),
      total,
      page,
      limit,
    );
  }

  async autocomplete({ q, limit = AUTOCOMPLETE_DEFAULT_LIMIT }: ProductAutocompleteQueryDto) {
    const keyword = q.replace(/[\\%_]/g, '\\$&');

    const results = await this.productRepo
      .createQueryBuilder('p')
      .select(['p.id', 'p.name', 'p.slug', 'p.price', 'p.images', 'p.badge', 'p.status'])
      .addSelect('CASE WHEN p.name ILIKE :prefix THEN 0 ELSE 1 END', 'match_rank')
      .where('p.status = :status', { status: 'active' })
      .andWhere('(p.name ILIKE :contains OR p.slug ILIKE :contains)', { contains: `%${keyword}%` })
      .setParameter('prefix', `${keyword}%`)
      .orderBy('match_rank', 'ASC')
      .addOrderBy('p.name', 'ASC')
      .limit(limit)
      .getMany();

    const rate = await this.currencyService.getVndPerUsd();
    return {
      data: results.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        ...money('price', p.price, rate),
        image: p.images?.[0] ?? null,
        badge: p.badge ?? null,
      })),
    };
  }

  async findById(id: string, query: ProductDetailQueryDto = {}) {
    const relatedLimit = query.relatedLimit ?? RELATED_DEFAULT_LIMIT;
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['category', 'subcategory'],
    });
    if (!product) {
      throwAppError(EProductErrorCode.PRODUCT_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
    }

    // Related products: same category, exclude self, active only
    const related = await this.productRepo.find({
      where: {
        status: 'active',
        category: { id: product.category.id },
        id: Not(product.id),
      },
      relations: ['category', 'subcategory'],
      order: { createdAt: 'DESC' },
      take: relatedLimit,
    });

    const rate = await this.currencyService.getVndPerUsd();
    return { data: presentProduct(product, rate), related: related.map((item) => presentProduct(item, rate)) };
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  async findAllAdmin(query: AdminProductQueryDto) {
    const { search, status, category, badge, sort, minRating } = query;
    const { page, limit } = getPaging(query);

    // Build base conditions (non-search filters)
    const baseConditions: FindOptionsWhere<Product> = {};
    if (status) baseConditions.status = status;
    if (badge) baseConditions.badge = badge;
    if (minRating != null) baseConditions.ratingAverage = MoreThanOrEqual(Number(minRating));

    // Resolve category slug → ID
    if (category) {
      const cat = await this.categoryRepo.findOne({ where: { slug: category } });
      if (cat) {
        baseConditions.category = { id: cat.id };
      } else {
        return paginated([], 0, page, limit);
      }
    }

    // Build where: search creates OR conditions, otherwise use baseConditions directly
    let where: FindOptionsWhere<Product> | FindOptionsWhere<Product>[];
    if (search) {
      const like = ILike(`%${search}%`);
      where = [
        { name: like, ...baseConditions },
        { slug: like, ...baseConditions },
        { sku: like, ...baseConditions },
        { description: like, ...baseConditions },
      ];
    } else {
      where = baseConditions;
    }

    // Sort: `field` = ASC, `-field` = DESC
    const { field, direction } = parseSort(sort, '-createdAt');
    const order: FindOptionsOrder<Product> = { [field]: { direction, nulls: 'LAST' }, id: 'ASC' };

    const [data, total] = await this.productRepo.findAndCount({
      where,
      relations: ['category', 'subcategory'],
      order,
      skip: (page - 1) * limit,
      take: limit,
    });
    const rate = await this.currencyService.getVndPerUsd();

    return paginated(
      data.map((product) => presentProduct(product, rate)),
      total,
      page,
      limit,
    );
  }

  async create(dto: CreateProductDto) {
    await this.ensureSlugUnique(dto.slug);
    if (dto.sku) {
      await this.ensureSkuUnique(dto.sku);
    }

    // Validate price logic
    if (dto.originalPriceVnd != null && dto.originalPriceVnd < dto.priceVnd) {
      throwAppError(EProductErrorCode.PRODUCT_INVALID_PRICE);
    }

    // Validate FK
    const category = await this.categoryRepo.findOne({ where: { id: dto.categoryId } });
    if (!category) throwAppError(EProductErrorCode.PRODUCT_CATEGORY_NOT_FOUND);

    const subcategory = await this.subCategoryRepo.findOne({ where: { id: dto.subcategoryId } });
    if (!subcategory) throwAppError(EProductErrorCode.PRODUCT_CATEGORY_NOT_FOUND);

    // Validate subcategory belongs to category
    await this.validateSubcategoryBelongsToCategory(subcategory.id, category.id);

    const sku = dto.sku || `${category.slug}-${subcategory.slug}-${dto.slug}`;

    const { priceVnd, originalPriceVnd, ...rest } = dto;
    const product = this.productRepo.create({ ...rest, price: priceVnd, originalPrice: originalPriceVnd, sku, category, subcategory });
    return { data: presentProduct(await this.productRepo.save(product), await this.currencyService.getVndPerUsd()) };
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['category', 'subcategory'],
    });
    if (!product) throwAppError(EProductErrorCode.PRODUCT_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

    if (dto.slug && dto.slug !== product.slug) await this.ensureSlugUnique(dto.slug);
    if (dto.sku && dto.sku !== product.sku) await this.ensureSkuUnique(dto.sku);

    // Handle FK changes
    if (dto.categoryId) {
      const category = await this.categoryRepo.findOne({ where: { id: dto.categoryId } });
      if (!category) throwAppError(EProductErrorCode.PRODUCT_CATEGORY_NOT_FOUND);
      product.category = category;
    }
    if (dto.subcategoryId) {
      const subcategory = await this.subCategoryRepo.findOne({ where: { id: dto.subcategoryId } });
      if (!subcategory) throwAppError(EProductErrorCode.PRODUCT_CATEGORY_NOT_FOUND);
      product.subcategory = subcategory;
    }

    // Validate subcategory ∈ category
    if (product.category?.id && product.subcategory?.id) {
      await this.validateSubcategoryBelongsToCategory(product.subcategory.id, product.category.id);
    }

    // Validate price logic
    const finalPrice = dto.priceVnd != null ? dto.priceVnd : product.price;
    const finalOriginalPrice = dto.originalPriceVnd !== undefined ? dto.originalPriceVnd : product.originalPrice;
    if (finalOriginalPrice != null && finalOriginalPrice < finalPrice) {
      throwAppError(EProductErrorCode.PRODUCT_INVALID_PRICE);
    }

    // Merge remaining fields (exclude FK fields handled above)
    const { categoryId, subcategoryId, priceVnd, originalPriceVnd, ...rest } = dto;
    Object.assign(product, rest);
    if (priceVnd !== undefined) product.price = priceVnd;
    if (originalPriceVnd !== undefined) product.originalPrice = originalPriceVnd;

    // Regenerate SKU if dependencies changed
    if (categoryId || subcategoryId || dto.slug) {
      product.sku = dto.sku || `${product.category.slug}-${product.subcategory.slug}-${product.slug}`;
    }

    return { data: presentProduct(await this.productRepo.save(product), await this.currencyService.getVndPerUsd()) };
  }

  async delete(id: string) {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) throwAppError(EProductErrorCode.PRODUCT_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
    await this.productRepo.remove(product);
    return { message: 'Product deleted successfully' };
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private async ensureSlugUnique(slug: string, excludeId?: string) {
    const where: FindOptionsWhere<Product> = { slug };
    if (excludeId) where.id = Not(excludeId);
    const existing = await this.productRepo.findOne({ where });
    if (existing) throwAppError(EProductErrorCode.PRODUCT_SLUG_DUPLICATE);
  }

  private async ensureSkuUnique(sku: string, excludeId?: string) {
    const where: FindOptionsWhere<Product> = { sku };
    if (excludeId) where.id = Not(excludeId);
    const existing = await this.productRepo.findOne({ where });
    if (existing) throwAppError(EProductErrorCode.PRODUCT_SKU_DUPLICATE);
  }

  private async validateSubcategoryBelongsToCategory(subCategoryId: string, categoryId: string) {
    const sub = await this.subCategoryRepo.findOne({
      where: { id: subCategoryId },
      relations: ['category'],
    });
    if (!sub || sub.category.id !== categoryId) {
      throwAppError(EProductErrorCode.PRODUCT_SUBCATEGORY_MISMATCH);
    }
  }
}
