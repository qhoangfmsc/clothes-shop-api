import { Public } from '@common/decorator/public.decorator';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicReviewQueryDto } from './dtos/public-review-query.dto';
import { ReviewService } from './review.service';

@ApiTags('Reviews')
@Controller('api/reviews')
@Public()
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get(':productId')
  @ApiOperation({ summary: 'Get paginated reviews for a product' })
  async findByProduct(@Param('productId') productId: string, @Query() query: PublicReviewQueryDto) {
    return this.reviewService.findByProductId(productId, query);
  }
}
