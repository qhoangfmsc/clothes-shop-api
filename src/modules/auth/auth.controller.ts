import { CurrentUser } from '@common/decorator/current-user.decorator';
import { Permissions } from '@common/decorator/permissions.decorator';
import { Public } from '@common/decorator/public.decorator';
import { Permission } from '@common/permissions/permissions.constant';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '../user/user.entity';
import { AuthService } from './auth.service';
import { GoogleLoginDto, RefreshTokenDto } from './dtos/auth.dto';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('google')
  @ApiOperation({ summary: 'Login with Google ID token' })
  async googleLogin(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto.idToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  @Permissions(Permission.AUTH_ME)
  async getMe(@CurrentUser() user: User) {
    return this.authService.getMe(user.id);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Get('permissions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get list of all permission codes and names' })
  @Permissions(Permission.USER_ADMIN_VIEW)
  async getPermissions() {
    const permissions = Object.entries(Permission)
      .filter(([key]) => Number.isNaN(Number(key)))
      .map(([name, code]) => ({ code, name }));

    return { data: permissions };
  }
}
