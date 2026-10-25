import { findLocked } from '@common/base/lock.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EReviewErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Review } from '../shared/review.entity';
import { lockProduct, refreshProductRating } from '../shared/review-rating.util';
import { HideReviewDto } from './dtos/hide-review.dto';
import { ReplyReviewDto } from './dtos/reply-review.dto';
import { ReviewModerationQueryService } from './review-moderation-query.service';

@Injectable()
export class ReviewModerationService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly queryService: ReviewModerationQueryService,
  ) {}

  /** Ẩn đánh giá vi phạm (spam, link, thông tin cá nhân, ngôn từ không phù hợp…); `note` là lý do, tác giả thấy */
  async hide(adminId: string, reviewId: string, dto: HideReviewDto) {
    await this.withLockedReview(reviewId, async (manager, review) => {
      if (review.status !== 'PUBLISHED') throwAppError(EReviewErrorCode.REVIEW_INVALID_STATE, 'This review is already hidden');
      review.status = 'HIDDEN';
      review.moderationNote = dto.note;
      review.moderatedBy = adminId;
      review.moderatedAt = new Date();
      await manager.save(review);
      await lockProduct(manager, review.productId);
      await refreshProductRating(manager, review.productId);
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
      await lockProduct(manager, review.productId);
      await refreshProductRating(manager, review.productId);
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

  private withLockedReview(reviewId: string, fn: (manager: EntityManager, review: Review) => Promise<void>) {
    return this.dataSource.transaction(async (manager) => {
      const review = await findLocked(manager, Review, { id: reviewId });
      if (!review) throwAppError(EReviewErrorCode.REVIEW_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
      await fn(manager, review);
    });
  }
}
