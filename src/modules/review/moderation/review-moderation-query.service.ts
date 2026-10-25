import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Review } from '../shared/review.entity';
import { findReviewWithProduct } from '../shared/review-lookup.util';
import { HAS_IMAGES_SQL, NO_IMAGES_SQL } from '../shared/review-sql.constant';
import { toAdminView } from '../shared/review-view.util';
import { AdminReviewQueryDto } from './dtos/admin-review-query.dto';

@Injectable()
export class ReviewModerationQueryService {
  constructor(
    @InjectDataSource() readonly _dataSource: DataSource,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
  ) {}

  async findAllAdmin(query: AdminReviewQueryDto) {
    const { search, status, rating, fit, hasImages, product, userId, replied, sort } = query;
    const { page, limit } = getPaging(query);

    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.product', 'p')
      .leftJoinAndSelect('p.category', 'cat')
      .leftJoinAndSelect('p.subcategory', 'sub');
    if (status) qb.andWhere('r.status = :status', { status });
    if (rating !== undefined) qb.andWhere('r.rating = :rating', { rating });
    if (fit) qb.andWhere('r.fit = :fit', { fit });
    if (hasImages !== undefined) qb.andWhere(hasImages ? HAS_IMAGES_SQL : NO_IMAGES_SQL);
    if (product) qb.andWhere('p.slug = :product', { product });
    if (userId) qb.andWhere('r.userId = :userId', { userId });
    if (replied !== undefined) qb.andWhere(replied ? 'r.reply IS NOT NULL' : 'r.reply IS NULL');
    if (search) {
      qb.andWhere('(r.title ILIKE :search OR r.content ILIKE :search OR r.author ILIKE :search OR p.name ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    const { field, direction } = parseSort(sort, '-createdAt');
    qb.orderBy(`r.${field}`, direction).addOrderBy('r.id', 'ASC');
    qb.skip((page - 1) * limit).take(limit);

    const [reviews, total] = await qb.getManyAndCount();
    return paginated(reviews.map(toAdminView), total, page, limit);
  }

  /** Số đánh giá đang hiển thị mà cửa hàng chưa phản hồi — bằng `total` của `findAllAdmin({ status: 'PUBLISHED', replied: false })` */
  async countAwaitingReply(): Promise<number> {
    return this.reviewRepo
      .createQueryBuilder('r')
      .where('r.status = :status', { status: 'PUBLISHED' })
      .andWhere('r.reply IS NULL')
      .getCount();
  }

  async findOneAdmin(reviewId: string) {
    return { data: toAdminView(await findReviewWithProduct(this.reviewRepo, reviewId)) };
  }
}
