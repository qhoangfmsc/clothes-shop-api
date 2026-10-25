import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EProductErrorCode } from '@common/exceptions/error-codes';
import { money } from '@common/utils/money.util';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { CurrencyService } from '../../currency/currency.service';
import { Product } from '../shared/product.entity';
import { PRODUCT_RELATIONS, presentProduct, presentProductSummary } from '../shared/product.presenter';
import { AUTOCOMPLETE_DEFAULT_LIMIT, ProductAutocompleteQueryDto } from './dtos/product-autocomplete-query.dto';
import { ProductDetailQueryDto, RELATED_DEFAULT_LIMIT } from './dtos/product-detail-query.dto';
import { PublicProductQueryDto } from './dtos/public-product-query.dto';

@Injectable()
export class ProductCatalogQueryService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly currencyService: CurrencyService,
  ) {}

  async findAllPublic(query: PublicProductQueryDto) {
    const { search, category, subcategory, badge, sort, minPrice, maxPrice, minRating, sizes, colors } = query;
    const { page, limit } = getPaging(query);

    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.category', 'cat')
      .leftJoinAndSelect('p.subcategory', 'sub')
      .where('p.status = :status', { status: 'active' });

    if (search) {
      qb.andWhere('(p.name ILIKE :q OR p.slug ILIKE :q OR p.description ILIKE :q)', { q: `%${search}%` });
    }

    if (category) {
      qb.andWhere('cat.slug = :catSlug', { catSlug: category });
    }

    if (subcategory) {
      qb.andWhere('sub.slug = :subSlug', { subSlug: subcategory });
    }

    if (badge) {
      qb.andWhere('p.badge = :badge', { badge });
    }

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

    // Sản phẩm chưa có đánh giá (rating_average NULL) luôn xếp cuối, kể cả khi sort tăng dần; `id` làm thứ tự phụ để phân trang ổn định
    const { field, direction } = parseSort(sort, '-createdAt');
    qb.orderBy(`p.${field}`, direction, 'NULLS LAST').addOrderBy('p.id', 'ASC');

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
      .leftJoin('p.category', 'cat')
      .leftJoin('p.subcategory', 'sub')
      .select(['p.id', 'p.name', 'p.slug', 'p.price', 'p.images', 'p.badge', 'p.status'])
      .addSelect(['cat.id', 'cat.slug', 'cat.title', 'sub.id', 'sub.slug', 'sub.label'])
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
      data: results.map((p) => ({ ...presentProductSummary(p), ...money('price', p.price, rate) })),
    };
  }

  async findById(id: string, query: ProductDetailQueryDto = {}) {
    const relatedLimit = query.relatedLimit ?? RELATED_DEFAULT_LIMIT;
    const product = await this.productRepo.findOne({
      where: { id },
      relations: PRODUCT_RELATIONS,
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
      relations: PRODUCT_RELATIONS,
      order: { createdAt: 'DESC' },
      take: relatedLimit,
    });

    const rate = await this.currencyService.getVndPerUsd();
    return { data: presentProduct(product, rate), related: related.map((item) => presentProduct(item, rate)) };
  }
}
