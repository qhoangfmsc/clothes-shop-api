import { SearchField } from '@common/decorator/search-field.decorator';
import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PAYMENT_ATTEMPT_STATUSES } from '../payment.constant';

export class AdminPaymentAttemptQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by order ID' })
  @IsString()
  @IsOptional()
  @MaxLength(16)
  orderId?: string;

  @ApiPropertyOptional({ enum: PAYMENT_ATTEMPT_STATUSES, description: 'Filter by effective status (overdue PENDING counts as EXPIRED)' })
  @IsString()
  @IsOptional()
  @IsIn(PAYMENT_ATTEMPT_STATUSES)
  status?: string;

  @SearchField('Search keyword (transfer content e.g. DHG29JR5A8, order ID, customer phone or name)')
  search?: string;

  @SortField(['createdAt', 'expiresAt', 'amount'], '-createdAt')
  sort?: string;
}
