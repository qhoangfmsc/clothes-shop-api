import { SearchField } from '@common/decorator/search-field.decorator';
import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { parseQueryBoolean } from '@common/dto/query-boolean.transform';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { REVIEW_FITS, REVIEW_STATUSES } from '../review.constant';

export class AdminReviewQueryDto extends PaginationQueryDto {
  @SearchField('Search keyword (review title, content, author name, product name)')
  search?: string;

  @ApiPropertyOptional({ enum: REVIEW_STATUSES, description: 'Filter by review status' })
  @IsOptional()
  @IsString()
  @IsIn(REVIEW_STATUSES)
  status?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 5, description: 'Filter by star rating' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ enum: REVIEW_FITS, description: 'Filter by fit feedback' })
  @IsOptional()
  @IsString()
  @IsIn(REVIEW_FITS)
  fit?: string;

  @ApiPropertyOptional({ description: 'Filter by product slug' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  product?: string;

  @ApiPropertyOptional({ description: 'Filter by reviewer user ID' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  userId?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'true = only reviews that have photos' })
  @IsOptional()
  @Transform(parseQueryBoolean)
  @IsBoolean()
  hasImages?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'true = only reviews the shop has replied to, false = only reviews without a reply' })
  @IsOptional()
  @Transform(parseQueryBoolean)
  @IsBoolean()
  replied?: boolean;

  @SortField(['createdAt', 'rating', 'helpfulCount'], '-createdAt')
  sort?: string;
}
