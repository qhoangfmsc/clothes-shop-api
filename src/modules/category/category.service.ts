import { throwAppError } from '@common/exceptions/app.exception';
import { ECategoryErrorCode } from '@common/exceptions/error-codes';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsOrder, FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { Category } from './category.entity';
import { AdminCategoryQueryDto } from './dtos/admin-category-query.dto';
import { CreateCategoryDto, CreateSubCategoryDto, UpdateCategoryDto } from './dtos/category.dto';
import { PublicCategoryQueryDto } from './dtos/public-category-query.dto';
import { SubCategory } from './sub-category.entity';

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
      heroImage: cat.heroImage,
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

    // Không join "subcategories" (1-nhiều) ở đây: join + skip/take sẽ áp LIMIT/OFFSET
    // lên các dòng SQL đã bị nhân theo subcategory, làm sai lệch cả `total` lẫn số
    // category thực trả về mỗi trang. Paginate trước trên "categories" thuần, xong
    // load subcategories riêng cho đúng tập id đã phân trang (bên dưới).
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
        heroImage: category.heroImage,
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
    // Đồng bộ theo slug thay vì xoá hết tạo lại (xem reconcileSubCategories)
    if (dto.subcategories !== undefined) {
      await this.reconcileSubCategories(category, dto.subcategories);
    }

    const { subcategories, ...rest } = dto;
    Object.assign(category, rest);
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

  /**
   * Đồng bộ subcategories theo slug thay vì xoá hết rồi tạo lại: subcategory khớp slug
   * được update tại chỗ (giữ nguyên id), chỉ subcategory bị bỏ khỏi payload mới bị xoá.
   * Xoá hết-tạo-lại sẽ đổi id → vỡ FK_products_subcategory (RESTRICT) ngay khi subcategory
   * đó đang có sản phẩm tham chiếu, kể cả khi payload gửi lên y hệt dữ liệu cũ.
   */
  private async reconcileSubCategories(category: Category, incoming: CreateSubCategoryDto[]) {
    const existingBySlug = new Map((category.subcategories || []).map((sub) => [sub.slug, sub]));
    const incomingSlugs = new Set(incoming.map((item) => item.slug));

    category.subcategories = incoming.map((item) => {
      const existing = existingBySlug.get(item.slug);
      if (existing) {
        existing.label = item.label;
        existing.description = item.description ?? '';
        existing.count = item.count ?? 0;
        return existing;
      }
      return { slug: item.slug, label: item.label, description: item.description ?? '', count: item.count ?? 0 } as SubCategory;
    });

    const removed = [...existingBySlug.values()].filter((sub) => !incomingSlugs.has(sub.slug));
    if (removed.length > 0) {
      try {
        await this.categoryRepo.manager.remove(removed);
      } catch (err: any) {
        if (err.code === '23503') {
          throwAppError(
            ECategoryErrorCode.CATEGORY_SUBCATEGORY_HAS_PRODUCTS,
            `Không thể xoá subcategory đang có sản phẩm tham chiếu: ${removed.map((s) => s.slug).join(', ')}`,
          );
        }
        throw err;
      }
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
