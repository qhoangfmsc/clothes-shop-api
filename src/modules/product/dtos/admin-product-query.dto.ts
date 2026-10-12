import { ACTIVE_STATUSES, PRODUCT_BADGES } from '@common/constants/enum-values.constant';
import { SearchField } from '@common/decorator/search-field.decorator';
import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminProductQueryDto extends PaginationQueryDto {
  @SearchField('Search keyword (name, slug, sku, description)')
  search?: string;

  @ApiPropertyOptional({ enum: ACTIVE_STATUSES, description: 'Filter by status' })
  @IsString()
  @IsOptional()
  @IsIn(ACTIVE_STATUSES)
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by category slug' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  category?: string;

  @ApiPropertyOptional({ enum: PRODUCT_BADGES, description: 'Filter by badge' })
  @IsString()
  @IsOptional()
  @IsIn(PRODUCT_BADGES)
  badge?: string;

  @SortField(['price', 'createdAt', 'name'], '-createdAt')
  sort?: string;
}
