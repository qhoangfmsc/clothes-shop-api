import { Public } from '@common/decorator/public.decorator';
import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReviewService } from './review.service';

@ApiTags('Reviews')
@Controller('api/reviews')
@Public()
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Get(':productId')
  @ApiOperation({ summary: 'Get reviews for a product' })
  async findByProduct(@Param('productId') productId: string) {
    return this.reviewService.findByProductId(productId);
  }
}
