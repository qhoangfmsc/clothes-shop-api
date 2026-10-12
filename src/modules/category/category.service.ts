import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { ECategoryErrorCode } from '@common/exceptions/error-codes';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsOrder, FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { Category } from './category.entity';
import { AdminCategoryQueryDto } from './dtos/admin-category-query.dto';
import { CreateCategoryDto, CreateSubCategoryDto, ReorderCategoriesDto, UpdateCategoryDto } from './dtos/category.dto';
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
      throw new NotFoundException('Category not found');
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

  // ============================================
  // ADMIN METHODS
  // ============================================

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

  async create(dto: CreateCategoryDto) {
    await this.ensureSlugUnique(dto.slug);
    if (dto.subcategories && dto.subcategories.length > 0) {
      this.validateSubCategorySlugs(dto.subcategories);
    }
    try {
      return await this.categoryRepo.manager.transaction(async (manager) => {
        // Danh mục mới luôn xếp cuối (priority thấp nhất); muốn đổi vị trí thì update priority / reorder
        await this.lockPriorities(manager);
        const priority = (await this.maxPriority(manager)) + 1;
        const category = manager.create(Category, { ...dto, priority });
        return { data: await manager.save(category) };
      });
    } catch (err: any) {
      // Catch UQ_subcategories_category_slug collision (DB unique constraint)
      if (err.code === '23505') {
        throwAppError(ECategoryErrorCode.CATEGORY_SUBSLUG_DUPLICATE);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const exists = await this.categoryRepo.exists({ where: { id } });
    if (!exists) {
      throw new NotFoundException('Category not found');
    }

    const { subcategories, priority, ...rest } = dto;

    // Check slug uniqueness nếu slug được thay đổi
    if (dto.slug) {
      const current = await this.categoryRepo.findOne({ where: { id }, select: { id: true, slug: true }, loadEagerRelations: false });
      if (current && dto.slug !== current.slug) {
        await this.ensureSlugUnique(dto.slug);
      }
    }

    // Validate subcategory slugs mới không trùng nhau
    if (subcategories && subcategories.length > 0) {
      this.validateSubCategorySlugs(subcategories);
    }

    try {
      return await this.categoryRepo.manager.transaction(async (manager) => {
        if (priority !== undefined) {
          await this.lockPriorities(manager);
        }
        const category = await manager.findOne(Category, { where: { id } });
        if (!category) {
          throw new NotFoundException('Category not found');
        }

        // Đồng bộ theo slug thay vì xoá hết tạo lại (xem reconcileSubCategories)
        if (subcategories !== undefined) {
          await this.reconcileSubCategories(manager, category, subcategories);
        }
        if (priority !== undefined) {
          await this.moveToPriority(manager, category, priority);
        }

        Object.assign(category, rest);
        return { data: await manager.save(category) };
      });
    } catch (err: any) {
      if (err.code === '23505') {
        throwAppError(ECategoryErrorCode.CATEGORY_SUBSLUG_DUPLICATE);
      }
      throw err;
    }
  }

  /**
   * Sắp xếp lại toàn bộ danh mục: `ids` là thứ tự mới, phần tử đầu = priority 1.
   * Bắt buộc gửi đủ mọi category đúng 1 lần để priority luôn là dãy liên tục 1..N, không trùng.
   */
  async reorder(dto: ReorderCategoriesDto) {
    const { ids } = dto;
    if (new Set(ids).size !== ids.length) {
      throwAppError(ECategoryErrorCode.CATEGORY_REORDER_DUPLICATE_ID);
    }

    await this.categoryRepo.manager.transaction(async (manager) => {
      await this.lockPriorities(manager);
      const all = await manager.find(Category, { select: { id: true }, loadEagerRelations: false });
      const allIds = new Set(all.map((c) => c.id));

      const unknown = ids.filter((id) => !allIds.has(id));
      if (unknown.length > 0) {
        throwAppError(ECategoryErrorCode.CATEGORY_NOT_FOUND, `Không tìm thấy category: ${unknown.join(', ')}`);
      }
      if (ids.length !== allIds.size) {
        throwAppError(ECategoryErrorCode.CATEGORY_REORDER_INCOMPLETE, `Cần gửi đủ ${allIds.size} category, nhận được ${ids.length}`);
      }

      // UQ_categories_priority là DEFERRABLE nên gán lần lượt không bị đụng nhau giữa chừng
      for (const [index, id] of ids.entries()) {
        await manager.update(Category, { id }, { priority: index + 1 });
      }
    });

    return { data: ids.map((id, index) => ({ id, priority: index + 1 })) };
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
   * Khoá theo transaction để các thao tác đổi priority (create/update/delete/reorder) chạy tuần tự,
   * tránh 2 request cùng lấy max+1 hoặc cùng dịch chỗ rồi đụng UQ_categories_priority.
   */
  private async lockPriorities(manager: EntityManager) {
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext('categories_priority'))`);
  }

  private async maxPriority(manager: EntityManager): Promise<number> {
    const row = await manager.createQueryBuilder(Category, 'c').select('COALESCE(MAX(c.priority), 0)', 'max').getRawOne<{ max: string }>();
    return Number(row?.max ?? 0);
  }

  /**
   * Chuyển category tới thứ hạng mới, các category nằm giữa dịch 1 bậc để giữ dãy 1..N không trùng.
   * Chỉ gán `category.priority`, phần save do caller thực hiện trong cùng transaction.
   */
  private async moveToPriority(manager: EntityManager, category: Category, target: number) {
    const max = await this.maxPriority(manager);
    if (target < 1 || target > max) {
      throwAppError(ECategoryErrorCode.CATEGORY_PRIORITY_OUT_OF_RANGE, `Priority phải nằm trong khoảng 1..${max}`);
    }
    const current = category.priority;
    if (target === current) return;

    const qb = manager.createQueryBuilder().update(Category);
    if (target < current) {
      await qb
        .set({ priority: () => '"priority" + 1' })
        .where('"priority" >= :target AND "priority" < :current', { target, current })
        .execute();
    } else {
      await qb
        .set({ priority: () => '"priority" - 1' })
        .where('"priority" > :current AND "priority" <= :target', { target, current })
        .execute();
    }
    category.priority = target;
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
  private async reconcileSubCategories(manager: EntityManager, category: Category, incoming: CreateSubCategoryDto[]) {
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
        await manager.remove(removed);
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
    try {
      await this.categoryRepo.manager.transaction(async (manager) => {
        await this.lockPriorities(manager);
        const category = await manager.findOne(Category, { where: { id } });
        if (!category) {
          throw new NotFoundException('Category not found');
        }
        const removedPriority = category.priority;
        await manager.remove(category);
        // Dồn các category phía sau lên 1 bậc để không để trống số thứ hạng
        await manager
          .createQueryBuilder()
          .update(Category)
          .set({ priority: () => '"priority" - 1' })
          .where('"priority" > :removedPriority', { removedPriority })
          .execute();
      });
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
