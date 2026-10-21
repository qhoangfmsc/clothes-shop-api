import { DEFAULT_USER_PERMISSIONS, Permission } from '@common/permissions/permissions.constant';
import { ConfigService } from '@nestjs/config';
import { bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { discoverRoutes, formatRouteTable, type RouteInfo, routeKey } from '../../support/routes';

/** Snapshot bảng route–quyền và các bất biến tĩnh. Cập nhật snapshot sau khi xem diff: thêm `-u` khi chạy riêng file này. */
describe('Route table: discovery, snapshot and invariants', () => {
  let t: TestApp;
  let routes: RouteInfo[];

  beforeAll(async () => {
    t = await createTestApp();
    routes = discoverRoutes(t.app);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  const labels = (list: RouteInfo[]) => list.map((route) => `${routeKey(route)} (${route.handler})`);

  it('matches the committed route–permission snapshot (a permission change must show up as a diff)', () => {
    expect(formatRouteTable(routes)).toMatchSnapshot();
  });

  it('discovers routes and never registers the same method + path twice', () => {
    expect(routes.length).toBeGreaterThan(0);
    const keys = routes.map(routeKey);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });

  it('requires at least one @Permissions on every route that is not public', () => {
    expect(labels(routes.filter((route) => !route.isPublic && route.permissions.length === 0))).toEqual([]);
  });

  it('declares no @Permissions on a public route (it would be dead metadata)', () => {
    expect(labels(routes.filter((route) => route.isPublic && route.permissions.length > 0))).toEqual([]);
  });

  it('keeps every /api/admin route protected by a permission no default user has', () => {
    const admin = routes.filter((route) => route.path.startsWith('/api/admin'));
    expect(admin.length).toBeGreaterThan(0);
    expect(labels(admin.filter((route) => route.isPublic))).toEqual([]);
    expect(labels(admin.filter((route) => route.permissions.some((code) => DEFAULT_USER_PERMISSIONS.includes(code))))).toEqual([]);
  });

  it('only uses permission codes that exist in the Permission enum', () => {
    const known = new Set(Object.values(Permission).filter((value) => typeof value === 'number'));
    expect(labels(routes.filter((route) => route.permissions.some((code) => !known.has(code))))).toEqual([]);
  });

  describe('hermetic environment', () => {
    it('blanks the external-service settings even if the dev .env defines them', () => {
      const config = t.app.get(ConfigService);
      for (const key of [
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_STORAGE_BUCKET',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
      ]) {
        expect([key, config.get<string>(key)]).toEqual([key, '']);
      }
    });

    it('blocks outbound network calls', async () => {
      await expect(fetch('https://example.com')).rejects.toThrow('Outbound network is disabled');
    });

    it('answers an unconfigured storage with 503 / 1601 instead of calling the network', async () => {
      const admin = await createBuilders(t.dataSource).admin();
      const res = await t.api.get('/api/admin/media/ping').set(bearer(t, admin)).expect(503);
      expect(res.body.errorCode).toBe(1601);
    });
  });
});
