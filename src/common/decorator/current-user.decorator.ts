import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extract current user from request (attached by JwtStrategy).
 *
 * Usage: @CurrentUser() user: User
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
