import { sortValues } from '@common/base/sort.util';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PublicOrderQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'confirmed', 'shipping', 'delivered', 'completed', 'cancelled'] })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'confirmed', 'shipping', 'delivered', 'completed', 'cancelled'])
  status?: string;

  @ApiPropertyOptional({
    enum: sortValues(['createdAt']),
    description: 'Sort: field = ASC, -field = DESC. Mặc định: -createdAt',
    example: '-createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(sortValues(['createdAt']))
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
