import { ACTIVE_STATUSES, ActiveStatus, USER_ROLES } from '@common/constants/enum-values.constant';
import { PERMISSION_CODES } from '@common/permissions/permissions.constant';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ enum: USER_ROLES, example: 'admin' })
  @IsString()
  @IsOptional()
  @IsIn(USER_ROLES)
  @MaxLength(20)
  role?: string;

  @ApiPropertyOptional({ enum: ACTIVE_STATUSES, example: 'active' })
  @IsString()
  @IsOptional()
  @IsIn(ACTIVE_STATUSES)
  @MaxLength(20)
  status?: ActiveStatus;

  @ApiPropertyOptional({
    example: [1000, 1001, 2000],
    description: 'Mảng permission codes. Admin tự động có tất cả.',
  })
  @IsArray()
  @IsInt({ each: true })
  @IsIn(PERMISSION_CODES, { each: true })
  @ArrayUnique()
  @IsOptional()
  permissions?: number[];
}
