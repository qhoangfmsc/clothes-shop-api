import { DEFAULT_USER_PERMISSIONS, Permission } from '@common/permissions/permissions.constant';
import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';

/** Batch 20–21 (user): danh sách, chi tiết và sửa người dùng phía admin. */
describe('Flow: users (admin)', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(() => truncateAll(t.dataSource));
  afterAll(() => t.close());

  type User = Awaited<ReturnType<Builders['user']>>;
  const rows = <R>(sql: string, params: unknown[] = []) => t.dataSource.query(sql, params) as Promise<R[]>;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const list = (admin: User, query: object = {}) => t.api.get('/api/admin/users').query(query).set(bearer(t, admin));
  const detail = (admin: User, id: string) => t.api.get(`/api/admin/users/${id}`).set(bearer(t, admin));
  const patch = (admin: User, id: string, body: object) => t.api.patch(`/api/admin/users/${id}`).set(bearer(t, admin)).send(body);
  const ids = (res: { body: { data: { id: string }[] } }) => res.body.data.map((row) => row.id);
  const userRow = (id: string) =>
    rows<{ role: string; status: string; permissions: number[]; email: string }>(
      'SELECT role, status, permissions, email FROM users WHERE id = $1',
      [id],
    ).then((r) => r[0]);
  const day = (offset: number) => new Date(Date.UTC(2026, 9, 1 + offset, 12));

  describe('GET /api/admin/users', () => {
    it('lists users without internal columns, newest first', async () => {
      const admin = await b.admin({ createdAt: day(0) });
      const [older, newer] = [await b.user({ createdAt: day(1), image: 'a.jpg' }), await b.user({ createdAt: day(2) })];

      const res = await list(admin).expect(200);

      expect(ids(res)).toEqual([newer.id, older.id, admin.id]);
      expect(res.body).toMatchObject({ total: 3, page: 1, limit: 25, totalPages: 1 });
      expect(res.body.data[1]).toEqual({
        id: older.id,
        email: older.email,
        name: older.name,
        image: 'a.jpg',
        provider: 'google',
        role: 'user',
        permissions: DEFAULT_USER_PERMISSIONS,
        status: 'active',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(res.body.data[1]).not.toHaveProperty('password');
      expect(res.body.data[1]).not.toHaveProperty('providerId');
    });

    it('filters by role and status, searches name and email, and combines them', async () => {
      const admin = await b.admin({ name: 'Quản trị', email: 'boss@flow.test' });
      const [a, c, d] = [
        await b.user({ name: 'Lan Anh', email: 'lan@flow.test', createdAt: day(1) }),
        await b.user({ name: 'Minh', email: 'minh.lan@flow.test', status: 'disabled', createdAt: day(2) }),
        await b.user({ name: 'Hùng', email: 'hung@flow.test', createdAt: day(3) }),
      ];

      expect(ids(await list(admin, { role: 'admin' }).expect(200))).toEqual([admin.id]);
      expect(ids(await list(admin, { status: 'disabled' }).expect(200))).toEqual([c.id]);
      expect(ids(await list(admin, { search: 'LAN' }).expect(200))).toEqual([c.id, a.id]);
      expect(ids(await list(admin, { search: 'hùng' }).expect(200))).toEqual([d.id]);
      expect(ids(await list(admin, { search: 'lan', status: 'active' }).expect(200))).toEqual([a.id]);
      expect(ids(await list(admin, { search: 'lan', role: 'admin' }).expect(200))).toEqual([]);
    });

    it('sorts by name, email and creation time, and paginates', async () => {
      const admin = await b.admin({ name: 'Zed', email: 'z@flow.test', createdAt: day(0) });
      const [a, c] = [
        await b.user({ name: 'Bao', email: 'b@flow.test', createdAt: day(1) }),
        await b.user({ name: 'Anh', email: 'c@flow.test', createdAt: day(2) }),
      ];

      expect(ids(await list(admin, { sort: 'name' }).expect(200))).toEqual([c.id, a.id, admin.id]);
      expect(ids(await list(admin, { sort: '-email' }).expect(200))).toEqual([admin.id, c.id, a.id]);
      expect(ids(await list(admin, { sort: 'createdAt' }).expect(200))).toEqual([admin.id, a.id, c.id]);
      const page = await list(admin, { limit: 2, page: 2 }).expect(200);
      expect(ids(page)).toEqual([admin.id]);
      expect(page.body).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });
    });

    it.each([
      ['an unknown role', { role: 'superadmin' }],
      ['an unknown status', { status: 'banned' }],
      ['a sort field outside the whitelist', { sort: 'role' }],
      ['the removed `sorts` parameter', { sorts: 'name' }],
      ['a limit above 200', { limit: 201 }],
      ['a page below 1', { page: 0 }],
      ['a search longer than 255 characters', { search: 'x'.repeat(256) }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const res = await list(await b.admin(), query);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('GET /api/admin/users/:id', () => {
    it('shows one user in the admin view, and 404 / 1401 for an unknown id', async () => {
      const [admin, user] = [await b.admin(), await b.user({ status: 'disabled' })];

      const res = await detail(admin, user.id).expect(200);
      const unknown = await detail(admin, 'zzzzzzzzzzzzzzzz');

      expect(res.body.data).toEqual({
        id: user.id,
        email: user.email,
        name: user.name,
        image: null,
        provider: 'google',
        role: 'user',
        permissions: DEFAULT_USER_PERMISSIONS,
        status: 'disabled',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(error(unknown)).toMatchObject({ status: 404, errorCode: 1401 });
    });
  });

  describe('PATCH /api/admin/users/:id', () => {
    it('promotes a customer to admin, who can use admin routes at once', async () => {
      const [admin, user] = [await b.admin(), await b.user()];
      expect((await t.api.get('/api/admin/users').set(bearer(t, user))).status).toBe(403);

      const res = await patch(admin, user.id, { role: 'admin' }).expect(200);

      expect(res.body.data).toMatchObject({ id: user.id, role: 'admin', status: 'active' });
      await list(user).expect(200);
    });

    it('disables a user, whose tokens stop working at once (401) and who cannot refresh', async () => {
      const [admin, user] = [await b.admin(), await b.user()];
      await t.api.get('/api/auth/me').set(bearer(t, user)).expect(200);
      const refreshToken = bearer(t, user, { type: 'refresh' }).Authorization.replace('Bearer ', '');

      const res = await patch(admin, user.id, { status: 'disabled' }).expect(200);
      const blocked = await t.api.get('/api/auth/me').set(bearer(t, user));
      const refreshed = await t.api.post('/api/auth/refresh').send({ refreshToken });

      expect(res.body.data.status).toBe('disabled');
      expect([blocked.status, blocked.body.errorCode]).toEqual([401, undefined]);
      expect(error(refreshed)).toMatchObject({ status: 401, errorCode: 2202 });
      await patch(admin, user.id, { status: 'active' }).expect(200);
      await t.api.get('/api/auth/me').set(bearer(t, user)).expect(200);
    });

    it('replaces the permissions, which change what the user can do at once', async () => {
      const [admin, user] = [await b.admin(), await b.user()];
      await t.api.get('/api/auth/me').set(bearer(t, user)).expect(200);

      await patch(admin, user.id, { permissions: [Permission.ORDER_VIEW_LIST] }).expect(200);
      const denied = await t.api.get('/api/auth/me').set(bearer(t, user));
      await patch(admin, user.id, { permissions: [Permission.AUTH_ME] }).expect(200);

      expect(error(denied)).toMatchObject({ status: 403, errorCode: 9001 });
      await t.api.get('/api/auth/me').set(bearer(t, user)).expect(200);
      expect((await userRow(user.id)).permissions).toEqual([Permission.AUTH_ME]);
    });

    it('changes only the fields sent and accepts an empty body as no change', async () => {
      const [admin, user] = [await b.admin(), await b.user({ name: 'Giữ tên' })];

      await patch(admin, user.id, {}).expect(200);
      await patch(admin, user.id, { status: 'disabled' }).expect(200);

      expect(await userRow(user.id)).toMatchObject({ role: 'user', status: 'disabled', permissions: DEFAULT_USER_PERMISSIONS });
      expect(await rows('SELECT name FROM users WHERE id = $1', [user.id])).toEqual([{ name: 'Giữ tên' }]);
    });

    it('lets an admin demote or disable another admin', async () => {
      const [admin, other] = [await b.admin(), await b.admin()];

      await patch(admin, other.id, { role: 'user', status: 'disabled' }).expect(200);

      expect(await userRow(other.id)).toMatchObject({ role: 'user', status: 'disabled' });
    });

    it('refuses an admin changing their own role or status (400 / 1402) but lets them change their own permissions', async () => {
      const admin = await b.admin();

      const role = await patch(admin, admin.id, { role: 'user' });
      const status = await patch(admin, admin.id, { status: 'disabled' });
      const both = await patch(admin, admin.id, { role: 'admin', permissions: [Permission.AUTH_ME] });
      const permissions = await patch(admin, admin.id, { permissions: [Permission.AUTH_ME] }).expect(200);

      for (const res of [role, status, both]) expect(error(res)).toMatchObject({ status: 400, errorCode: 1402 });
      expect(permissions.body.data).toMatchObject({ role: 'admin', status: 'active', permissions: [Permission.AUTH_ME] });
      expect((await userRow(admin.id)).permissions).toEqual([Permission.AUTH_ME]);
    });

    it('accepts only permission codes that exist and no repeats; an empty list revokes everything', async () => {
      const [admin, user] = [await b.admin(), await b.user()];

      const unknown = await patch(admin, user.id, { permissions: [Permission.AUTH_ME, 99_999] });
      const repeated = await patch(admin, user.id, { permissions: [Permission.AUTH_ME, Permission.AUTH_ME] });
      const valid = await patch(admin, user.id, { permissions: [Permission.AUTH_ME, Permission.ORDER_VIEW_LIST] }).expect(200);
      const revoked = await patch(admin, user.id, { permissions: [] }).expect(200);

      for (const res of [unknown, repeated]) expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(valid.body.data.permissions).toEqual([Permission.AUTH_ME, Permission.ORDER_VIEW_LIST]);
      expect(revoked.body.data.permissions).toEqual([]);
    });

    it('answers 404 / 1401 for an unknown user', async () => {
      const res = await patch(await b.admin(), 'zzzzzzzzzzzzzzzz', { status: 'disabled' });

      expect(error(res)).toMatchObject({ status: 404, errorCode: 1401 });
    });

    it.each([
      ['an unknown role', { role: 'superadmin' }],
      ['a non-string role', { role: 1 }],
      ['an unknown status', { status: 'banned' }],
      ['permissions that are not an array', { permissions: 'all' }],
      ['non-integer permissions', { permissions: [1.5] }],
      ['string permissions', { permissions: ['AUTH_ME'] }],
      ['an email (not editable)', { email: 'x@flow.test' }],
      ['an unknown field', { id: 'other' }],
    ])('rejects %s with a validation error (no errorCode) and changes nothing', async (_name, body) => {
      const [admin, user] = [await b.admin(), await b.user()];
      const before = await userRow(user.id);

      const res = await patch(admin, user.id, body);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
      expect(await userRow(user.id)).toEqual(before);
    });
  });
});
