import { findLocked } from '@common/base/lock.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EReviewErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Review } from '../shared/review.entity';
import { ReviewVote } from '../shared/review-vote.entity';

@Injectable()
export class ReviewVoteService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

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
}
