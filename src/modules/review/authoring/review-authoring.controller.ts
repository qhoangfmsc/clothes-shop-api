import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { RateLimit } from '@common/decorator/rate-limit.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { REVIEW_IMAGE_MAX_FILE_SIZE } from '../../media/media.constant';
import { User } from '../../user/user.entity';
import { CreateReviewDto } from './dtos/create-review.dto';
import { UpdateReviewDto } from './dtos/update-review.dto';
import { ReviewAuthoringService } from './review-authoring.service';

@ApiTags('Reviews')
@Controller('api/reviews')
export class ReviewAuthoringController {
  constructor(private readonly reviewService: ReviewAuthoringService) {}

  @Post('images')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upload 1 ảnh để đính vào đánh giá (multipart, field "file"; gửi URL trả về ở `images` của POST/PATCH đánh giá)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @Permissions(Permission.REVIEW_CREATE)
  @RateLimit('upload')
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
}
