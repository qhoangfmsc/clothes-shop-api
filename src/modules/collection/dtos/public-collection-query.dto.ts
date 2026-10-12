import { sortValues } from '@common/base/sort.util';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PublicCollectionQueryDto {
  @ApiPropertyOptional({ description: 'Collection slug for single lookup' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @ApiPropertyOptional({ description: 'Search collection name or slug' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({
    enum: sortValues(['name', 'createdAt']),
    description: 'Sort: field = ASC, -field = DESC. Mặc định: -createdAt',
    example: '-createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(sortValues(['name', 'createdAt']))
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
