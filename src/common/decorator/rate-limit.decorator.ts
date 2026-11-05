import { RATE_LIMIT_WINDOW_MS, type RateLimitKind, rateLimitPerMinute } from '@common/utils/rate-limit.config';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

/** Route nhạy cảm (đăng nhập, upload) chặt hơn mức mặc định; giới hạn đọc từ env mỗi request */
export const RateLimit = (kind: Exclude<RateLimitKind, 'default'>) =>
  Throttle({ default: { limit: () => rateLimitPerMinute(kind), ttl: RATE_LIMIT_WINDOW_MS } });

/** Không bao giờ giới hạn (webhook của đối tác, health check của nền tảng) */
export const SkipRateLimit = () => SkipThrottle();
