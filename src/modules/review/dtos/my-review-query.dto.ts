import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { REVIEW_STATUSES } from '../review.constant';

export class MyReviewQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: REVIEW_STATUSES, description: 'Filter by review status' })
  @IsOptional()
  @IsString()
  @IsIn(REVIEW_STATUSES)
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by product ID' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  productId?: string;

  @SortField(['createdAt', 'rating'], '-createdAt')
  sort?: string;
}
