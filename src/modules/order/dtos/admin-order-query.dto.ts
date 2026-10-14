import { ORDER_PAYMENT_STATUSES } from '@common/constants/enum-values.constant';
import { SearchField } from '@common/decorator/search-field.decorator';
import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { parseQueryBoolean } from '@common/dto/query-boolean.transform';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
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

  @ApiPropertyOptional({ enum: ORDER_PAYMENT_STATUSES, description: 'Filter by payment status' })
  @IsString()
  @IsOptional()
  @IsIn(ORDER_PAYMENT_STATUSES)
  paymentStatus?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'true = chỉ đơn cần admin thao tác: status `pending` hoặc `confirmed`, trừ đơn `pending` chưa thanh toán đang có mã QR còn hạn. Khớp con số `orders` của GET /api/admin/pending-counts. false/bỏ trống = không lọc',
  })
  @Transform(parseQueryBoolean)
  @IsBoolean()
  @IsOptional()
  needsAction?: boolean;

  @SortField(['createdAt', 'total'], '-createdAt')
  sort?: string;
}
