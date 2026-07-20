import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../user/user.entity';
import { AdminUserQueryDto } from './dtos/admin-user-query.dto';
import { UpdateUserDto } from './dtos/user.dto';
import { UserService } from './user.service';

@ApiTags('Admin — Users')
@Controller('api/admin/users')
@ApiBearerAuth()
export class AdminUserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Danh sách người dùng (search, filter, sort, pagination)' })
  @Permissions(Permission.USER_ADMIN_VIEW)
  findAll(@Query() query: AdminUserQueryDto) {
    return this.userService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] Chi tiết người dùng' })
  @Permissions(Permission.USER_ADMIN_VIEW)
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '[Admin] Cập nhật người dùng (role, status, permissions). Không thể tự sửa role/status của chính mình.' })
  @Permissions(Permission.USER_ADMIN_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() currentUser: User) {
    return this.userService.update(id, dto, currentUser.id);
  }
}
