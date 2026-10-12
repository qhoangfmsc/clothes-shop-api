import { SearchField } from '@common/decorator/search-field.decorator';
import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminCollectionQueryDto extends PaginationQueryDto {
  @SearchField('Search keyword (slug, name)')
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by season' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  season?: string;

  @SortField(['name', 'createdAt'], '-createdAt')
  sort?: string;
}
