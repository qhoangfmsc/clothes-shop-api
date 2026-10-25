import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EReviewErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrderItem } from '../order/shared/order-item.entity';
import { AdminReviewQueryDto } from './dtos/admin-review-query.dto';
import { MyPendingReviewQueryDto } from './dtos/my-pending-review-query.dto';
import { MyReviewQueryDto } from './dtos/my-review-query.dto';
import { PublicReviewQueryDto } from './dtos/public-review-query.dto';
import {
  MS_PER_DAY,
  REVIEW_FITS,
  REVIEW_WINDOW_DAYS,
  REVIEWABLE_ORDER_STATUSES,
  REVIEWABLE_PAYMENT_STATUSES,
  ReviewFit,
} from './review.constant';
import { Review } from './review.entity';
import { productSummary, toAdminView, toOwnView, toPublicView } from './review-view.util';
import { ReviewVote } from './review-vote.entity';

/** Trung bình làm tròn 1 chữ số thập phân, half-up, tính bằng số nguyên (khớp `ROUND(AVG(rating), 1)` của Postgres lưu ở `products.rating_average`) */
const roundAverage = (sum: number, count: number) => Math.floor((sum * 20 + count) / (2 * count)) / 10;

/** Đánh giá có/không có ảnh (`reviews.images` là mảng jsonb) */
const HAS_IMAGES_SQL = 'jsonb_array_length(r.images) > 0';
const NO_IMAGES_SQL = 'jsonb_array_length(r.images) = 0';

@Injectable()
export class ReviewQueryService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
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

  /** Đánh giá của tôi (kể cả đã bị ẩn, kèm lý do) */
  async findMine(userId: string, query: MyReviewQueryDto) {
    const { status, productId, sort } = query;
    const { page, limit } = getPaging(query);

    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.product', 'p')
      .leftJoinAndSelect('p.category', 'cat')
      .leftJoinAndSelect('p.subcategory', 'sub')
      .where('r.userId = :userId', { userId });
    if (status) qb.andWhere('r.status = :status', { status });
    if (productId) qb.andWhere('r.productId = :productId', { productId });

    const { field, direction } = parseSort(sort, '-createdAt');
    qb.orderBy(`r.${field}`, direction).addOrderBy('r.id', 'ASC');
    qb.skip((page - 1) * limit).take(limit);

    const [reviews, total] = await qb.getManyAndCount();
    return paginated(reviews.map(toOwnView), total, page, limit);
  }

  /** Dòng hàng của tôi đang chờ đánh giá: đơn đã giao + đã thu tiền, còn trong hạn, sản phẩm còn tồn tại, chưa có đánh giá */
  async findPending(userId: string, query: MyPendingReviewQueryDto) {
    const { sort } = query;
    const { page, limit } = getPaging(query);

    const qb = this.dataSource
      .createQueryBuilder(OrderItem, 'oi')
      .innerJoinAndSelect('oi.order', 'o')
      .leftJoinAndSelect('oi.product', 'p')
      .leftJoinAndSelect('p.category', 'cat')
      .leftJoinAndSelect('p.subcategory', 'sub')
      .leftJoin(Review, 'r', 'r.orderItemId = oi.id')
      .where('o.userId = :userId', { userId })
      .andWhere('o.status IN (:...statuses)', { statuses: REVIEWABLE_ORDER_STATUSES })
      .andWhere('o.paymentStatus IN (:...paymentStatuses)', { paymentStatuses: REVIEWABLE_PAYMENT_STATUSES })
      .andWhere('o.deliveredAt >= :since', { since: new Date(Date.now() - REVIEW_WINDOW_DAYS * MS_PER_DAY) })
      .andWhere('oi.productId IS NOT NULL')
      .andWhere('r.id IS NULL');

    const { field, direction } = parseSort(sort, '-deliveredAt');
    qb.orderBy(`o.${field}`, direction).addOrderBy('oi.id', 'ASC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return paginated(
      items.map((item) => ({
        orderItemId: item.id,
        orderId: item.orderId,
        productId: item.productId,
        productName: item.productName,
        productImage: item.productImage,
        product: productSummary(item.product),
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        deliveredAt: item.order.deliveredAt,
        reviewDeadline: new Date((item.order.deliveredAt as Date).getTime() + REVIEW_WINDOW_DAYS * MS_PER_DAY),
      })),
      total,
      page,
      limit,
    );
  }

  /** Id các đánh giá của một sản phẩm mà tôi đã bấm "hữu ích" (để FE tô nút) */
  async findMyVotes(userId: string, productId: string) {
    const rows = await this.dataSource
      .createQueryBuilder(ReviewVote, 'v')
      .innerJoin('v.review', 'r')
      .select('v.reviewId', 'reviewId')
      .where('v.userId = :userId', { userId })
      .andWhere('r.productId = :productId', { productId })
      .getRawMany<{ reviewId: string }>();
    return { data: rows.map((row) => row.reviewId) };
  }

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
    return { data: toAdminView(await this.getWithProduct(reviewId)) };
  }

  async findOneOwn(reviewId: string) {
    return { data: toOwnView(await this.getWithProduct(reviewId)) };
  }

  private async getWithProduct(reviewId: string): Promise<Review> {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId },
      relations: { product: { category: true, subcategory: true } },
    });
    if (!review) throwAppError(EReviewErrorCode.REVIEW_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
    return review;
  }
}
