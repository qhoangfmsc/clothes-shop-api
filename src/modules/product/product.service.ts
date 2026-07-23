import { throwAppError } from '@common/exceptions/app.exception';
import { EProductErrorCode } from '@common/exceptions/error-codes';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsOrder, FindOptionsWhere, ILike, Not, Repository } from 'typeorm';
import { Category } from '../category/category.entity';
import { SubCategory } from '../category/sub-category.entity';
import { AdminProductQueryDto } from './dtos/admin-product-query.dto';
import { CreateProductDto, UpdateProductDto } from './dtos/product.dto';
import { PublicProductQueryDto } from './dtos/public-product-query.dto';
import { Product } from './product.entity';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(SubCategory)
    private readonly subCategoryRepo: Repository<SubCategory>,
  ) {}

  /**
   * @deprecated Use findAllPublic instead — kept for backward compatibility.
   */
  async findAll(query: { category?: string; subcategory?: string; badge?: string; sort?: string; limit?: number }) {
    const where: FindOptionsWhere<Product> = { status: 'active' };

    if (query.category) {
      const cat = await this.categoryRepo.findOne({ where: { slug: query.category } });
      if (cat) {
        where.category = { id: cat.id };
      } else {
        return { data: [], total: 0 };
      }
    }
    if (query.subcategory) {
      const subWhere: any = { slug: query.subcategory };
      if (where.category) {
        subWhere.category = { id: (where.category as any).id };
      }
      const sub = await this.subCategoryRepo.findOne({ where: subWhere });
      if (sub) {
        where.subcategory = { id: sub.id };
      } else {
        return { data: [], total: 0 };
      }
    }
    if (query.badge) {
      where.badge = query.badge;
    }

    let order: FindOptionsOrder<Product> = { createdAt: 'DESC' };
    if (query.sort) {
      switch (query.sort) {
        case 'price_asc':
          order = { price: 'ASC' };
          break;
        case 'price_desc':
          order = { price: 'DESC' };
          break;
        case 'newest':
          order = { createdAt: 'DESC' };
          break;
      }
    }

    const [data, total] = await this.productRepo.findAndCount({
      where,
      relations: ['category', 'subcategory'],
      order,
      take: query.limit && query.limit > 0 ? query.limit : undefined,
    });

    return { data, total };
  }

  // ============================================
  // PUBLIC METHODS (Phase 1)
  // ============================================

  async findAllPublic(query: PublicProductQueryDto) {
    const { search, category, subcategory, badge, sort, minPrice, maxPrice, sizes, colors } = query;
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

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

    // Filter by price range (decimal column — numeric comparison works)
    if (minPrice != null) {
      qb.andWhere('p.price >= :minPrice', { minPrice: Number(minPrice) });
    }
    if (maxPrice != null) {
      qb.andWhere('p.price <= :maxPrice', { maxPrice: Number(maxPrice) });
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

    // Sort — whitelist with public-friendly convention
    switch (sort) {
      case 'price_asc':
        qb.orderBy('p.price', 'ASC');
        break;
      case 'price_desc':
        qb.orderBy('p.price', 'DESC');
        break;
      case 'name_asc':
        qb.orderBy('p.name', 'ASC');
        break;
      case 'name_desc':
        qb.orderBy('p.name', 'DESC');
        break;
      default:
        qb.orderBy('p.createdAt', 'DESC');
        break;
    }

    // Pagination
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async autocomplete(q: string) {
    const results = await this.productRepo
      .createQueryBuilder('p')
      .select(['p.id', 'p.name', 'p.slug', 'p.price', 'p.images', 'p.status'])
      .where('p.status = :status', { status: 'active' })
      .andWhere('(p.name ILIKE :q OR p.slug ILIKE :q)', { q: `${q}%` })
      .orderBy('p.name', 'ASC')
      .take(8)
      .getMany();

    return {
      data: results.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: Number(p.price),
        image: p.images?.[0] ?? null,
      })),
    };
  }

  async findById(id: string) {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['category', 'subcategory'],
    });
    if (!product) {
      throw new NotFoundException('Product not found');
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
      take: 4,
    });

    return { data: product, related };
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  async findAllAdmin(query: AdminProductQueryDto) {
    const { search, status, category, badge, sort, page = 1, limit = 25 } = query;

    // Build base conditions (non-search filters)
    const baseConditions: FindOptionsWhere<Product> = {};
    if (status) baseConditions.status = status;
    if (badge) baseConditions.badge = badge;

    // Resolve category slug → ID
    if (category) {
      const cat = await this.categoryRepo.findOne({ where: { slug: category } });
      if (cat) {
        baseConditions.category = { id: cat.id };
      } else {
        return { data: [], total: 0, page, limit };
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

    // Sort: "field" = DESC, "-field" = ASC
    let order: FindOptionsOrder<Product> = { createdAt: 'DESC' };
    if (sort) {
      const isAsc = sort.startsWith('-');
      const field = isAsc ? sort.slice(1) : sort;
      order = { [field]: isAsc ? 'ASC' : 'DESC' };
    }

    const [data, total] = await this.productRepo.findAndCount({
      where,
      relations: ['category', 'subcategory'],
      order,
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async create(dto: CreateProductDto) {
    await this.ensureSlugUnique(dto.slug);
    if (dto.sku) {
      await this.ensureSkuUnique(dto.sku);
    }

    // Validate price logic
    if (dto.originalPrice != null && dto.originalPrice < dto.price) {
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

    const product = this.productRepo.create({ ...dto, sku, category, subcategory });
    return { data: await this.productRepo.save(product) };
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['category', 'subcategory'],
    });
    if (!product) throw new NotFoundException('Product not found');

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
    const finalPrice = dto.price != null ? dto.price : product.price;
    const finalOriginalPrice = dto.originalPrice !== undefined ? dto.originalPrice : product.originalPrice;
    if (finalOriginalPrice != null && finalOriginalPrice < finalPrice) {
      throwAppError(EProductErrorCode.PRODUCT_INVALID_PRICE);
    }

    // Merge remaining fields (exclude FK fields handled above)
    const { categoryId, subcategoryId, ...rest } = dto;
    Object.assign(product, rest);

    // Regenerate SKU if dependencies changed
    if (categoryId || subcategoryId || dto.slug) {
      product.sku = dto.sku || `${product.category.slug}-${product.subcategory.slug}-${product.slug}`;
    }

    return { data: await this.productRepo.save(product) };
  }

  async delete(id: string) {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
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
