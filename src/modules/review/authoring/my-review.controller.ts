import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../../user/user.entity';
import { MyPendingReviewQueryDto } from './dtos/my-pending-review-query.dto';
import { MyReviewQueryDto } from './dtos/my-review-query.dto';
import { ReviewAuthoringQueryService } from './review-authoring-query.service';

@ApiTags('Reviews')
@Controller('api/my-reviews')
@ApiBearerAuth()
export class MyReviewController {
  constructor(private readonly queryService: ReviewAuthoringQueryService) {}

  @Get()
  @ApiOperation({ summary: 'Đánh giá của tôi, kể cả đã bị ẩn kèm lý do (pagination, filter status/productId)' })
  @Permissions(Permission.REVIEW_VIEW)
  findAll(@CurrentUser() user: User, @Query() query: MyReviewQueryDto) {
    return this.queryService.findMine(user.id, query);
  }

  @Get('pending')
  @ApiOperation({ summary: 'Dòng hàng đang chờ tôi đánh giá (đơn đã giao + đã thanh toán, còn hạn, chưa đánh giá)' })
  @Permissions(Permission.REVIEW_VIEW)
  findPending(@CurrentUser() user: User, @Query() query: MyPendingReviewQueryDto) {
    return this.queryService.findPending(user.id, query);
  }
}
