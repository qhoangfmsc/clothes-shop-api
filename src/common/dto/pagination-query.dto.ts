import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@common/base/pagination.util';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Base cho query của MỌI API list (public lẫn admin): `page`, `limit` (mặc định 25, tối đa 200) */
export class PaginationQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: DEFAULT_PAGE, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = DEFAULT_PAGE;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number = DEFAULT_PAGE_SIZE;
}
