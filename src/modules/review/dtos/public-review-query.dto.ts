import { sortValues } from '@common/base/sort.util';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PublicReviewQueryDto {
  @ApiPropertyOptional({
    enum: sortValues(['rating', 'createdAt']),
    description: 'Sort: field = ASC, -field = DESC. Mặc định: -createdAt',
    example: '-rating',
  })
  @IsOptional()
  @IsString()
  @IsIn(sortValues(['rating', 'createdAt']))
  sort?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 200, default: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
