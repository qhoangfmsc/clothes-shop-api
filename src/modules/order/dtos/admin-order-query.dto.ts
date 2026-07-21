import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ORDER_STATUSES } from './admin-order.dto';

export class AdminOrderQueryDto {
  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsString()
  @IsOptional()
  @MaxLength(16)
  userId?: string;

  @ApiPropertyOptional({ description: 'Search keyword (order ID, phone, fullName)' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ enum: ORDER_STATUSES, description: 'Filter by order status' })
  @IsString()
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: string;

  @ApiPropertyOptional({
    description: 'Sort: createdAt, -createdAt, total, -total (prefix "-" = ascending, no prefix = descending)',
    example: '-createdAt',
  })
  @IsString()
  @IsOptional()
  @IsIn(['createdAt', '-createdAt', 'total', '-total'])
  sort?: string;

  @ApiPropertyOptional({ default: 1, description: 'Page number' })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25, description: 'Items per page' })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  limit?: number = 25;
}
