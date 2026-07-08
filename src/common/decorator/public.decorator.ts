import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route as public — no JWT required.
 * By default all routes require auth (global JwtAuthGuard).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
