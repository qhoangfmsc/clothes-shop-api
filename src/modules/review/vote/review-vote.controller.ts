import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Controller, Delete, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../../user/user.entity';
import { ReviewVoteService } from './review-vote.service';

@ApiTags('Reviews')
@Controller('api/reviews')
export class ReviewVoteController {
  constructor(private readonly reviewService: ReviewVoteService) {}

  @Post(':reviewId/helpful')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bấm "hữu ích" cho một đánh giá (idempotent; không vote đánh giá của chính mình)' })
  @Permissions(Permission.REVIEW_VOTE)
  vote(@CurrentUser() user: User, @Param('reviewId') reviewId: string) {
    return this.reviewService.vote(user.id, reviewId);
  }

  @Delete(':reviewId/helpful')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bỏ "hữu ích" đã bấm' })
  @Permissions(Permission.REVIEW_VOTE)
  unvote(@CurrentUser() user: User, @Param('reviewId') reviewId: string) {
    return this.reviewService.unvote(user.id, reviewId);
  }
}
