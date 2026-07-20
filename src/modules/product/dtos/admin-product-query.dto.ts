import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AdminProductQueryDto {
  @ApiPropertyOptional({ description: 'Search keyword (name, slug, sku, description)' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ enum: ['active', 'disabled'], description: 'Filter by status' })
  @IsString()
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by category slug' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by badge (new, sale, bestseller)' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  badge?: string;

  @ApiPropertyOptional({
    description: 'Sort: price, -price, createdAt, -createdAt, name, -name (prefix "-" = ascending, no prefix = descending)',
    example: '-price',
  })
  @IsString()
  @IsOptional()
  @IsIn(['price', '-price', 'createdAt', '-createdAt', 'name', '-name'])
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
