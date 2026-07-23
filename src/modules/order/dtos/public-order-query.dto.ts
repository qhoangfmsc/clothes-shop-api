import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PublicOrderQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'confirmed', 'shipping', 'delivered', 'completed', 'cancelled'] })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'confirmed', 'shipping', 'delivered', 'completed', 'cancelled'])
  status?: string;

  @ApiPropertyOptional({ enum: ['newest', 'oldest'] })
  @IsOptional()
  @IsString()
  @IsIn(['newest', 'oldest'])
  sort?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
