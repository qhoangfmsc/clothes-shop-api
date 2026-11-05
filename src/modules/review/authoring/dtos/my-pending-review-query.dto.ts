import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';

export class MyPendingReviewQueryDto extends PaginationQueryDto {
  @SortField(['deliveredAt'], '-deliveredAt')
  sort?: string;
}
