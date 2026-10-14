import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Public } from '@common/decorator/public.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { REVIEW_IMAGE_MAX_FILE_SIZE } from '../media/media.constant';
import { User } from '../user/user.entity';
import { CreateReviewDto } from './dtos/create-review.dto';
import { PublicReviewQueryDto } from './dtos/public-review-query.dto';
import { UpdateReviewDto } from './dtos/update-review.dto';
import { ReviewService } from './review.service';

@ApiTags('Reviews')
@Controller('api/reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get(':productId')
  @Public()
  @ApiOperation({
    summary: 'Đánh giá đang hiển thị của một sản phẩm (filter rating/fit/hasImages, sort rating/createdAt/helpfulCount, pagination)',
  })
  findByProduct(@Param('productId') productId: string, @Query() query: PublicReviewQueryDto) {
    return this.reviewService.findByProductId(productId, query);
  }

  @Get(':productId/summary')
  @Public()
  @ApiOperation({ summary: 'Điểm trung bình, số đánh giá, số đánh giá có ảnh, phân bố 1–5 sao và phân bố fit của một sản phẩm' })
  getSummary(@Param('productId') productId: string) {
    return this.reviewService.getSummary(productId);
  }

  @Post('images')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upload 1 ảnh để đính vào đánh giá (multipart, field "file"; gửi URL trả về ở `images` của POST/PATCH đánh giá)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @Permissions(Permission.REVIEW_CREATE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: REVIEW_IMAGE_MAX_FILE_SIZE, files: 1 }, defParamCharset: 'utf8' }))
  uploadImage(@CurrentUser() user: User, @UploadedFile() file?: Express.Multer.File) {
    return this.reviewService.uploadImage(user.id, file);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Đánh giá một dòng hàng của đơn đã giao và đã thanh toán, trong hạn viết đánh giá (mỗi dòng hàng một đánh giá)',
  })
  @Permissions(Permission.REVIEW_CREATE)
  create(@CurrentUser() user: User, @Body() dto: CreateReviewDto) {
    return this.reviewService.create(user, dto);
  }

  @Patch(':reviewId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sửa đánh giá của tôi (một lần, trong hạn sửa, khi chưa bị ẩn)' })
  @Permissions(Permission.REVIEW_CREATE)
  update(@CurrentUser() user: User, @Param('reviewId') reviewId: string, @Body() dto: UpdateReviewDto) {
    return this.reviewService.update(user.id, reviewId, dto);
  }

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
