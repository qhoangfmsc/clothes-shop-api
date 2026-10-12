import { SearchField } from '@common/decorator/search-field.decorator';
import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';

export class MediaQueryDto extends PaginationQueryDto {
  @SearchField('Search keyword (file name)')
  search?: string;

  @SortField(['createdAt', 'name', 'size'], '-createdAt')
  sort?: string;
}
