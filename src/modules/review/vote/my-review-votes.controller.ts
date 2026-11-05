import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../../user/user.entity';
import { MyReviewVotesQueryDto } from './dtos/my-review-votes-query.dto';
import { ReviewVoteService } from './review-vote.service';

@ApiTags('Reviews')
@Controller('api/my-reviews')
@ApiBearerAuth()
export class MyReviewVotesController {
  constructor(private readonly voteService: ReviewVoteService) {}

  @Get('votes')
  @ApiOperation({ summary: 'Id các đánh giá của một sản phẩm mà tôi đã bấm "hữu ích"' })
  @Permissions(Permission.REVIEW_VIEW)
  findVotes(@CurrentUser() user: User, @Query() query: MyReviewVotesQueryDto) {
    return this.voteService.findMyVotes(user.id, query.productId);
  }
}
