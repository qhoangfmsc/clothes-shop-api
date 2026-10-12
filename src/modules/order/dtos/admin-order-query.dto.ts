import { SearchField } from '@common/decorator/search-field.decorator';
import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ORDER_STATUSES } from './admin-order.dto';

export class AdminOrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsString()
  @IsOptional()
  @MaxLength(16)
  userId?: string;

  @SearchField('Search keyword (order ID, phone, fullName)')
  search?: string;

  @ApiPropertyOptional({ enum: ORDER_STATUSES, description: 'Filter by order status' })
  @IsString()
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: string;

  @SortField(['createdAt', 'total'], '-createdAt')
  sort?: string;
}
