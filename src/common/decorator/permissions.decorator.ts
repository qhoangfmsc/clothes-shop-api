import { Permission } from '@common/permissions/permissions.constant';
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Yêu cầu một hoặc nhiều permission để truy cập route.
 * Chỉ cần user có ÍT NHẤT 1 permission trong danh sách là được phép.
 *
 * Usage:
 *   @Permissions(Permission.CART_VIEW)
 *   @Permissions(Permission.ORDER_CREATE, Permission.ORDER_CANCEL)
 */
export const Permissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
