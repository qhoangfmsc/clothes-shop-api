import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ORDER_STATUSES } from './admin-order.dto';

export class PublicOrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ORDER_STATUSES, description: 'Filter by order status' })
  @IsOptional()
  @IsString()
  @IsIn(ORDER_STATUSES)
  status?: string;

  @SortField(['createdAt'], '-createdAt')
  sort?: string;
}
