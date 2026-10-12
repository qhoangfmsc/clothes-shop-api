import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DEFAULT_JWT_SECRET, JwtPayload } from './auth.constant';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

const SECRET = 'test-secret';
const user = { id: 'u1', email: 'a@b.com', name: 'A', image: '', role: 'user', permissions: [], status: 'active', createdAt: new Date() };

function setup(found: any = user) {
  const jwtService = new JwtService({ secret: SECRET });
  const configService = {
    get: jest.fn((key: string, fallback?: string) => (key === 'JWT_SECRET' ? SECRET : fallback)),
  } as unknown as ConfigService;
  const userRepo: any = { findOne: jest.fn(async () => found) };
  const service = new AuthService(userRepo, jwtService, {} as any, configService);
  const strategy = new JwtStrategy(configService, userRepo);
  return { service, strategy, jwtService, userRepo };
}

async function login(service: AuthService, jwtService: JwtService) {
  const googleAuth: any = { verifyIdToken: jest.fn(async () => ({ email: user.email, name: 'A', picture: '', sub: 'g1' })) };
  const s: any = service;
  s.googleAuthService = googleAuth;
  s.userRepo.save = jest.fn(async (u: any) => u);
  const idToken = 'a.b.c';
  const { accessToken, refreshToken } = await service.googleLogin(idToken);
  return {
    accessToken,
    refreshToken,
    access: jwtService.decode(accessToken) as JwtPayload,
    refresh: jwtService.decode(refreshToken) as JwtPayload,
  };
}

describe('AuthService tokens', () => {
  it('signs access and refresh tokens with different `type` claims', async () => {
    const { service, jwtService } = setup();
    const { access, refresh } = await login(service, jwtService);
    expect(access.type).toBe('access');
    expect(refresh.type).toBe('refresh');
  });

  it('issues a new access token from a refresh token', async () => {
    const { service, jwtService } = setup();
    const { refreshToken } = await login(service, jwtService);
    const result = await service.refreshToken(refreshToken);
    expect((jwtService.decode(result.accessToken) as JwtPayload).type).toBe('access');
  });

  it('rejects an access token used as a refresh token', async () => {
    const { service, jwtService } = setup();
    const { accessToken } = await login(service, jwtService);
    await expect(service.refreshToken(accessToken)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a legacy token without a `type` claim', async () => {
    const { service, jwtService } = setup();
    const legacy = jwtService.sign({ sub: user.id, email: user.email, role: user.role });
    await expect(service.refreshToken(legacy)).rejects.toMatchObject({ status: 401 });
  });

  it('rejects refresh for a disabled user', async () => {
    const { service, jwtService, userRepo } = setup();
    const { refreshToken } = await login(service, jwtService);
    userRepo.findOne.mockResolvedValue({ ...user, status: 'disabled' });
    await expect(service.refreshToken(refreshToken)).rejects.toMatchObject({ status: 401 });
  });
});

describe('JwtStrategy.validate', () => {
  it('accepts an access token payload', async () => {
    const { strategy } = setup();
    await expect(strategy.validate({ sub: 'u1', email: 'a@b.com', role: 'user', type: 'access' })).resolves.toMatchObject({ id: 'u1' });
  });

  it('rejects a refresh token payload and a payload without `type`', async () => {
    const { strategy } = setup();
    await expect(strategy.validate({ sub: 'u1', email: 'a@b.com', role: 'user', type: 'refresh' })).rejects.toMatchObject({ status: 401 });
    await expect(strategy.validate({ sub: 'u1', email: 'a@b.com', role: 'user' } as any)).rejects.toMatchObject({ status: 401 });
  });

  it('exposes the dev default secret in one place', () => {
    expect(DEFAULT_JWT_SECRET).toBe('dev-secret-change-me');
  });
});
