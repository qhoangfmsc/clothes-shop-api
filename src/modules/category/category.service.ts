import { throwOnConstraint } from '@common/base/db-error.util';
import { pickProvided } from '@common/base/provided-fields.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { ECategoryErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Category } from './category.entity';
import { CreateCategoryDto, CreateSubCategoryDto, ReorderCategoriesDto, UpdateCategoryDto } from './dtos/category.dto';
import { SubCategory } from './sub-category.entity';

const CATEGORY_UNIQUE_ERRORS = {
  UQ_categories_slug: ECategoryErrorCode.CATEGORY_SLUG_DUPLICATE,
  UQ_subcategories_category_slug: ECategoryErrorCode.CATEGORY_SUBSLUG_DUPLICATE,
};

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

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
        const category = manager.create(Category, { subcategories: [], ...pickProvided(dto, ['heroImage']), priority });
        return { data: await manager.save(category) };
      });
    } catch (err: any) {
      throwOnConstraint(err, CATEGORY_UNIQUE_ERRORS);
      throw err;
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const exists = await this.categoryRepo.exists({ where: { id } });
    if (!exists) {
      throwAppError(ECategoryErrorCode.CATEGORY_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
    }

    const { subcategories, priority, ...rest } = pickProvided(dto, ['heroImage']);

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
          throwAppError(ECategoryErrorCode.CATEGORY_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
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
      throwOnConstraint(err, CATEGORY_UNIQUE_ERRORS);
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
          throwAppError(ECategoryErrorCode.CATEGORY_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
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
