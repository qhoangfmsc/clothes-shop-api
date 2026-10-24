import { bearer, createBuilders, createTestApp, sepayWebhook, type TestApp, truncateAll } from '../../support';

/** Rate limit (spec common/0010): app riêng với giới hạn thấp; mỗi ca dùng một IP riêng qua `X-Forwarded-For` (TRUST_PROXY=1) nên bộ đếm không lẫn nhau. */
describe('Flow: rate limiting', () => {
  const LIMITS = { RATE_LIMIT_DEFAULT_PER_MINUTE: '5', RATE_LIMIT_AUTH_PER_MINUTE: '3', RATE_LIMIT_UPLOAD_PER_MINUTE: '2' };
  const saved = { ...process.env };
  let t: TestApp;
  let n = 0;

  const useEnv = (env: Record<string, string>) => Object.assign(process.env, LIMITS, env);
  const nextIp = () => `10.1.${Math.floor(++n / 250)}.${n % 250}`;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const statuses = async (count: number, send: () => PromiseLike<{ status: number }>) => {
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push((await send()).status);
    return out;
  };

  afterAll(() => {
    for (const key of [...Object.keys(LIMITS), 'TRUST_PROXY']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  describe('behind one trusted proxy (TRUST_PROXY=1)', () => {
    beforeAll(async () => {
      useEnv({ TRUST_PROXY: '1' });
      t = await createTestApp();
    });
    afterEach(() => truncateAll(t.dataSource));
    afterAll(() => t.close());

    const get = (path: string, ip: string) => t.api.get(path).set('X-Forwarded-For', ip);

    it('lets a client use a route up to the default limit, then answers 429 / 9201 with Retry-After', async () => {
      const ip = nextIp();

      const ok = await statuses(5, () => get('/api/shipping', ip));
      const blocked = await get('/api/shipping', ip);

      expect(ok).toEqual([200, 200, 200, 200, 200]);
      expect(error(blocked)).toEqual({ status: 429, errorCode: 9201, message: 'Too many requests, please try again later' });
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('counts per route and per client: other routes and other IPs are unaffected', async () => {
      const ip = nextIp();
      await statuses(6, () => get('/api/shipping', ip));

      expect((await get('/api/shipping', ip)).status).toBe(429);
      expect((await get('/api/size-guides/tops', ip)).status).toBe(200);
      expect((await get('/api/shipping', nextIp())).status).toBe(200);
    });

    it('answers 429 before authentication: an anonymous caller over the limit gets 429, not 401', async () => {
      const ip = nextIp();

      const results = await statuses(7, () => get('/api/cart', ip));

      expect(results).toEqual([401, 401, 401, 401, 401, 429, 429]);
    });

    it('is stricter on sign-in and token refresh (3 per minute), counted separately for each', async () => {
      const ip = nextIp();
      const refresh = () => t.api.post('/api/auth/refresh').set('X-Forwarded-For', ip).send({ refreshToken: 'garbage' });
      const google = () => t.api.post('/api/auth/google').set('X-Forwarded-For', ip).send({});

      const refreshed = await statuses(4, refresh);
      const signedIn = await statuses(4, google);

      expect(refreshed).toEqual([401, 401, 401, 429]);
      expect(signedIn).toEqual([400, 400, 400, 429]);
    });

    it('is stricter on uploads (2 per minute): review photos and the admin library', async () => {
      const b = createBuilders(t.dataSource);
      const [user, admin] = [await b.user(), await b.admin()];
      const ip = nextIp();
      const photo = () => t.api.post('/api/reviews/images').set('X-Forwarded-For', ip).set(bearer(t, user));
      const library = () => t.api.post('/api/admin/media').set('X-Forwarded-For', ip).set(bearer(t, admin));

      const photos = await statuses(3, photo);
      const files = await statuses(3, library);

      expect(photos).toEqual([503, 503, 429]);
      expect(files).toEqual([503, 503, 429]);
    });

    it('never limits the bank webhook or the health check', async () => {
      const ip = nextIp();
      const hook = sepayWebhook({ id: 'rate-limit-hook', amount: 1000, content: 'NOCODE' });

      const health = await statuses(15, () => get('/health', ip));
      const root = await statuses(15, () => get('/', ip));
      const webhook = await statuses(15, () =>
        t.api.post('/api/webhooks/sepay').set('X-Forwarded-For', ip).set(hook.headers).send(hook.body),
      );

      expect([...health, ...root]).not.toContain(429);
      expect(webhook).not.toContain(429);
    });
  });

  describe('without a trusted proxy (TRUST_PROXY=0)', () => {
    beforeAll(async () => {
      useEnv({ TRUST_PROXY: '0' });
      t = await createTestApp();
    });
    afterAll(() => t.close());

    it('ignores X-Forwarded-For, so a client cannot dodge the limit by changing the header', async () => {
      const results = await statuses(7, () => t.api.get('/api/shipping').set('X-Forwarded-For', nextIp()));

      expect(results).toEqual([200, 200, 200, 200, 200, 429, 429]);
    });
  });
});
