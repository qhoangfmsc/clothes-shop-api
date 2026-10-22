import type { ActiveStatus } from '@common/constants/enum-values.constant';
import { EPermissionErrorCode } from '@common/exceptions/error-codes';
import { DEFAULT_USER_PERMISSIONS, Permission } from '@common/permissions/permissions.constant';
import { type Builders, bearer, createBuilders, createTestApp, type TestApp } from '../../support';
import { concretePath, discoverRoutes, type RouteInfo, routeKey } from '../../support/routes';

/** Ma trận auth/quyền cho mọi route. Chỉ kiểm guard: route "được vào" chấp nhận mọi status guard không chặn (input rỗng). */
const PROBE_HEADER = { 'x-test-probe': 'access-matrix' };
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const ALL_PERMISSIONS = Object.values(Permission).filter((value): value is number => typeof value === 'number');
const TIMEOUT_MS = 180_000;

type Res = { status: number; body: { errorCode?: number }; text?: string };

// 401 của guard không có errorCode; 401 nghiệp vụ luôn có
const isAuthRejected = (res: Res) => res.status === 401 && res.body?.errorCode === undefined;
const isPermissionDenied = (res: Res) => res.status === 403 && res.body?.errorCode === EPermissionErrorCode.PERMISSION_DENIED;
const isMisconfigured = (res: Res) => res.body?.errorCode === EPermissionErrorCode.NO_PERMISSION_DEFINED;
const passedGuards = (res: Res) => !isAuthRejected(res) && !isPermissionDenied(res) && !isMisconfigured(res);

interface Case {
  label: string;
  headers: Record<string, string>;
  ok: (res: Res) => boolean;
  expected: string;
}

describe('Access matrix: authentication and permissions on every route', () => {
  let t: TestApp;
  let b: Builders;
  let routes: RouteInfo[];
  const users = new Map<string, Awaited<ReturnType<Builders['user']>>>();

  const userWith = async (permissions: number[], status: ActiveStatus = 'active') => {
    const key = `${status}:${[...permissions].sort((x, y) => x - y).join(',')}`;
    if (!users.has(key)) users.set(key, await b.user({ permissions, status }));
    return users.get(key)!;
  };

  const probe = async (route: RouteInfo, headers: Record<string, string>): Promise<Res> => {
    const call = (t.api as unknown as Record<string, (url: string) => never>)[route.method.toLowerCase()](concretePath(route.path)) as {
      set: (h: Record<string, string>) => {
        send: (body: object) => { timeout: (ms: number) => Promise<Res> };
        timeout: (ms: number) => Promise<Res>;
      };
    };
    const withHeaders = call.set({ ...PROBE_HEADER, ...headers });
    try {
      return await (BODY_METHODS.has(route.method) ? withHeaders.send({}) : withHeaders).timeout(10_000);
    } catch (error) {
      return { status: 0, body: {}, text: `no response: ${(error as Error).message}` };
    }
  };

  async function sweep(list: RouteInfo[], buildCases: (route: RouteInfo) => Promise<Case[]> | Case[]): Promise<string[]> {
    const failures: string[] = [];
    for (const route of list) {
      for (const testCase of await buildCases(route)) {
        const res = await probe(route, testCase.headers);
        if (!testCase.ok(res)) {
          failures.push(
            `${routeKey(route)} (${route.handler}) — ${testCase.label}: expected ${testCase.expected}, got ${res.status} (errorCode ${res.body?.errorCode ?? 'none'}) ${String(res.text ?? '').slice(0, 160)}`,
          );
        }
      }
    }
    return failures;
  }

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
    routes = discoverRoutes(t.app);
  });
  afterAll(() => t.close());

  const publicRoutes = () => routes.filter((route) => route.isPublic);
  const protectedRoutes = () => routes.filter((route) => !route.isPublic);

  it('discovers both public and protected routes (guards against an empty sweep)', () => {
    expect(publicRoutes().length).toBeGreaterThan(0);
    expect(protectedRoutes().length).toBeGreaterThan(0);
  });

  it(
    'lets public routes through with no token and with a garbage token',
    async () => {
      const failures = await sweep(publicRoutes(), (): Case[] => [
        { label: 'no token', headers: {}, ok: passedGuards, expected: 'not stopped by a guard' },
        { label: 'garbage token', headers: { Authorization: 'Bearer not-a-jwt' }, ok: passedGuards, expected: 'not stopped by a guard' },
      ]);
      expect(failures).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    'answers 401 on every protected route when there are no credentials',
    async () => {
      const failures = await sweep(protectedRoutes(), (): Case[] => [
        { label: 'no Authorization header', headers: {}, ok: isAuthRejected, expected: '401' },
        { label: 'empty bearer', headers: { Authorization: 'Bearer ' }, ok: isAuthRejected, expected: '401' },
        { label: 'wrong scheme', headers: { Authorization: 'Basic dXNlcjpwYXNz' }, ok: isAuthRejected, expected: '401' },
      ]);
      expect(failures).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    'answers 401 on every protected route for broken tokens, even when the user holds every permission',
    async () => {
      const fullUser = await userWith(ALL_PERMISSIONS);
      const disabledUser = await userWith(ALL_PERMISSIONS, 'disabled');
      const ghost = { ...fullUser, id: 'zzzzzzzzzzzzzzzz' }; // chữ ký đúng nhưng user không có trong DB
      const broken: [string, Record<string, string>][] = [
        ['malformed token', { Authorization: 'Bearer abc.def.ghi' }],
        ['signed with the wrong secret', bearer(t, fullUser, { secret: 'not-the-secret' })],
        ['expired token', bearer(t, fullUser, { expiresIn: '-1h' })],
        ['refresh token used as access token', bearer(t, fullUser, { type: 'refresh' })],
        ['valid token of a user that does not exist', bearer(t, ghost)],
        ['valid token of a disabled user', bearer(t, disabledUser)],
      ];

      const failures = await sweep(protectedRoutes(), () =>
        broken.map(([label, headers]) => ({ label, headers, ok: isAuthRejected, expected: '401' })),
      );
      expect(failures).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    'answers 403 / 9001 when the user lacks the permission the route needs',
    async () => {
      const noPermissions = await userWith([]);
      const failures = await sweep(protectedRoutes(), async (route) => {
        // có mọi quyền trừ quyền route cần: bắt lỗi gắn nhầm sang quyền khác
        const everythingElse = await userWith(ALL_PERMISSIONS.filter((code) => !route.permissions.includes(code)));
        return [
          { label: 'no permissions', headers: bearer(t, noPermissions), ok: isPermissionDenied, expected: '403 / 9001' },
          {
            label: 'every permission except the required one(s)',
            headers: bearer(t, everythingElse),
            ok: isPermissionDenied,
            expected: '403 / 9001',
          },
        ];
      });
      expect(failures).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    'lets a user through when they hold any one of the permissions the route accepts',
    async () => {
      const failures = await sweep(protectedRoutes(), async (route) =>
        Promise.all(
          route.permissions.map(async (code) => ({
            label: `only permission ${code}`,
            headers: bearer(t, await userWith([code])),
            ok: passedGuards,
            expected: 'not stopped by a guard',
          })),
        ),
      );
      expect(failures).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    'lets an admin through every protected route without holding any permission',
    async () => {
      const admin = await b.admin();
      const failures = await sweep(protectedRoutes(), (): Case[] => [
        { label: 'admin role, empty permissions', headers: bearer(t, admin), ok: passedGuards, expected: 'not stopped by a guard' },
      ]);
      expect(failures).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    'keeps every /api/admin route out of reach of a default (newly registered) user',
    async () => {
      const defaultUser = await userWith(DEFAULT_USER_PERMISSIONS);
      const adminRoutes = protectedRoutes().filter((route) => route.path.startsWith('/api/admin'));
      expect(adminRoutes.length).toBeGreaterThan(0);

      const failures = await sweep(adminRoutes, (): Case[] => [
        { label: 'default user permissions', headers: bearer(t, defaultUser), ok: isPermissionDenied, expected: '403 / 9001' },
      ]);
      expect(failures).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
