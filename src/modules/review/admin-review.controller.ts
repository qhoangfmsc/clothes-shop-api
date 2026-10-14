import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../user/user.entity';
import { AdminReviewQueryDto } from './dtos/admin-review-query.dto';
import { HideReviewDto } from './dtos/hide-review.dto';
import { ReplyReviewDto } from './dtos/reply-review.dto';
import { ReviewService } from './review.service';

@ApiTags('Admin — Reviews')
@Controller('api/admin/reviews')
@ApiBearerAuth()
export class AdminReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get()
  @ApiOperation({
    summary: '[Admin] Danh sách đánh giá (search, filter status/rating/fit/hasImages/product/userId/replied, sort, pagination)',
  })
  @Permissions(Permission.REVIEW_ADMIN_VIEW)
  findAll(@Query() query: AdminReviewQueryDto) {
    return this.reviewService.findAllAdmin(query);
  }

  @Get(':reviewId')
  @ApiOperation({ summary: '[Admin] Chi tiết một đánh giá (kèm người viết, kiểm duyệt, phản hồi, sản phẩm)' })
  @Permissions(Permission.REVIEW_ADMIN_VIEW)
  findOne(@Param('reviewId') reviewId: string) {
    return this.reviewService.findOneAdmin(reviewId);
  }

  @Post(':reviewId/hide')
  @ApiOperation({
    summary: '[Admin] Ẩn đánh giá vi phạm (note = lý do, tác giả thấy)',
    description: 'Chỉ ẩn khi vi phạm quy định nội dung; không ẩn vì số sao thấp.',
  })
  @Permissions(Permission.REVIEW_ADMIN_MODERATE)
  hide(@CurrentUser() admin: User, @Param('reviewId') reviewId: string, @Body() dto: HideReviewDto) {
    return this.reviewService.hide(admin.id, reviewId, dto);
  }

  @Post(':reviewId/publish')
  @ApiOperation({ summary: '[Admin] Hiện lại đánh giá đã ẩn' })
  @Permissions(Permission.REVIEW_ADMIN_MODERATE)
  publish(@CurrentUser() admin: User, @Param('reviewId') reviewId: string) {
    return this.reviewService.publish(admin.id, reviewId);
  }

  @Put(':reviewId/reply')
  @ApiOperation({ summary: '[Admin] Đặt hoặc thay phản hồi của cửa hàng (hiển thị công khai dưới đánh giá)' })
  @Permissions(Permission.REVIEW_ADMIN_REPLY)
  reply(@CurrentUser() admin: User, @Param('reviewId') reviewId: string, @Body() dto: ReplyReviewDto) {
    return this.reviewService.reply(admin.id, reviewId, dto);
  }

  @Delete(':reviewId/reply')
  @ApiOperation({ summary: '[Admin] Xoá phản hồi của cửa hàng' })
  @Permissions(Permission.REVIEW_ADMIN_REPLY)
  removeReply(@Param('reviewId') reviewId: string) {
    return this.reviewService.removeReply(reviewId);
  }
}
