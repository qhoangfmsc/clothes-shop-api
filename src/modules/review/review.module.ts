import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaModule } from '../media/media.module';
import { Order } from '../order/shared/order.entity';
import { OrderItem } from '../order/shared/order-item.entity';
import { MyReviewController } from './authoring/my-review.controller';
import { ReviewAuthoringController } from './authoring/review-authoring.controller';
import { ReviewAuthoringService } from './authoring/review-authoring.service';
import { ReviewAuthoringQueryService } from './authoring/review-authoring-query.service';
import { AdminReviewController } from './moderation/admin-review.controller';
import { ReviewModerationService } from './moderation/review-moderation.service';
import { ReviewModerationQueryService } from './moderation/review-moderation-query.service';
import { ReviewPublicController } from './public/review-public.controller';
import { ReviewPublicQueryService } from './public/review-public-query.service';
import { Review } from './shared/review.entity';
import { ReviewVote } from './shared/review-vote.entity';
import { MyReviewVotesController } from './vote/my-review-votes.controller';
import { ReviewVoteController } from './vote/review-vote.controller';
import { ReviewVoteService } from './vote/review-vote.service';

@Module({
  imports: [TypeOrmModule.forFeature([Review, ReviewVote, Order, OrderItem]), MediaModule],
  exports: [ReviewModerationQueryService],
  controllers: [
    ReviewPublicController,
    ReviewAuthoringController,
    ReviewVoteController,
    MyReviewController,
    MyReviewVotesController,
    AdminReviewController,
  ],
  providers: [
    ReviewPublicQueryService,
    ReviewAuthoringService,
    ReviewAuthoringQueryService,
    ReviewVoteService,
    ReviewModerationService,
    ReviewModerationQueryService,
  ],
})
export class ReviewModule {}
