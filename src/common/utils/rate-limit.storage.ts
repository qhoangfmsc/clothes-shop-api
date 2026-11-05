import { Logger } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import Redis from 'ioredis';

type ThrottlerRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/** Phần tối thiểu của ioredis mà kho cần (D của SOLID; unit test giả được) */
export interface RedisLike {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
  quit(): Promise<unknown>;
}

const KEY_PREFIX = 'rl';
const WARN_INTERVAL_MS = 60_000;

/** INCR và đặt hạn trong một bước nguyên tử; trả [số lần đếm, thời gian còn lại (ms)] */
const INCR_WITH_TTL = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {hits, redis.call('PTTL', KEYS[1])}
`;

/** Adapter: Redis → ThrottlerStorage, bộ đếm cửa sổ cố định dùng chung giữa các instance (docs/specs/common/0017) */
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly client: RedisLike) {}

  async increment(key: string, ttl: number, limit: number, _blockDuration: number, throttlerName: string): Promise<ThrottlerRecord> {
    const [hits, pttl] = (await this.client.eval(INCR_WITH_TTL, 1, `${KEY_PREFIX}:${throttlerName}:${key}`, ttl)) as [number, number];
    const timeToExpire = Math.max(1, Math.ceil((pttl > 0 ? pttl : ttl) / 1000));
    const isBlocked = hits > limit;
    return { totalHits: hits, timeToExpire, isBlocked, timeToBlockExpire: isBlocked ? timeToExpire : 0 };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}

/** Fallback: kho chính lỗi thì đếm tạm bằng kho dự phòng, API không sập vì rate limit (cảnh báo tối đa 1 lần/phút) */
export class FallbackThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(FallbackThrottlerStorage.name);
  private lastWarnAt = 0;

  constructor(
    private readonly primary: ThrottlerStorage,
    private readonly fallback: ThrottlerStorage,
    private readonly now: () => number = Date.now,
  ) {}

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerRecord> {
    try {
      return await this.primary.increment(key, ttl, limit, blockDuration, throttlerName);
    } catch (error) {
      const now = this.now();
      if (now - this.lastWarnAt >= WARN_INTERVAL_MS) {
        this.lastWarnAt = now;
        this.logger.warn(`Rate limit store unavailable, counting in memory: ${(error as Error)?.message}`);
      }
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await (this.primary as { onApplicationShutdown?: () => Promise<void> }).onApplicationShutdown?.();
    (this.fallback as { onApplicationShutdown?: () => void }).onApplicationShutdown?.();
  }
}

/** `REDIS_URL` trống → `undefined` (throttler dùng kho in-memory mặc định); có → Redis, lỗi thì rơi về in-memory */
export function createRateLimitStorage(redisUrl: string | undefined): ThrottlerStorage | undefined {
  if (!redisUrl?.trim()) return undefined;
  // Không xếp hàng khi mất kết nối: lỗi ngay để Fallback đếm tạm thay vì treo request
  const client = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 2_000 });
  client.on('error', () => undefined);
  return new FallbackThrottlerStorage(new RedisThrottlerStorage(client as unknown as RedisLike), new ThrottlerStorageService());
}
