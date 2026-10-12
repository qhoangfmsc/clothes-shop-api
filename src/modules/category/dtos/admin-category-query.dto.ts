import { sortValues } from '@common/base/sort.util';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AdminCategoryQueryDto {
  @ApiPropertyOptional({ description: 'Search keyword (slug, title, description)' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort: priority, -priority, title, -title, createdAt, -createdAt (prefix "-" = descending, no prefix = ascending)',
    example: 'priority',
  })
  @IsString()
  @IsOptional()
  @IsIn(sortValues(['priority', 'title', 'createdAt']))
  sort?: string;

  @ApiPropertyOptional({ default: 1, description: 'Page number' })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25, description: 'Items per page' })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number = 25;
}
