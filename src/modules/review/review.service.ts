import { isUniqueViolation } from '@common/base/db-error.util';
import { findLocked } from '@common/base/lock.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EMediaErrorCode, EReviewErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { REVIEW_IMAGE_MAX_FILE_SIZE } from '../media/media.constant';
import { MediaService } from '../media/media.service';
import { Order } from '../order/order.entity';
import { OrderItem } from '../order/order-item.entity';
import { Product } from '../product/product.entity';
import { setProductRating } from '../product/product-rating.util';
import { User } from '../user/user.entity';
import { CreateReviewDto } from './dtos/create-review.dto';
import { HideReviewDto } from './dtos/hide-review.dto';
import { ReplyReviewDto } from './dtos/reply-review.dto';
import { UpdateReviewDto } from './dtos/update-review.dto';
import { ReviewFit } from './review.constant';
import { Review } from './review.entity';
import {
  computeReviewEligibility,
  containsLink,
  REVIEW_EDIT_BLOCK_MESSAGES,
  REVIEW_INELIGIBLE_MESSAGES,
  reviewEditBlock,
} from './review-eligibility.util';
import { ReviewQueryService } from './review-query.service';
import { ReviewVote } from './review-vote.entity';

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
    private readonly mediaService: MediaService,
    private readonly queryService: ReviewQueryService,
  ) {}

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
    return this.queryService.findOneOwn(saved.id);
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
      throwAppError(EReviewErrorCode.REVIEW_NOTHING_TO_UPDATE);
    }
    if (containsLink(dto.title, dto.content)) throwAppError(EReviewErrorCode.REVIEW_CONTENT_NOT_ALLOWED);
    const images = dto.images === undefined ? undefined : await this.resolveImages(userId, dto.images);

    await this.dataSource.transaction(async (manager) => {
      const review = await findLocked(manager, Review, { id: reviewId, userId });
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
    return this.queryService.findOneOwn(reviewId);
  }

  /** Upload 1 ảnh để đính vào đánh giá (chưa gắn vào đánh giá nào; gửi URL trả về ở `images` của create/update) */
  async uploadImage(userId: string, file?: Express.Multer.File) {
    if (file && file.size > REVIEW_IMAGE_MAX_FILE_SIZE) {
      throwAppError(EMediaErrorCode.MEDIA_FILE_TOO_LARGE, undefined, HttpStatus.PAYLOAD_TOO_LARGE);
    }
    const { data } = await this.mediaService.upload(file, { purpose: 'REVIEW', uploadedBy: userId });
    return { data: { url: data.url, mimeType: data.mimeType, size: data.sizeOriginal } };
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
      const review = await findLocked(manager, Review, { id: reviewId });
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
    return this.queryService.findOneAdmin(reviewId);
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
    return this.queryService.findOneAdmin(reviewId);
  }

  /** Đặt hoặc thay phản hồi của cửa hàng */
  async reply(adminId: string, reviewId: string, dto: ReplyReviewDto) {
    await this.withLockedReview(reviewId, async (manager, review) => {
      review.reply = dto.content;
      review.repliedBy = adminId;
      review.repliedAt = new Date();
      await manager.save(review);
    });
    return this.queryService.findOneAdmin(reviewId);
  }

  async removeReply(reviewId: string) {
    await this.withLockedReview(reviewId, async (manager, review) => {
      review.reply = null;
      review.repliedBy = null;
      review.repliedAt = null;
      await manager.save(review);
    });
    return this.queryService.findOneAdmin(reviewId);
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
    await findLocked(manager, Product, { id: productId }, { select: { id: true } });
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
    await setProductRating(manager, productId, { count: ratingCount, average: ratingCount > 0 ? Number(row?.average) : null });
  }

  private withLockedReview(reviewId: string, fn: (manager: EntityManager, review: Review) => Promise<void>) {
    return this.dataSource.transaction(async (manager) => {
      const review = await findLocked(manager, Review, { id: reviewId });
      if (!review) throwAppError(EReviewErrorCode.REVIEW_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      await fn(manager, review);
    });
  }
}
