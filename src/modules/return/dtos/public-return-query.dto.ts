import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { RETURN_STATUSES } from '../return.constant';

export class PublicReturnQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RETURN_STATUSES, description: 'Filter by return status' })
  @IsString()
  @IsOptional()
  @IsIn(RETURN_STATUSES)
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by order ID' })
  @IsString()
  @IsOptional()
  @MaxLength(16)
  orderId?: string;

  @SortField(['createdAt'], '-createdAt')
  sort?: string;
}
