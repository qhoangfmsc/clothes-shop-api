import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { User } from '../user/user.entity';
import { UpdateUserDto } from './dtos/user.dto';
import { UserService } from './user.service';

@ApiTags('Admin — Users')
@Controller('api/admin/users')
@ApiBearerAuth()
export class AdminUserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Danh sách người dùng' })
  @ApiQuery({ name: 'role', required: false, description: 'Lọc theo role (user/admin)' })
  @ApiQuery({ name: 'status', required: false, description: 'Lọc theo trạng thái (active/disabled)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Permissions(Permission.USER_ADMIN_VIEW)
  findAll(@Query('role') role?: string, @Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.userService.findAll({
      role,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
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
