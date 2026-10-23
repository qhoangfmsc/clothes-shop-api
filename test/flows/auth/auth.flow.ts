import { DEFAULT_USER_PERMISSIONS } from '@common/permissions/permissions.constant';
import { OAuth2Client } from 'google-auth-library';
import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';

/** Batch 20 (auth): đăng nhập Google, làm mới token, `me`, danh sách permission. Google được giả ở biên (`OAuth2Client`, `fetch`). */
describe('Flow: auth', () => {
  let t: TestApp;
  let b: Builders;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await truncateAll(t.dataSource);
  });
  afterAll(() => t.close());

  type User = Awaited<ReturnType<Builders['user']>>;
  const rows = <R>(sql: string, params: unknown[] = []) => t.dataSource.query(sql, params) as Promise<R[]>;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const login = (credential: unknown) => t.api.post('/api/auth/google').send({ idToken: credential });
  const refresh = (token: unknown) => t.api.post('/api/auth/refresh').send({ refreshToken: token });
  const me = (token: string) => t.api.get('/api/auth/me').set({ Authorization: `Bearer ${token}` });
  const tokenOf = (user: Pick<User, 'id' | 'email' | 'role'>, options: Parameters<typeof bearer>[2] = {}) =>
    bearer(t, user, options).Authorization.replace('Bearer ', '');
  const secret = () => process.env.JWT_SECRET as string;

  const ID_TOKEN = 'header.payload.signature';
  const AUTH_CODE = '4/0AbCdEfGh';
  const ACCESS_TOKEN = `ya29.${'x'.repeat(220)}`;
  const googlePayload = (overrides: object = {}) => ({
    email: 'new@flow.test',
    name: 'Nguyễn Mới',
    picture: 'https://img.flow.test/a.jpg',
    sub: 'google-sub-1',
    ...overrides,
  });
  const idTokenIs = (payload: object | null) =>
    jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({ getPayload: () => payload } as never);
  const userinfoIs = (status: number, body: object = {}) =>
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));

  describe('POST /api/auth/google', () => {
    it('creates a user on the first login with the default role, permissions and status, and issues working tokens', async () => {
      const verify = idTokenIs(googlePayload());

      const res = await login(ID_TOKEN).expect(201);

      expect(verify).toHaveBeenCalledWith(expect.objectContaining({ idToken: ID_TOKEN }));
      expect(res.body.user).toEqual({
        id: expect.any(String),
        email: 'new@flow.test',
        name: 'Nguyễn Mới',
        image: 'https://img.flow.test/a.jpg',
        role: 'user',
        permissions: DEFAULT_USER_PERMISSIONS,
        status: 'active',
        createdAt: expect.any(String),
      });
      expect(await rows('SELECT email, provider, provider_id, role, status FROM users')).toEqual([
        { email: 'new@flow.test', provider: 'google', provider_id: 'google-sub-1', role: 'user', status: 'active' },
      ]);
      const access = t.jwt.decode(res.body.accessToken) as {
        sub: string;
        email: string;
        role: string;
        type: string;
        iat: number;
        exp: number;
      };
      const refreshed = t.jwt.decode(res.body.refreshToken) as { type: string; iat: number; exp: number };
      expect(access).toMatchObject({ sub: res.body.user.id, email: 'new@flow.test', role: 'user', type: 'access' });
      expect(access.exp - access.iat).toBe(86_400);
      expect(refreshed).toMatchObject({ type: 'refresh' });
      expect(refreshed.exp - refreshed.iat).toBe(30 * 86_400);
      expect((await me(res.body.accessToken).expect(200)).body.user.email).toBe('new@flow.test');
    });

    it('updates name, picture and provider id on a later login but keeps role, permissions and status', async () => {
      const admin = await b.admin({ email: 'boss@flow.test', name: 'Cũ', image: 'old.jpg', providerId: 'old-sub' });
      idTokenIs(googlePayload({ email: 'boss@flow.test', name: 'Tên mới', picture: 'new.jpg', sub: 'new-sub' }));

      const res = await login(ID_TOKEN).expect(201);

      expect(res.body.user).toMatchObject({
        id: admin.id,
        name: 'Tên mới',
        image: 'new.jpg',
        role: 'admin',
        permissions: [],
        status: 'active',
      });
      expect(await rows('SELECT name, image, provider_id, role FROM users')).toEqual([
        { name: 'Tên mới', image: 'new.jpg', provider_id: 'new-sub', role: 'admin' },
      ]);
      expect(await rows('SELECT 1 FROM users')).toHaveLength(1);
    });

    it('keeps the stored name and picture when Google sends empty ones', async () => {
      await b.user({ email: 'keep@flow.test', name: 'Giữ tên', image: 'keep.jpg' });
      idTokenIs(googlePayload({ email: 'keep@flow.test', name: '', picture: '' }));

      await login(ID_TOKEN).expect(201);

      expect(await rows('SELECT name, image FROM users')).toEqual([{ name: 'Giữ tên', image: 'keep.jpg' }]);
    });

    it('treats a short non-JWT string as an authorization code: id_token or access_token from the exchange', async () => {
      const exchange = jest.spyOn(OAuth2Client.prototype, 'getToken');
      exchange.mockResolvedValueOnce({ tokens: { id_token: ID_TOKEN } } as never);
      idTokenIs(googlePayload({ email: 'code@flow.test' }));
      const viaIdToken = await login(AUTH_CODE).expect(201);
      exchange.mockResolvedValueOnce({ tokens: { access_token: 'short-access' } } as never);
      const userinfo = userinfoIs(200, { email: 'userinfo@flow.test', name: 'Info', picture: '', sub: 's-info' });

      const viaAccessToken = await login('some-code').expect(201);

      expect(exchange).toHaveBeenCalledWith({ code: AUTH_CODE, redirect_uri: 'postmessage' });
      expect(viaIdToken.body.user.email).toBe('code@flow.test');
      expect(viaAccessToken.body.user.email).toBe('userinfo@flow.test');
      expect(userinfo).toHaveBeenCalledWith(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        expect.objectContaining({ headers: { Authorization: 'Bearer short-access' } }),
      );
    });

    it('treats a long non-JWT string as a Google access token and reads the userinfo endpoint', async () => {
      const userinfo = userinfoIs(200, { email: 'token@flow.test', name: 'Qua token', picture: 'p.jpg', sub: 's-token' });

      const res = await login(ACCESS_TOKEN).expect(201);

      expect(res.body.user).toMatchObject({ email: 'token@flow.test', name: 'Qua token', image: 'p.jpg' });
      expect(userinfo).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }),
      );
    });

    it('answers 401 / 2210 for an ID token Google rejects or without an email, and creates no user', async () => {
      jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockRejectedValueOnce(new Error('Wrong recipient') as never);
      const rejected = await login(ID_TOKEN);
      idTokenIs(googlePayload({ email: '' }));
      const noEmail = await login(ID_TOKEN);
      idTokenIs(null);
      const noPayload = await login(ID_TOKEN);

      expect(error(rejected)).toMatchObject({ status: 401, errorCode: 2210, message: 'Invalid Google token' });
      expect(error(noEmail)).toMatchObject({ status: 401, errorCode: 2210, message: 'Invalid Google token: missing email' });
      expect(error(noPayload)).toMatchObject({ status: 401, errorCode: 2210 });
      expect(await rows('SELECT 1 FROM users')).toHaveLength(0);
    });

    it('answers 401 / 2211 when the code exchange fails or returns no token', async () => {
      const exchange = jest.spyOn(OAuth2Client.prototype, 'getToken');
      exchange.mockRejectedValueOnce(new Error('invalid_grant') as never);
      const failed = await login(AUTH_CODE);
      exchange.mockResolvedValueOnce({ tokens: {} } as never);
      const empty = await login(AUTH_CODE);

      expect(error(failed)).toMatchObject({ status: 401, errorCode: 2211, message: 'Failed to exchange authorization code' });
      expect(error(empty)).toMatchObject({ status: 401, errorCode: 2211, message: 'No token received from Google' });
    });

    it('answers 401 / 2212 when the access token is refused or Google cannot be reached, and 401 / 2210 without an email', async () => {
      userinfoIs(401, { error: 'invalid_token' });
      const refused = await login(ACCESS_TOKEN);
      jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNRESET') as never);
      const unreachable = await login(ACCESS_TOKEN);
      userinfoIs(200, { name: 'Không email' });
      const noEmail = await login(ACCESS_TOKEN);

      expect(error(refused)).toMatchObject({ status: 401, errorCode: 2212, message: 'Failed to fetch Google user info' });
      expect(error(unreachable)).toMatchObject({ status: 401, errorCode: 2212 });
      expect(error(noEmail)).toMatchObject({ status: 401, errorCode: 2210, message: 'Google user info missing email' });
      expect(await rows('SELECT 1 FROM users')).toHaveLength(0);
    });

    it.each([
      ['a missing idToken', undefined],
      ['an empty idToken', ''],
      ['a non-string idToken', 123],
    ])('rejects %s with a validation error (no errorCode)', async (_name, credential) => {
      const res = await login(credential);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });

    it('rejects an unknown field with a validation error (no errorCode)', async () => {
      const res = await t.api.post('/api/auth/google').send({ idToken: ID_TOKEN, role: 'admin' });

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('issues a new access token for a refresh token, without a new refresh token, and the user view', async () => {
      const user = await b.user();

      const res = await refresh(tokenOf(user, { type: 'refresh' })).expect(201);

      expect(Object.keys(res.body).sort()).toEqual(['accessToken', 'user']);
      expect(res.body.user).toEqual({
        id: user.id,
        email: user.email,
        name: user.name,
        image: null,
        role: 'user',
        permissions: DEFAULT_USER_PERMISSIONS,
        status: 'active',
        createdAt: expect.any(String),
      });
      expect(t.jwt.decode(res.body.accessToken)).toMatchObject({ sub: user.id, type: 'access' });
      await me(res.body.accessToken).expect(200);
    });

    it('answers 401 / 2202 whatever is wrong with the token', async () => {
      const [user, disabled, gone] = [await b.user(), await b.user({ status: 'disabled' }), await b.user()];
      await rows('DELETE FROM users WHERE id = $1', [gone.id]);
      const legacy = t.jwt.sign({ sub: user.id, email: user.email, role: user.role }, { secret: secret(), expiresIn: '1h' });
      const attempts = [
        tokenOf(user, { type: 'access' }),
        legacy,
        tokenOf(user, { type: 'refresh', expiresIn: '-1h' }),
        tokenOf(user, { type: 'refresh', secret: 'another-secret' }),
        tokenOf(disabled, { type: 'refresh' }),
        tokenOf(gone, { type: 'refresh' }),
        'not-a-token',
      ];

      for (const token of attempts)
        expect(error(await refresh(token))).toEqual({ status: 401, errorCode: 2202, message: 'Invalid refresh token' });
    });

    it('stops working once the user is disabled', async () => {
      const user = await b.user();
      const token = tokenOf(user, { type: 'refresh' });
      await refresh(token).expect(201);
      await rows(`UPDATE users SET status = 'disabled' WHERE id = $1`, [user.id]);

      const res = await refresh(token);

      expect(error(res)).toMatchObject({ status: 401, errorCode: 2202 });
    });

    it.each([
      ['a missing refreshToken', undefined],
      ['an empty refreshToken', ''],
      ['a non-string refreshToken', 5],
    ])('rejects %s with a validation error (no errorCode)', async (_name, token) => {
      const res = await refresh(token);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns my profile without internal columns, and follows role and permission changes at once', async () => {
      const [user, admin] = [await b.user({ image: 'me.jpg' }), await b.admin()];
      const token = tokenOf(user);

      const res = await me(token).expect(200);
      await t.api
        .patch(`/api/admin/users/${user.id}`)
        .set(bearer(t, admin))
        .send({ permissions: [1000] })
        .expect(200);
      const after = await me(token).expect(200);

      expect(res.body).toEqual({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: 'me.jpg',
          role: 'user',
          permissions: DEFAULT_USER_PERMISSIONS,
          status: 'active',
          createdAt: expect.any(String),
        },
      });
      expect(after.body.user.permissions).toEqual([1000]);
    });

    it('answers 401 without errorCode for a refresh token, a disabled user, a deleted user and a missing token', async () => {
      const [user, disabled, gone] = [await b.user(), await b.user({ status: 'disabled' }), await b.user()];
      await rows('DELETE FROM users WHERE id = $1', [gone.id]);

      const asRefresh = await me(tokenOf(user, { type: 'refresh' }));
      const asDisabled = await me(tokenOf(disabled));
      const asGone = await me(tokenOf(gone));
      const none = await t.api.get('/api/auth/me');

      expect(asRefresh.status).toBe(401);
      expect(asRefresh.body.message).toBe('Invalid access token');
      expect(asDisabled.body.message).toBe('User not found or disabled');
      expect(asGone.body.message).toBe('User not found or disabled');
      for (const res of [asRefresh, asDisabled, asGone, none]) expect([res.status, res.body.errorCode]).toEqual([401, undefined]);
    });

    it('answers 403 / 9001 for a user without the AUTH_ME permission', async () => {
      const user = await b.user({ permissions: [] });

      const res = await me(tokenOf(user));

      expect(error(res)).toMatchObject({ status: 403, errorCode: 9001 });
    });
  });

  describe('GET /api/auth/permissions', () => {
    it('lists every permission code with its name for an admin', async () => {
      const admin = await b.admin();

      const res = await t.api.get('/api/auth/permissions').set(bearer(t, admin)).expect(200);

      expect(res.body.data.length).toBeGreaterThan(50);
      expect(res.body.data).toEqual(
        expect.arrayContaining([
          { code: 1000, name: 'AUTH_ME' },
          { code: 10000, name: 'USER_ADMIN_VIEW' },
        ]),
      );
      for (const entry of res.body.data) expect(Object.keys(entry).sort()).toEqual(['code', 'name']);
      expect(new Set(res.body.data.map((entry: { code: number }) => entry.code)).size).toBe(res.body.data.length);
    });

    it('answers 403 / 9001 for a customer, and works for a user granted USER_ADMIN_VIEW', async () => {
      const [customer, viewer] = [await b.user(), await b.user({ permissions: [10000] })];

      const denied = await t.api.get('/api/auth/permissions').set(bearer(t, customer));
      const allowed = await t.api.get('/api/auth/permissions').set(bearer(t, viewer));

      expect(error(denied)).toMatchObject({ status: 403, errorCode: 9001 });
      expect(allowed.status).toBe(200);
    });
  });
});
