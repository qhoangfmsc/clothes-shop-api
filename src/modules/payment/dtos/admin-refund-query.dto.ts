import { SearchField } from '@common/decorator/search-field.decorator';
import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { REFUND_STATUSES } from '../payment.constant';

export class AdminRefundQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by order ID' })
  @IsString()
  @IsOptional()
  @MaxLength(16)
  orderId?: string;

  @ApiPropertyOptional({
    enum: REFUND_STATUSES,
    description: 'Filter by refund status (REQUESTED = waiting for the shop to transfer the money back)',
  })
  @IsString()
  @IsOptional()
  @IsIn(REFUND_STATUSES)
  status?: string;

  @SearchField('Search keyword (order ID, bank reference of the refund, transfer content e.g. DHG29JR5A8, customer phone or name)')
  search?: string;

  @SortField(['createdAt', 'processedAt', 'amount'], '-createdAt')
  sort?: string;
}
