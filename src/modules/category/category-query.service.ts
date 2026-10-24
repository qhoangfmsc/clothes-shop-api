import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { ECategoryErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsOrder, FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { Category } from './category.entity';
import { AdminCategoryQueryDto } from './dtos/admin-category-query.dto';
import { PublicCategoryQueryDto } from './dtos/public-category-query.dto';

@Injectable()
export class CategoryQueryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  async findAll() {
    const categories = await this.categoryRepo.find({
      order: { priority: 'ASC' },
    });

    const data = categories.map((cat) => ({
      id: cat.id,
      slug: cat.slug,
      title: cat.title,
      description: cat.description,
      heroImage: cat.heroImage,
      priority: cat.priority,
      subcategories: (cat.subcategories || []).map((sub) => ({
        id: sub.id,
        slug: sub.slug,
        label: sub.label,
        description: sub.description,
        count: sub.count,
      })),
    }));

    return { data, total: data.length };
  }

  async findAllPublic(query: PublicCategoryQueryDto) {
    const { search, sort } = query;
    const { page, limit } = getPaging(query);

    // Không join "subcategories" (1-nhiều) ở đây: join + skip/take sẽ áp LIMIT/OFFSET
    // lên các dòng SQL đã bị nhân theo subcategory, làm sai lệch cả `total` lẫn số
    // category thực trả về mỗi trang. Paginate trước trên "categories" thuần, xong
    // load subcategories riêng cho đúng tập id đã phân trang (bên dưới).
    const qb = this.categoryRepo.createQueryBuilder('c');

    // Search
    if (search) {
      qb.andWhere('(c.title ILIKE :q OR c.slug ILIKE :q OR c.description ILIKE :q)', { q: `%${search}%` });
    }

    // Sort: `field` = ASC, `-field` = DESC (mặc định priority: 1 = ưu tiên cao nhất)
    const { field, direction } = parseSort(sort, 'priority');
    qb.orderBy(`c.${field}`, direction);

    qb.skip((page - 1) * limit).take(limit);

    const [categories, total] = await qb.getManyAndCount();

    if (categories.length > 0) {
      // eager: true trên Category.subcategories tự load kèm qua .find() (không cần khai relations)
      const withSubs = await this.categoryRepo.find({ where: { id: In(categories.map((c) => c.id)) } });
      const subsById = new Map(withSubs.map((c) => [c.id, c.subcategories]));
      for (const cat of categories) {
        cat.subcategories = subsById.get(cat.id) ?? [];
      }
    }

    // Map to same shape as findAll for consistency
    const data = categories.map((cat) => ({
      id: cat.id,
      slug: cat.slug,
      title: cat.title,
      description: cat.description,
      heroImage: cat.heroImage,
      priority: cat.priority,
      subcategories: (cat.subcategories || []).map((sub) => ({
        id: sub.id,
        slug: sub.slug,
        label: sub.label,
        description: sub.description,
        count: sub.count,
      })),
    }));

    return paginated(data, total, page, limit);
  }

  async findBySlug(slug: string) {
    const category = await this.categoryRepo.findOne({ where: { slug } });
    if (!category) {
      throwAppError(ECategoryErrorCode.CATEGORY_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
    }

    return {
      data: {
        id: category.id,
        slug: category.slug,
        title: category.title,
        description: category.description,
        heroImage: category.heroImage,
        priority: category.priority,
        subcategories: (category.subcategories || []).map((sub) => ({
          id: sub.id,
          slug: sub.slug,
          label: sub.label,
          description: sub.description,
          count: sub.count,
        })),
      },
    };
  }

  async findAllAdmin(query: AdminCategoryQueryDto) {
    const { search, sort } = query;
    const { page, limit } = getPaging(query);

    // Build where: search creates OR conditions
    let where: FindOptionsWhere<Category> | FindOptionsWhere<Category>[] | undefined;
    if (search) {
      const like = ILike(`%${search}%`);
      where = [{ slug: like }, { title: like }, { description: like }];
    }

    // Sort: `field` = ASC, `-field` = DESC
    const { field, direction } = parseSort(sort, 'priority');
    const order: FindOptionsOrder<Category> = { [field]: direction };

    const [data, total] = await this.categoryRepo.findAndCount({
      where,
      order,
      skip: (page - 1) * limit,
      take: limit,
    });

    return paginated(data, total, page, limit);
  }
}
