import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AdminCollectionQueryDto {
  @ApiPropertyOptional({ description: 'Search keyword (slug, name)' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by season' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  season?: string;

  @ApiPropertyOptional({
    description: 'Sort: name, -name, createdAt, -createdAt (prefix "-" = ascending, no prefix = descending)',
    example: 'name',
  })
  @IsString()
  @IsOptional()
  @IsIn(['name', '-name', 'createdAt', '-createdAt'])
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
