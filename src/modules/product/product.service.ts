import { throwAppError } from '@common/exceptions/app.exception';
import { EProductErrorCode } from '@common/exceptions/error-codes';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsOrder, FindOptionsWhere, Not, Repository } from 'typeorm';
import { Category } from '../category/category.entity';
import { SubCategory } from '../category/sub-category.entity';
import { CreateProductDto, UpdateProductDto } from './dtos/product.dto';
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

  async findAll(query: { category?: string; subcategory?: string; badge?: string; sort?: string; limit?: number }) {
    const where: FindOptionsWhere<Product> = { status: 'active' };

    // Resolve slug → ID để filter bằng FK (tránh TypeORM nested relation filter bug)
    if (query.category) {
      const cat = await this.categoryRepo.findOne({ where: { slug: query.category } });
      if (cat) {
        where.category = { id: cat.id };
      } else {
        return { data: [], total: 0 };
      }
    }
    if (query.subcategory) {
      // Lookup composite (category + subcategory slug) nếu có cả category context
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

    // Sort
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
