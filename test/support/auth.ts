import type { JwtPayload } from '../../src/modules/auth/auth.constant';
import type { User } from '../../src/modules/user/user.entity';
import type { TestApp } from './test-app';

export interface BearerOptions {
  secret?: string;
  // số âm (vd '-1h') = token đã hết hạn
  expiresIn?: string;
  type?: JwtPayload['type'];
}

/** Header `Authorization` cho user; `options` để cố ý tạo token hỏng. */
export function bearer(
  testApp: TestApp,
  user: Pick<User, 'id' | 'email' | 'role'>,
  options: BearerOptions = {},
): { Authorization: string } {
  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, type: options.type ?? 'access' };
  const token = testApp.jwt.sign(payload, {
    secret: options.secret ?? process.env.JWT_SECRET,
    expiresIn: (options.expiresIn ?? '1h') as never,
  });
  return { Authorization: `Bearer ${token}` };
}
