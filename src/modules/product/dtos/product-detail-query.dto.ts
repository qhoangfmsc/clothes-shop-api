import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const RELATED_DEFAULT_LIMIT = 4;
export const RELATED_MAX_LIMIT = 20;

export class ProductDetailQueryDto {
  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: RELATED_MAX_LIMIT,
    default: RELATED_DEFAULT_LIMIT,
    description: 'Max related products returned',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(RELATED_MAX_LIMIT)
  relatedLimit?: number = RELATED_DEFAULT_LIMIT;
}
