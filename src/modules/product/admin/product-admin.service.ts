import { saveOrThrowOnConstraint } from '@common/base/db-error.util';
import { pickProvided } from '@common/base/provided-fields.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EProductErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Not, Repository } from 'typeorm';
import { Category } from '../../category/category.entity';
import { SubCategory } from '../../category/sub-category.entity';
import { CurrencyService } from '../../currency/currency.service';
import { Product } from '../shared/product.entity';
import { PRODUCT_RELATIONS, presentProduct } from '../shared/product.presenter';
import { CreateProductDto, UpdateProductDto } from './dtos/product.dto';

const PRODUCT_UNIQUE_ERRORS = {
  UQ_products_slug: EProductErrorCode.PRODUCT_SLUG_DUPLICATE,
  UQ_products_sku: EProductErrorCode.PRODUCT_SKU_DUPLICATE,
};

@Injectable()
export class ProductAdminService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(SubCategory)
    private readonly subCategoryRepo: Repository<SubCategory>,
    private readonly currencyService: CurrencyService,
  ) {}

  async create(dto: CreateProductDto) {
    await this.ensureSlugUnique(dto.slug);
    if (dto.sku) {
      await this.ensureSkuUnique(dto.sku);
    }

    if (dto.originalPriceVnd != null && dto.originalPriceVnd < dto.priceVnd) {
      throwAppError(EProductErrorCode.PRODUCT_INVALID_PRICE);
    }

    const category = await this.categoryRepo.findOne({ where: { id: dto.categoryId } });
    if (!category) throwAppError(EProductErrorCode.PRODUCT_CATEGORY_NOT_FOUND);

    const subcategory = await this.subCategoryRepo.findOne({ where: { id: dto.subcategoryId } });
    if (!subcategory) throwAppError(EProductErrorCode.PRODUCT_CATEGORY_NOT_FOUND);

    await this.validateSubcategoryBelongsToCategory(subcategory.id, category.id);

    const sku = dto.sku || `${category.slug}-${subcategory.slug}-${dto.slug}`;

    const { priceVnd, originalPriceVnd, ...rest } = pickProvided(dto, ['badge', 'originalPriceVnd']);
    const product = this.productRepo.create({ ...rest, price: priceVnd, originalPrice: originalPriceVnd, sku, category, subcategory });
    return {
      data: presentProduct(
        await saveOrThrowOnConstraint(this.productRepo, product, PRODUCT_UNIQUE_ERRORS),
        await this.currencyService.getVndPerUsd(),
      ),
    };
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: PRODUCT_RELATIONS,
    });
    if (!product) throwAppError(EProductErrorCode.PRODUCT_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

    if (dto.slug && dto.slug !== product.slug) await this.ensureSlugUnique(dto.slug);
    if (dto.sku && dto.sku !== product.sku) await this.ensureSkuUnique(dto.sku);

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

    if (product.category?.id && product.subcategory?.id) {
      await this.validateSubcategoryBelongsToCategory(product.subcategory.id, product.category.id);
    }

    const finalPrice = dto.priceVnd != null ? dto.priceVnd : product.price;
    const finalOriginalPrice = dto.originalPriceVnd !== undefined ? dto.originalPriceVnd : product.originalPrice;
    if (finalOriginalPrice != null && finalOriginalPrice < finalPrice) {
      throwAppError(EProductErrorCode.PRODUCT_INVALID_PRICE);
    }

    const { categoryId, subcategoryId, priceVnd, originalPriceVnd, ...rest } = pickProvided(dto, ['badge', 'originalPriceVnd']);
    Object.assign(product, rest);
    if (priceVnd !== undefined) product.price = priceVnd;
    if (originalPriceVnd !== undefined) product.originalPrice = originalPriceVnd;

    if (categoryId || subcategoryId || dto.slug) {
      product.sku = dto.sku || `${product.category.slug}-${product.subcategory.slug}-${product.slug}`;
    }

    return {
      data: presentProduct(
        await saveOrThrowOnConstraint(this.productRepo, product, PRODUCT_UNIQUE_ERRORS),
        await this.currencyService.getVndPerUsd(),
      ),
    };
  }

  async delete(id: string) {
    const product = await this.productRepo.findOne({ where: { id } });
    if (!product) throwAppError(EProductErrorCode.PRODUCT_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
    await this.productRepo.remove(product);
    return { message: 'Product deleted successfully' };
  }

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
