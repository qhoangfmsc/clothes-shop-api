import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsOrder, FindOptionsWhere, ILike, MoreThanOrEqual, Repository } from 'typeorm';
import { Category } from '../../category/category.entity';
import { CurrencyService } from '../../currency/currency.service';
import { AdminProductQueryDto } from '../admin/dtos/admin-product-query.dto';
import { Product } from '../shared/product.entity';
import { PRODUCT_RELATIONS, presentProduct } from '../shared/product.presenter';

@Injectable()
export class ProductAdminQueryService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    private readonly currencyService: CurrencyService,
  ) {}

  async findAllAdmin(query: AdminProductQueryDto) {
    const { search, status, category, badge, sort, minRating } = query;
    const { page, limit } = getPaging(query);

    const baseConditions: FindOptionsWhere<Product> = {};
    if (status) baseConditions.status = status;
    if (badge) baseConditions.badge = badge;
    if (minRating != null) baseConditions.ratingAverage = MoreThanOrEqual(Number(minRating));

    if (category) {
      const cat = await this.categoryRepo.findOne({ where: { slug: category } });
      if (cat) {
        baseConditions.category = { id: cat.id };
      } else {
        return paginated([], 0, page, limit);
      }
    }

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

    const { field, direction } = parseSort(sort, '-createdAt');
    const order: FindOptionsOrder<Product> = { [field]: { direction, nulls: 'LAST' }, id: 'ASC' };

    const [data, total] = await this.productRepo.findAndCount({
      where,
      relations: PRODUCT_RELATIONS,
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
}
