import Redis from 'ioredis';
import {
  createRateLimitStorage,
  FallbackThrottlerStorage,
  type RedisLike,
  RedisThrottlerStorage,
} from '../../../src/common/utils/rate-limit.storage';

/** Kho đếm Redis thật (spec common/0017): hai RedisThrottlerStorage đóng vai hai instance dùng chung một bộ đếm. */
const REDIS_URL = process.env.REDIS_TEST_URL ?? 'redis://127.0.0.1:56379';
const WINDOW_MS = 1_000;

describe('Flow: shared rate-limit store (Redis)', () => {
  let client: Redis;
  let n = 0;
  const uniqueKey = () => `flow-${Date.now()}-${++n}`;
  const instance = () => new RedisThrottlerStorage(new Redis(REDIS_URL) as unknown as RedisLike);

  beforeAll(() => {
    client = new Redis(REDIS_URL);
  });
  afterAll(async () => {
    await client.quit();
  });

  it('adds up the hits of two instances on the same key, then blocks past the limit with a positive Retry-After', async () => {
    const [a, b] = [instance(), instance()];
    const key = uniqueKey();

    const hits = [
      await a.increment(key, 60_000, 3, 0, 'default'),
      await b.increment(key, 60_000, 3, 0, 'default'),
      await a.increment(key, 60_000, 3, 0, 'default'),
      await b.increment(key, 60_000, 3, 0, 'default'),
    ];

    expect(hits.map((h) => h.totalHits)).toEqual([1, 2, 3, 4]);
    expect(hits.map((h) => h.isBlocked)).toEqual([false, false, false, true]);
    expect(hits[3].timeToBlockExpire).toBeGreaterThan(0);
    await Promise.all([a.onApplicationShutdown(), b.onApplicationShutdown()]);
  });

  it('counts concurrent requests from many instances exactly (atomic increment)', async () => {
    const instances = [instance(), instance(), instance()];
    const key = uniqueKey();

    const records = await Promise.all(Array.from({ length: 30 }, (_, i) => instances[i % 3].increment(key, 60_000, 100, 0, 'default')));

    expect(records.map((r) => r.totalHits).sort((x, y) => x - y)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    await Promise.all(instances.map((i) => i.onApplicationShutdown()));
  });

  it('keeps separate counters per throttler name and per tracker', async () => {
    const store = instance();
    const key = uniqueKey();

    await store.increment(key, 60_000, 5, 0, 'default');
    await store.increment(key, 60_000, 5, 0, 'default');

    expect((await store.increment(key, 60_000, 5, 0, 'auth')).totalHits).toBe(1);
    expect((await store.increment(uniqueKey(), 60_000, 5, 0, 'default')).totalHits).toBe(1);
    await store.onApplicationShutdown();
  });

  it('forgets the counter after the window (the key expires), so a blocked client can try again', async () => {
    const store = instance();
    const key = uniqueKey();
    await store.increment(key, WINDOW_MS, 1, 0, 'default');
    expect((await store.increment(key, WINDOW_MS, 1, 0, 'default')).isBlocked).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS + 200));

    expect(await store.increment(key, WINDOW_MS, 1, 0, 'default')).toMatchObject({ totalHits: 1, isBlocked: false });
    await store.onApplicationShutdown();
  });

  it('never leaves a counter without an expiry (a key must not live forever)', async () => {
    const store = instance();
    const key = uniqueKey();

    await store.increment(key, 60_000, 5, 0, 'default');

    const ttl = await client.pttl(`rl:default:${key}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);
    await store.onApplicationShutdown();
  });

  it('falls back to counting in memory, without throwing, when Redis is unreachable', async () => {
    const store = createRateLimitStorage('redis://127.0.0.1:1') as FallbackThrottlerStorage;
    const key = uniqueKey();

    const first = await store.increment(key, 60_000, 2, 0, 'default');
    const second = await store.increment(key, 60_000, 2, 0, 'default');
    const third = await store.increment(key, 60_000, 2, 0, 'default');

    expect([first.totalHits, second.totalHits, third.totalHits]).toEqual([1, 2, 3]);
    expect(third.isBlocked).toBe(true);
    await store.onApplicationShutdown();
  });
});
