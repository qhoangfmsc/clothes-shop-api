import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ enum: ['user', 'admin'], example: 'admin' })
  @IsString()
  @IsOptional()
  @IsIn(['user', 'admin'])
  @MaxLength(20)
  role?: string;

  @ApiPropertyOptional({ enum: ['active', 'disabled'], example: 'active' })
  @IsString()
  @IsOptional()
  @IsIn(['active', 'disabled'])
  @MaxLength(20)
  status?: string;

  @ApiPropertyOptional({
    example: [1000, 1001, 2000],
    description: 'Mảng permission codes. Admin tự động có tất cả.',
  })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  permissions?: number[];
}
