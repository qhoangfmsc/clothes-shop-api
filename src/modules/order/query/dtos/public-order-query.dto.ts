import { ORDER_STATUSES, OrderStatus } from '@common/constants/enum-values.constant';
import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class PublicOrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ORDER_STATUSES, description: 'Filter by order status' })
  @IsOptional()
  @IsString()
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus;

  @SortField(['createdAt'], '-createdAt')
  sort?: string;
}
