import { throwAppError } from '@common/exceptions/app.exception';
import { ECategoryErrorCode } from '@common/exceptions/error-codes';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsOrder, FindOptionsWhere, ILike, Repository } from 'typeorm';
import { Category } from './category.entity';
import { AdminCategoryQueryDto } from './dtos/admin-category-query.dto';
import { CreateCategoryDto, UpdateCategoryDto } from './dtos/category.dto';
import { PublicCategoryQueryDto } from './dtos/public-category-query.dto';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  async findAll() {
    const categories = await this.categoryRepo.find({
      order: { createdAt: 'ASC' },
    });

    const data = categories.map((cat) => ({
      id: cat.id,
      slug: cat.slug,
      title: cat.title,
      description: cat.description,
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
    const page = query.page ?? 1;
    const limit = query.limit ?? 24;

    const qb = this.categoryRepo.createQueryBuilder('c');

    // Search
    if (search) {
      qb.andWhere('(c.title ILIKE :q OR c.slug ILIKE :q OR c.description ILIKE :q)', { q: `%${search}%` });
    }

    // Sort
    switch (sort) {
      case 'title_asc':
        qb.orderBy('c.title', 'ASC');
        break;
      case 'title_desc':
        qb.orderBy('c.title', 'DESC');
        break;
      default:
        qb.orderBy('c.createdAt', 'DESC');
        break;
    }

    qb.skip((page - 1) * limit).take(limit);

    const [categories, total] = await qb.getManyAndCount();

    // Map to same shape as findAll for consistency
    const data = categories.map((cat) => ({
      id: cat.id,
      slug: cat.slug,
      title: cat.title,
      description: cat.description,
      subcategories: (cat.subcategories || []).map((sub) => ({
        id: sub.id,
        slug: sub.slug,
        label: sub.label,
        description: sub.description,
        count: sub.count,
      })),
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findBySlug(slug: string) {
    const category = await this.categoryRepo.findOne({ where: { slug } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return {
      data: {
        id: category.id,
        slug: category.slug,
        title: category.title,
        description: category.description,
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

  // ============================================
  // ADMIN METHODS
  // ============================================

  async findAllAdmin(query: AdminCategoryQueryDto) {
    const { search, sort, page = 1, limit = 25 } = query;

    // Build where: search creates OR conditions
    let where: FindOptionsWhere<Category> | FindOptionsWhere<Category>[] | undefined;
    if (search) {
      const like = ILike(`%${search}%`);
      where = [{ slug: like }, { title: like }, { description: like }];
    }

    // Sort: "field" = DESC, "-field" = ASC
    let order: FindOptionsOrder<Category> = { createdAt: 'DESC' };
    if (sort) {
      const isAsc = sort.startsWith('-');
      const field = isAsc ? sort.slice(1) : sort;
      order = { [field]: isAsc ? 'ASC' : 'DESC' };
    }

    const [data, total] = await this.categoryRepo.findAndCount({
      where,
      order,
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async create(dto: CreateCategoryDto) {
    await this.ensureSlugUnique(dto.slug);
    if (dto.subcategories && dto.subcategories.length > 0) {
      this.validateSubCategorySlugs(dto.subcategories);
    }
    const category = this.categoryRepo.create(dto);
    try {
      return { data: await this.categoryRepo.save(category) };
    } catch (err: any) {
      // Catch UQ_subcategories_category_slug collision (DB unique constraint)
      if (err.code === '23505') {
        throwAppError(ECategoryErrorCode.CATEGORY_SUBSLUG_DUPLICATE);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Check slug uniqueness nếu slug được thay đổi
    if (dto.slug && dto.slug !== category.slug) {
      await this.ensureSlugUnique(dto.slug);
    }

    // Validate subcategory slugs mới không trùng nhau
    if (dto.subcategories && dto.subcategories.length > 0) {
      this.validateSubCategorySlugs(dto.subcategories);
    }
    // Nếu có subcategories mới → xoá sub cũ và tạo lại
    if (dto.subcategories !== undefined) {
      // Phải xoá explicit vì TypeORM khi clear array + save sẽ SET category_id = NULL
      // (vi phạm NOT NULL) thay vì DELETE row. onDelete: CASCADE chỉ áp dụng khi DELETE.
      if (category.subcategories && category.subcategories.length > 0) {
        await this.categoryRepo.manager.remove(category.subcategories);
      }
      category.subcategories = [];
    }

    Object.assign(category, dto);
    try {
      return { data: await this.categoryRepo.save(category) };
    } catch (err: any) {
      if (err.code === '23505') {
        throwAppError(ECategoryErrorCode.CATEGORY_SUBSLUG_DUPLICATE);
      }
      throw err;
    }
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private async ensureSlugUnique(slug: string) {
    const existing = await this.categoryRepo.findOne({ where: { slug } });
    if (existing) {
      throwAppError(ECategoryErrorCode.CATEGORY_SLUG_DUPLICATE);
    }
  }

  /**
   * Validate subcategory slugs không trùng lặp trong cùng 1 request
   */
  private validateSubCategorySlugs(subcategories: { slug: string }[]) {
    const slugs = subcategories.map((s) => s.slug);
    const uniqueSlugs = new Set(slugs);
    if (slugs.length !== uniqueSlugs.size) {
      throwAppError(ECategoryErrorCode.CATEGORY_SUBSLUG_DUPLICATE);
    }
  }

  async delete(id: string) {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    try {
      await this.categoryRepo.remove(category);
      return { message: 'Category deleted successfully' };
    } catch (err: any) {
      // Catch FK RESTRICT error từ DB (còn products tham chiếu)
      if (err.code === '23503') {
        throwAppError(ECategoryErrorCode.CATEGORY_HAS_PRODUCTS);
      }
      throw err;
    }
  }
}
