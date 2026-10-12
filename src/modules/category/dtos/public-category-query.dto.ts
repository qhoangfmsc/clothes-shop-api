import { SearchField } from '@common/decorator/search-field.decorator';
import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PublicCategoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Category slug for single lookup' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @SearchField('Search category title, slug or description')
  search?: string;

  @SortField(['priority', 'title', 'createdAt'], 'priority')
  sort?: string;
}
