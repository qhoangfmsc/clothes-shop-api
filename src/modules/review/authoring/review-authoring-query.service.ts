import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OrderItem } from '../../order/shared/order-item.entity';
import { MS_PER_DAY, REVIEW_WINDOW_DAYS, REVIEWABLE_ORDER_STATUSES, REVIEWABLE_PAYMENT_STATUSES } from '../shared/review.constant';
import { Review } from '../shared/review.entity';
import { findReviewWithProduct } from '../shared/review-lookup.util';
import { productSummary, toOwnView } from '../shared/review-view.util';
import { MyPendingReviewQueryDto } from './dtos/my-pending-review-query.dto';
import { MyReviewQueryDto } from './dtos/my-review-query.dto';

@Injectable()
export class ReviewAuthoringQueryService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
  ) {}

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

  async findOneOwn(reviewId: string) {
    return { data: toOwnView(await findReviewWithProduct(this.reviewRepo, reviewId)) };
  }
}
