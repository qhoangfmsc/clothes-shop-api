import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';

export class PublicReviewQueryDto extends PaginationQueryDto {
  @SortField(['rating', 'createdAt'], '-createdAt')
  sort?: string;
}
