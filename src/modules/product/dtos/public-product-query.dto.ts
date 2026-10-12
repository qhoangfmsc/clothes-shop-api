import { PRODUCT_BADGES } from '@common/constants/enum-values.constant';
import { SearchField } from '@common/decorator/search-field.decorator';
import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class PublicProductQueryDto extends PaginationQueryDto {
  @SearchField('Search product name, slug, or description')
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

  @ApiPropertyOptional({ enum: PRODUCT_BADGES, description: 'Filter by badge' })
  @IsOptional()
  @IsString()
  @IsIn(PRODUCT_BADGES)
  badge?: string;

  @SortField(['price', 'name', 'createdAt'], '-createdAt')
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
}
