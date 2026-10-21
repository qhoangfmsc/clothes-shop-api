import type { JwtPayload } from '../../src/modules/auth/auth.constant';
import type { User } from '../../src/modules/user/user.entity';
import type { TestApp } from './test-app';

/** Header `Authorization` cho user đã có trong DB: ký access token đúng payload như `AuthService` */
export function bearer(testApp: TestApp, user: User): { Authorization: string } {
  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, type: 'access' };
  const token = testApp.jwt.sign(payload, { secret: process.env.JWT_SECRET, expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}
