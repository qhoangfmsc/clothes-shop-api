import { ACTIVE_STATUSES, USER_ROLES } from '@common/constants/enum-values.constant';
import { SearchField } from '@common/decorator/search-field.decorator';
import { SortField } from '@common/decorator/sort-field.decorator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class AdminUserQueryDto extends PaginationQueryDto {
  @SearchField('Search keyword (name, email)')
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by role (user/admin)' })
  @IsString()
  @IsOptional()
  @IsIn(USER_ROLES)
  role?: string;

  @ApiPropertyOptional({ description: 'Filter by status (active/disabled)' })
  @IsString()
  @IsOptional()
  @IsIn(ACTIVE_STATUSES)
  status?: string;

  @SortField(['name', 'email', 'createdAt'], '-createdAt')
  sort?: string;
}
