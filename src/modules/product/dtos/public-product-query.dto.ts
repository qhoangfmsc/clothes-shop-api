import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PublicProductQueryDto {
  @ApiPropertyOptional({ description: 'Search product name, slug, or description' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by category slug' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by subcategory slug' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  subcategory?: string;

  @ApiPropertyOptional({ enum: ['new', 'sale', 'bestseller'] })
  @IsOptional()
  @IsString()
  @IsIn(['new', 'sale', 'bestseller'])
  badge?: string;

  @ApiPropertyOptional({ enum: ['price_asc', 'price_desc', 'newest', 'name_asc', 'name_desc'] })
  @IsOptional()
  @IsString()
  @IsIn(['price_asc', 'price_desc', 'newest', 'name_asc', 'name_desc'])
  sort?: string;

  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ type: Number, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Comma-separated sizes, e.g. S,M,L' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sizes?: string;

  @ApiPropertyOptional({ description: 'Comma-separated color names, e.g. Red,Blue' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  colors?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
