import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { parseQueryBoolean } from '@common/dto/query-boolean.transform';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { REVIEW_FITS } from '../review.constant';

export class PublicReviewQueryDto extends PaginationQueryDto {
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

  @ApiPropertyOptional({ type: Boolean, description: 'true = only reviews that have photos' })
  @IsOptional()
  @Transform(parseQueryBoolean)
  @IsBoolean()
  hasImages?: boolean;

  @SortField(['rating', 'createdAt', 'helpfulCount'], '-createdAt')
  sort?: string;
}
