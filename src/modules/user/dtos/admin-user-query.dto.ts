import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AdminUserQueryDto {
  @ApiPropertyOptional({ description: 'Search keyword (name, email)' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by role (user/admin)' })
  @IsString()
  @IsOptional()
  @IsIn(['user', 'admin'])
  role?: string;

  @ApiPropertyOptional({ description: 'Filter by status (active/disabled)' })
  @IsString()
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Sort: name, -name, email, -email, createdAt, -createdAt (prefix "-" = ascending, no prefix = descending)',
    example: '-createdAt',
  })
  @IsString()
  @IsOptional()
  @IsIn(['name', '-name', 'email', '-email', 'createdAt', '-createdAt'])
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
