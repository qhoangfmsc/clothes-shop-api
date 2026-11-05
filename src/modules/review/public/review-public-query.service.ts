import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { REVIEW_FITS, ReviewFit } from '../shared/review.constant';
import { Review } from '../shared/review.entity';
import { HAS_IMAGES_SQL, NO_IMAGES_SQL } from '../shared/review-sql.constant';
import { toPublicView } from '../shared/review-view.util';
import { PublicReviewQueryDto } from './dtos/public-review-query.dto';

/** Trung bình làm tròn 1 chữ số thập phân, half-up, tính bằng số nguyên (khớp `ROUND(AVG(rating), 1)` của Postgres lưu ở `products.rating_average`) */
const roundAverage = (sum: number, count: number) => Math.floor((sum * 20 + count) / (2 * count)) / 10;

@Injectable()
export class ReviewPublicQueryService {
  constructor(
    @InjectDataSource() readonly _dataSource: DataSource,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
  ) {}

  async findByProductId(productId: string, query: PublicReviewQueryDto = {}) {
    const { rating, fit, hasImages, sort } = query;
    const { page, limit } = getPaging(query);

    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .where('r.productId = :productId', { productId })
      .andWhere('r.status = :status', { status: 'PUBLISHED' });
    if (rating !== undefined) qb.andWhere('r.rating = :rating', { rating });
    if (fit) qb.andWhere('r.fit = :fit', { fit });
    if (hasImages !== undefined) qb.andWhere(hasImages ? HAS_IMAGES_SQL : NO_IMAGES_SQL);

    // Sort: `field` = ASC, `-field` = DESC
    const { field, direction } = parseSort(sort, '-createdAt');
    qb.orderBy(`r.${field}`, direction).addOrderBy('r.id', 'ASC');

    qb.skip((page - 1) * limit).take(limit);

    const [reviews, total] = await qb.getManyAndCount();
    return paginated(reviews.map(toPublicView), total, page, limit);
  }

  /** Tổng hợp cho trang sản phẩm: điểm trung bình, phân bố 1–5 sao và phân bố fit (chỉ đánh giá `PUBLISHED`) */
  async getSummary(productId: string) {
    const base = () =>
      this.reviewRepo
        .createQueryBuilder('r')
        .where('r.productId = :productId', { productId })
        .andWhere('r.status = :status', { status: 'PUBLISHED' });

    const ratingRows = await base()
      .select('r.rating', 'rating')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.rating')
      .getRawMany<{ rating: number | string; count: string }>();
    const fitRows = await base()
      .select('r.fit', 'fit')
      .addSelect('COUNT(*)', 'count')
      .andWhere('r.fit IS NOT NULL')
      .groupBy('r.fit')
      .getRawMany<{ fit: ReviewFit; count: string }>();

    const withImages = await base().andWhere(HAS_IMAGES_SQL).getCount();

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let ratingCount = 0;
    let ratingSum = 0;
    for (const row of ratingRows) {
      const stars = Number(row.rating) as 1 | 2 | 3 | 4 | 5;
      const count = Number(row.count);
      distribution[stars] = count;
      ratingCount += count;
      ratingSum += stars * count;
    }

    const fit = Object.fromEntries(REVIEW_FITS.map((value) => [value, 0])) as Record<ReviewFit, number>;
    let fitCount = 0;
    for (const row of fitRows) {
      fit[row.fit] = Number(row.count);
      fitCount += Number(row.count);
    }

    return {
      data: {
        productId,
        ratingCount,
        ratingAverage: ratingCount > 0 ? roundAverage(ratingSum, ratingCount) : null,
        withImages,
        distribution,
        fit: { ...fit, total: fitCount },
      },
    };
  }
}
