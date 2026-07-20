import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AdminCategoryQueryDto {
  @ApiPropertyOptional({ description: 'Search keyword (slug, title, description)' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort: title, -title, createdAt, -createdAt (prefix "-" = ascending, no prefix = descending)',
    example: 'title',
  })
  @IsString()
  @IsOptional()
  @IsIn(['title', '-title', 'createdAt', '-createdAt'])
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
  @Type(() => Number)
  limit?: number = 25;
}
