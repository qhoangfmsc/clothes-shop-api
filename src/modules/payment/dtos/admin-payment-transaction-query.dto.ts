import { SearchField } from '@common/decorator/search-field.decorator';
import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { parseQueryBoolean } from '@common/dto/query-boolean.transform';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PAYMENT_VERIFICATION_STATUSES } from '../payment.constant';

export class AdminPaymentTransactionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by order ID (qua phiên thanh toán khớp)' })
  @IsString()
  @IsOptional()
  @MaxLength(16)
  orderId?: string;

  @ApiPropertyOptional({ enum: PAYMENT_VERIFICATION_STATUSES, description: 'Filter by verification status' })
  @IsString()
  @IsOptional()
  @IsIn(PAYMENT_VERIFICATION_STATUSES)
  verificationStatus?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'true = chỉ giao dịch cần admin xử lý: UNMATCHED/AMOUNT_MISMATCH/LATE/NOT_PAYABLE chưa gắn đơn, hoặc gắn vào đơn vẫn chưa thanh toán và chưa huỷ. Khớp con số `payments` của GET /api/admin/pending-counts. false/bỏ trống = không lọc',
  })
  @Transform(parseQueryBoolean)
  @IsBoolean()
  @IsOptional()
  needsReview?: boolean;

  @SearchField('Search keyword (transfer content, provider transaction ID, transfer code)')
  search?: string;

  @SortField(['receivedAt', 'amount'], '-receivedAt')
  sort?: string;
}
