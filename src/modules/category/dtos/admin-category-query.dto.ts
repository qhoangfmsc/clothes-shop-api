import { SearchField } from '@common/decorator/search-field.decorator';
import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';

export class AdminCategoryQueryDto extends PaginationQueryDto {
  @SearchField('Search keyword (slug, title, description)')
  search?: string;

  @SortField(['priority', 'title', 'createdAt'], 'priority')
  sort?: string;
}
