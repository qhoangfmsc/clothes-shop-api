import { getPaging, paginated } from '@common/base/pagination.util';
import { parseSort } from '@common/base/sort.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EMediaErrorCode, EReviewErrorCode } from '@common/exceptions/error-codes';
import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { REVIEW_IMAGE_MAX_FILE_SIZE } from '../media/media.constant';
import { MediaService } from '../media/media.service';
import { Order } from '../order/order.entity';
import { OrderItem } from '../order/order-item.entity';
import { Product } from '../product/product.entity';
import { User } from '../user/user.entity';
import { AdminReviewQueryDto } from './dtos/admin-review-query.dto';
import { CreateReviewDto } from './dtos/create-review.dto';
import { HideReviewDto } from './dtos/hide-review.dto';
import { MyPendingReviewQueryDto } from './dtos/my-pending-review-query.dto';
import { MyReviewQueryDto } from './dtos/my-review-query.dto';
import { PublicReviewQueryDto } from './dtos/public-review-query.dto';
import { ReplyReviewDto } from './dtos/reply-review.dto';
import { UpdateReviewDto } from './dtos/update-review.dto';
import {
  MS_PER_DAY,
  REVIEW_FITS,
  REVIEW_WINDOW_DAYS,
  REVIEWABLE_ORDER_STATUSES,
  REVIEWABLE_PAYMENT_STATUSES,
  ReviewFit,
} from './review.constant';
import { Review } from './review.entity';
import {
  computeReviewEligibility,
  containsLink,
  editDeadline,
  REVIEW_EDIT_BLOCK_MESSAGES,
  REVIEW_INELIGIBLE_MESSAGES,
  reviewEditBlock,
} from './review-eligibility.util';
import { ReviewVote } from './review-vote.entity';

const isUniqueViolation = (err: unknown) => {
  const e = err as { code?: string; driverError?: { code?: string } };
  return e?.code === '23505' || e?.driverError?.code === '23505';
};

/** Trung bình làm tròn 1 chữ số thập phân, half-up, tính bằng số nguyên (khớp `ROUND(AVG(rating), 1)` của Postgres lưu ở `products.rating_average`) */
const roundAverage = (sum: number, count: number) => Math.floor((sum * 20 + count) / (2 * count)) / 10;

/** Đánh giá có/không có ảnh (`reviews.images` là mảng jsonb) */
const HAS_IMAGES_SQL = 'jsonb_array_length(r.images) > 0';
const NO_IMAGES_SQL = 'jsonb_array_length(r.images) = 0';

const productSummary = (product?: { id: string; name: string; slug: string; images: string[] } | null) =>
  product ? { id: product.id, name: product.name, slug: product.slug, image: product.images?.[0] ?? null } : null;

/** Phần công khai của một đánh giá (không lộ `userId`, `orderItemId`, ghi chú kiểm duyệt) */
const toPublicView = (r: Review) => ({
  id: r.id,
  author: r.author,
  avatar: r.avatar,
  rating: r.rating,
  date: r.date,
  createdAt: r.createdAt,
  title: r.title,
  content: r.content,
  verified: r.verified,
  fit: r.fit,
  images: r.images ?? [],
  size: r.size,
  color: r.color,
  helpfulCount: r.helpfulCount,
  edited: r.editedAt !== null,
  reply: r.reply ? { content: r.reply, repliedAt: r.repliedAt } : null,
});

/** Góc nhìn của tác giả: thêm trạng thái, lý do bị ẩn và việc còn sửa được hay không */
const toOwnView = (r: Review) => {
  const block = reviewEditBlock(r);
  return {
    ...toPublicView(r),
    productId: r.productId,
    orderItemId: r.orderItemId,
    product: productSummary(r.product),
    status: r.status,
    moderationNote: r.status === 'HIDDEN' ? r.moderationNote : null,
    editedAt: r.editedAt,
    canEdit: block === null,
    editableUntil: block === null ? editDeadline(r.createdAt) : null,
  };
};

const toAdminView = (r: Review) => ({
  ...toPublicView(r),
  productId: r.productId,
  orderItemId: r.orderItemId,
  userId: r.userId,
  product: productSummary(r.product),
  status: r.status,
  moderationNote: r.moderationNote,
  moderatedBy: r.moderatedBy,
  moderatedAt: r.moderatedAt,
  editedAt: r.editedAt,
  repliedBy: r.repliedBy,
});

/**
 * Đánh giá sản phẩm. Khách chỉ đánh giá được dòng hàng của đơn đã giao và đã thu tiền, trong hạn `REVIEW_WINDOW_DAYS` ngày kể từ
 * lúc giao (mỗi dòng hàng một đánh giá, sửa được một lần). Đánh giá đăng ngay (`PUBLISHED`), admin kiểm duyệt sau bằng cách ẩn
 * kèm lý do; ẩn không bao giờ dựa vào số sao.
 */
@Injectable()
export class ReviewService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    private readonly mediaService: MediaService,
  ) {}

  // ============================================
  // PUBLIC
  // ============================================

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

  // ============================================
  // CUSTOMER
  // ============================================

  async create(user: User, dto: CreateReviewDto) {
    if (containsLink(dto.title, dto.content)) throwAppError(EReviewErrorCode.REVIEW_CONTENT_NOT_ALLOWED);
    const images = await this.resolveImages(user.id, dto.images);

    let saved: Review;
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        const item = await manager.findOne(OrderItem, { where: { id: dto.orderItemId } });
        const order = item && (await manager.findOne(Order, { where: { id: item.orderId, userId: user.id } }));
        if (!item || !order) throwAppError(EReviewErrorCode.REVIEW_NOT_ALLOWED, 'Order item not found', HttpStatus.NOT_FOUND);

        const eligibility = computeReviewEligibility({ order, item });
        if (!eligibility.eligible) {
          throwAppError(EReviewErrorCode.REVIEW_NOT_ALLOWED, REVIEW_INELIGIBLE_MESSAGES[eligibility.reason!]);
        }
        if (await manager.exists(Review, { where: { orderItemId: item.id } })) {
          throwAppError(EReviewErrorCode.REVIEW_ALREADY_EXISTS, undefined, HttpStatus.CONFLICT);
        }

        // Khoá sản phẩm TRƯỚC khi chèn đánh giá (FK của dòng mới sẽ giữ khoá chia sẻ trên sản phẩm; khoá sau sẽ bế tắc khi hai đánh giá đồng thời)
        await this.lockProduct(manager, item.productId as string);

        const review = await manager.save(
          manager.create(Review, {
            productId: item.productId as string,
            userId: user.id,
            orderItemId: item.id,
            author: user.name?.trim() || 'Customer',
            avatar: user.image ?? '',
            rating: dto.rating,
            date: new Date().toISOString().slice(0, 10),
            title: dto.title ?? '',
            content: dto.content ?? '',
            verified: true,
            size: item.size,
            color: item.color,
            fit: (dto.fit as ReviewFit | undefined) ?? null,
            images,
            status: 'PUBLISHED',
            helpfulCount: 0,
            editedAt: null,
            moderationNote: null,
            moderatedBy: null,
            moderatedAt: null,
            reply: null,
            repliedBy: null,
            repliedAt: null,
          }),
        );
        await this.refreshProductRating(manager, review.productId);
        return review;
      });
    } catch (err) {
      // Hai request đồng thời cho cùng một dòng hàng: UNIQUE(order_item_id) chặn bản thứ hai
      if (isUniqueViolation(err)) throwAppError(EReviewErrorCode.REVIEW_ALREADY_EXISTS, undefined, HttpStatus.CONFLICT);
      throw err;
    }
    return { data: toOwnView(await this.getWithProduct(saved.id)) };
  }

  /** Sửa đánh giá của mình — một lần, trong hạn sửa, khi chưa bị ẩn */
  async update(userId: string, reviewId: string, dto: UpdateReviewDto) {
    if (
      dto.rating === undefined &&
      dto.title === undefined &&
      dto.content === undefined &&
      dto.fit === undefined &&
      dto.images === undefined
    ) {
      throw new BadRequestException('Nothing to update');
    }
    if (containsLink(dto.title, dto.content)) throwAppError(EReviewErrorCode.REVIEW_CONTENT_NOT_ALLOWED);
    const images = dto.images === undefined ? undefined : await this.resolveImages(userId, dto.images);

    await this.dataSource.transaction(async (manager) => {
      const review = await manager.findOne(Review, { where: { id: reviewId, userId }, lock: { mode: 'pessimistic_write' } });
      if (!review) throwAppError(EReviewErrorCode.REVIEW_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

      const block = reviewEditBlock(review);
      if (block) throwAppError(EReviewErrorCode.REVIEW_EDIT_NOT_ALLOWED, REVIEW_EDIT_BLOCK_MESSAGES[block]);

      if (dto.rating !== undefined) review.rating = dto.rating;
      if (dto.title !== undefined) review.title = dto.title;
      if (dto.content !== undefined) review.content = dto.content;
      if (dto.fit !== undefined) review.fit = dto.fit as ReviewFit;
      if (images !== undefined) review.images = images;
      review.editedAt = new Date();
      await manager.save(review);

      if (dto.rating !== undefined) {
        await this.lockProduct(manager, review.productId);
        await this.refreshProductRating(manager, review.productId);
      }
    });
    return { data: toOwnView(await this.getWithProduct(reviewId)) };
  }

  /** Upload 1 ảnh để đính vào đánh giá (chưa gắn vào đánh giá nào; gửi URL trả về ở `images` của create/update) */
  async uploadImage(userId: string, file?: Express.Multer.File) {
    if (file && file.size > REVIEW_IMAGE_MAX_FILE_SIZE) {
      throwAppError(EMediaErrorCode.MEDIA_FILE_TOO_LARGE, undefined, HttpStatus.PAYLOAD_TOO_LARGE);
    }
    const { data } = await this.mediaService.upload(file, { purpose: 'REVIEW', uploadedBy: userId });
    return { data: { url: data.url, mimeType: data.mimeType, size: data.sizeOriginal } };
  }

  /** Đánh giá của tôi (kể cả đã bị ẩn, kèm lý do) */
  async findMine(userId: string, query: MyReviewQueryDto) {
    const { status, productId, sort } = query;
    const { page, limit } = getPaging(query);

    const qb = this.reviewRepo.createQueryBuilder('r').leftJoinAndSelect('r.product', 'p').where('r.userId = :userId', { userId });
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

  /** Bấm "hữu ích" (idempotent). Không vote đánh giá của chính mình hay đánh giá đã bị ẩn */
  vote(userId: string, reviewId: string) {
    return this.setVote(userId, reviewId, true);
  }

  unvote(userId: string, reviewId: string) {
    return this.setVote(userId, reviewId, false);
  }

  private setVote(userId: string, reviewId: string, voted: boolean) {
    return this.dataSource.transaction(async (manager) => {
      // Khoá dòng đánh giá: các vote đồng thời cho cùng đánh giá phải tuần tự để số đếm luôn đúng
      const review = await manager.findOne(Review, { where: { id: reviewId }, lock: { mode: 'pessimistic_write' } });
      if (review?.status !== 'PUBLISHED') throwAppError(EReviewErrorCode.REVIEW_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);

      if (voted) {
        if (review.userId === userId) throwAppError(EReviewErrorCode.REVIEW_VOTE_OWN);
        if (!(await manager.exists(ReviewVote, { where: { reviewId, userId } }))) {
          await manager.save(manager.create(ReviewVote, { reviewId, userId }));
        }
      } else {
        await manager.delete(ReviewVote, { reviewId, userId });
      }

      const helpfulCount = await manager.count(ReviewVote, { where: { reviewId } });
      await manager.update(Review, { id: reviewId }, { helpfulCount });
      return { data: { reviewId, helpfulCount, voted } };
    });
  }

  // ============================================
  // ADMIN
  // ============================================

  async findAllAdmin(query: AdminReviewQueryDto) {
    const { search, status, rating, fit, hasImages, product, userId, replied, sort } = query;
    const { page, limit } = getPaging(query);

    const qb = this.reviewRepo.createQueryBuilder('r').leftJoinAndSelect('r.product', 'p');
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

  /** Ẩn đánh giá vi phạm (spam, link, thông tin cá nhân, ngôn từ không phù hợp…); `note` là lý do, tác giả thấy */
  async hide(adminId: string, reviewId: string, dto: HideReviewDto) {
    await this.withLockedReview(reviewId, async (manager, review) => {
      if (review.status !== 'PUBLISHED') throwAppError(EReviewErrorCode.REVIEW_INVALID_STATE, 'This review is already hidden');
      review.status = 'HIDDEN';
      review.moderationNote = dto.note;
      review.moderatedBy = adminId;
      review.moderatedAt = new Date();
      await manager.save(review);
      await this.lockProduct(manager, review.productId);
      await this.refreshProductRating(manager, review.productId);
    });
    return this.findOneAdmin(reviewId);
  }

  /** Hiện lại đánh giá đã ẩn */
  async publish(adminId: string, reviewId: string) {
    await this.withLockedReview(reviewId, async (manager, review) => {
      if (review.status !== 'HIDDEN') throwAppError(EReviewErrorCode.REVIEW_INVALID_STATE, 'This review is already published');
      review.status = 'PUBLISHED';
      review.moderationNote = null;
      review.moderatedBy = adminId;
      review.moderatedAt = new Date();
      await manager.save(review);
      await this.lockProduct(manager, review.productId);
      await this.refreshProductRating(manager, review.productId);
    });
    return this.findOneAdmin(reviewId);
  }

  /** Đặt hoặc thay phản hồi của cửa hàng */
  async reply(adminId: string, reviewId: string, dto: ReplyReviewDto) {
    await this.withLockedReview(reviewId, async (manager, review) => {
      review.reply = dto.content;
      review.repliedBy = adminId;
      review.repliedAt = new Date();
      await manager.save(review);
    });
    return this.findOneAdmin(reviewId);
  }

  async removeReply(reviewId: string) {
    await this.withLockedReview(reviewId, async (manager, review) => {
      review.reply = null;
      review.repliedBy = null;
      review.repliedAt = null;
      await manager.save(review);
    });
    return this.findOneAdmin(reviewId);
  }

  /** Ảnh gửi lên phải là ảnh đánh giá do chính user upload; trả URL chuẩn hoá (không có ảnh → `[]`) */
  private async resolveImages(userId: string, urls: string[] | undefined): Promise<string[]> {
    if (!urls || urls.length === 0) return [];
    const resolved = await this.mediaService.resolveReviewImageUrls(userId, urls);
    if (!resolved) throwAppError(EReviewErrorCode.REVIEW_IMAGE_INVALID);
    return resolved;
  }

  /** Khoá dòng sản phẩm; mọi thay đổi đánh giá chạy tuần tự theo sản phẩm nên số liệu tổng hợp luôn tính trên dữ liệu đã commit */
  private async lockProduct(manager: EntityManager, productId: string) {
    await manager.findOne(Product, { where: { id: productId }, select: { id: true }, lock: { mode: 'pessimistic_write' } });
  }

  /** Tính lại `products.rating_average`/`rating_count` từ các đánh giá `PUBLISHED` (gọi sau `lockProduct`, trong cùng transaction) */
  private async refreshProductRating(manager: EntityManager, productId: string) {
    const row = await manager
      .createQueryBuilder(Review, 'r')
      .select('COUNT(*)', 'count')
      .addSelect('ROUND(AVG(r.rating)::numeric, 1)', 'average')
      .where('r.productId = :productId', { productId })
      .andWhere('r.status = :status', { status: 'PUBLISHED' })
      .getRawOne<{ count: string; average: string | null }>();
    const ratingCount = Number(row?.count ?? 0);
    await manager.update(Product, { id: productId }, { ratingCount, ratingAverage: ratingCount > 0 ? Number(row?.average) : null });
  }

  private async getWithProduct(reviewId: string): Promise<Review> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId }, relations: { product: true } });
    if (!review) throwAppError(EReviewErrorCode.REVIEW_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
    return review;
  }

  private withLockedReview(reviewId: string, fn: (manager: EntityManager, review: Review) => Promise<void>) {
    return this.dataSource.transaction(async (manager) => {
      const review = await manager.findOne(Review, { where: { id: reviewId }, lock: { mode: 'pessimistic_write' } });
      if (!review) throwAppError(EReviewErrorCode.REVIEW_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      await fn(manager, review);
    });
  }
}
