import { Public } from '@common/decorator/public.decorator';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicReviewQueryDto } from './dtos/public-review-query.dto';
import { ReviewPublicQueryService } from './review-public-query.service';

@ApiTags('Reviews')
@Controller('api/reviews')
export class ReviewPublicController {
  constructor(private readonly queryService: ReviewPublicQueryService) {}

  @Get(':productId')
  @Public()
  @ApiOperation({
    summary: 'Đánh giá đang hiển thị của một sản phẩm (filter rating/fit/hasImages, sort rating/createdAt/helpfulCount, pagination)',
  })
  findByProduct(@Param('productId') productId: string, @Query() query: PublicReviewQueryDto) {
    return this.queryService.findByProductId(productId, query);
  }

  @Get(':productId/summary')
  @Public()
  @ApiOperation({ summary: 'Điểm trung bình, số đánh giá, số đánh giá có ảnh, phân bố 1–5 sao và phân bố fit của một sản phẩm' })
  getSummary(@Param('productId') productId: string) {
    return this.queryService.getSummary(productId);
  }
}
