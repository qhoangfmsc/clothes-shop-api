import { createTestApp, type TestApp } from '../../support';

/** Batch 25 (health): `GET /` và `GET /health`, công khai. */
describe('Flow: health', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => t.close());

  it('answers the greeting at the root without a token', async () => {
    const res = await t.api.get('/').expect(200);

    expect(res.text).toBe('Clothes Shop API is running');
  });

  it('reports the database as connected with a timestamp and the uptime', async () => {
    const res = await t.api.get('/health').expect(200);

    expect(res.body).toEqual({ status: 'ok', timestamp: expect.any(String), uptime: expect.any(Number), db: 'connected', commit: null });
    expect(Math.abs(Date.now() - new Date(res.body.timestamp).getTime())).toBeLessThan(10_000);
    expect(res.body.uptime).toBeGreaterThan(0);
  });

  it('reports the deployed commit when the platform provides it, so a post-deploy check can tell new from old', async () => {
    process.env.RENDER_GIT_COMMIT = 'abc123def456';
    try {
      expect((await t.api.get('/health').expect(200)).body.commit).toBe('abc123def456');
    } finally {
      delete process.env.RENDER_GIT_COMMIT;
    }
  });

  it('reports the database as disconnected (still HTTP 200) when the query fails', async () => {
    jest.spyOn(t.dataSource, 'query').mockRejectedValueOnce(new Error('connection lost'));

    const res = await t.api.get('/health').expect(200);

    expect(res.body).toEqual({ status: 'error', timestamp: expect.any(String), db: 'disconnected' });
    expect((await t.api.get('/health').expect(200)).body.status).toBe('ok');
  });
});
