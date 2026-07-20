import { PERMISSIONS_KEY } from '@common/decorator/permissions.decorator';
import { IS_PUBLIC_KEY } from '@common/decorator/public.decorator';
import { throwAppError } from '@common/exceptions/app.exception';
import { EPermissionErrorCode } from '@common/exceptions/error-codes';
import { Permission } from '@common/permissions/permissions.constant';
import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '@/user/user.entity';

/**
 * Permissions Guard — chạy sau JwtAuthGuard.
 *
 * Logic:
 * - Route có @Public() → bỏ qua (return true)
 * - Route có @Permissions(...) → kiểm tra user có ít nhất 1 permission yêu cầu
 * - Route không có @Permissions() và không @Public() → từ chối (force explicit)
 * - Admin (role='admin') → luôn luôn cho phép
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Bỏ qua nếu route là public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: User = request.user;

    // Admin có toàn quyền
    if (user?.role === 'admin') {
      return true;
    }

    // Lấy danh sách permission yêu cầu từ metadata
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    // Nếu route không khai báo @Permissions() → từ chối (bắt buộc khai báo)
    if (!requiredPermissions || requiredPermissions.length === 0) {
      throwAppError(
        EPermissionErrorCode.NO_PERMISSION_DEFINED,
        'Route này chưa được gán permission — vui lòng thêm @Permissions(...) decorator',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Kiểm tra user có ít nhất 1 permission yêu cầu không
    const userPermissions: number[] = user?.permissions ?? [];
    const hasPermission = requiredPermissions.some((p) => userPermissions.includes(p));

    if (!hasPermission) {
      throwAppError(EPermissionErrorCode.PERMISSION_DENIED, 'Bạn không có quyền truy cập tài nguyên này', HttpStatus.FORBIDDEN);
    }

    return true;
  }
}
