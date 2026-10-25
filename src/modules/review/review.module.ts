import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaModule } from '../media/media.module';
import { Order } from '../order/shared/order.entity';
import { OrderItem } from '../order/shared/order-item.entity';
import { AdminReviewController } from './admin-review.controller';
import { MyReviewController } from './my-review.controller';
import { ReviewController } from './review.controller';
import { Review } from './review.entity';
import { ReviewService } from './review.service';
import { ReviewQueryService } from './review-query.service';
import { ReviewVote } from './review-vote.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Review, ReviewVote, Order, OrderItem]), MediaModule],
  exports: [ReviewQueryService],
  controllers: [ReviewController, MyReviewController, AdminReviewController],
  providers: [ReviewService, ReviewQueryService],
})
export class ReviewModule {}
