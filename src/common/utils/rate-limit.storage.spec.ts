import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { createRateLimitStorage, FallbackThrottlerStorage, RedisThrottlerStorage } from './rate-limit.storage';

const fakeRedis = (reply: unknown): { eval: jest.Mock; quit: jest.Mock } => ({
  eval: jest.fn().mockResolvedValue(reply),
  quit: jest.fn().mockResolvedValue('OK'),
});

describe('RedisThrottlerStorage', () => {
  it('counts under the limit as not blocked and reports the remaining window in seconds', async () => {
    const redis = fakeRedis([3, 42_500]);

    const record = await new RedisThrottlerStorage(redis).increment('1.2.3.4', 60_000, 5, 0, 'default');

    expect(record).toEqual({ totalHits: 3, timeToExpire: 43, isBlocked: false, timeToBlockExpire: 0 });
  });

  it('blocks only once hits exceed the limit, and Retry-After is positive', async () => {
    const storage = (hits: number) => new RedisThrottlerStorage(fakeRedis([hits, 10_000]));

    expect((await storage(5).increment('k', 60_000, 5, 0, 'default')).isBlocked).toBe(false);
    expect(await storage(6).increment('k', 60_000, 5, 0, 'default')).toMatchObject({ isBlocked: true, timeToBlockExpire: 10 });
  });

  it('keys the counter by throttler name and tracker, and asks Redis to expire it after the window', async () => {
    const redis = fakeRedis([1, 60_000]);

    await new RedisThrottlerStorage(redis).increment('ip-key', 60_000, 5, 0, 'auth');

    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('INCR'), 1, 'rl:auth:ip-key', 60_000);
    expect(redis.eval.mock.calls[0][0]).toContain('PEXPIRE');
  });

  it('never reports a zero or negative window (key without TTL)', async () => {
    const record = await new RedisThrottlerStorage(fakeRedis([1, -1])).increment('k', 60_000, 5, 0, 'default');

    expect(record.timeToExpire).toBe(60);
  });

  it('closes the connection on shutdown without throwing', async () => {
    const redis = fakeRedis([1, 1]);
    redis.quit.mockRejectedValueOnce(new Error('closed'));

    await expect(new RedisThrottlerStorage(redis).onApplicationShutdown()).resolves.toBeUndefined();
  });
});

describe('FallbackThrottlerStorage', () => {
  const record = (totalHits: number) => ({ totalHits, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 });
  const storage = (increment: jest.Mock): ThrottlerStorage => ({ increment });
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('uses the primary store while it works', async () => {
    const primary = jest.fn().mockResolvedValue(record(2));
    const fallback = jest.fn();

    const result = await new FallbackThrottlerStorage(storage(primary), storage(fallback)).increment('k', 1, 1, 0, 'default');

    expect(result.totalHits).toBe(2);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('counts in the fallback when the primary fails, and the request is not rejected', async () => {
    const primary = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const fallback = jest.fn().mockResolvedValue(record(1));

    const result = await new FallbackThrottlerStorage(storage(primary), storage(fallback)).increment('k', 1, 1, 0, 'default');

    expect(result.totalHits).toBe(1);
    expect(fallback).toHaveBeenCalledWith('k', 1, 1, 0, 'default');
  });

  it('warns once per minute, not once per request', async () => {
    let now = 0;
    const store = new FallbackThrottlerStorage(
      storage(jest.fn().mockRejectedValue(new Error('down'))),
      storage(jest.fn().mockResolvedValue(record(1))),
      () => now,
    );

    now = 100_000;
    await store.increment('k', 1, 1, 0, 'default');
    await store.increment('k', 1, 1, 0, 'default');
    now = 100_000 + 61_000;
    await store.increment('k', 1, 1, 0, 'default');

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('goes back to the primary as soon as it recovers', async () => {
    const primary = jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(record(7));
    const store = new FallbackThrottlerStorage(storage(primary), storage(jest.fn().mockResolvedValue(record(1))));

    await store.increment('k', 1, 1, 0, 'default');

    expect((await store.increment('k', 1, 1, 0, 'default')).totalHits).toBe(7);
  });
});

describe('createRateLimitStorage', () => {
  it.each([undefined, '', '   '])('returns undefined for %p, so the in-memory default stays in use', (url) => {
    expect(createRateLimitStorage(url)).toBeUndefined();
  });

  it('returns a Redis-backed store with in-memory fallback for a URL, without connecting yet', async () => {
    const store = createRateLimitStorage('redis://127.0.0.1:1');

    expect(store).toBeInstanceOf(FallbackThrottlerStorage);
    await (store as FallbackThrottlerStorage).onApplicationShutdown();
  });
});
