/** Giới hạn request mỗi phút theo (route, IP); đọc `process.env` mỗi lần gọi nên đổi cấu hình không cần build lại */
export const RATE_LIMITS = {
  default: { env: 'RATE_LIMIT_DEFAULT_PER_MINUTE', fallback: 120 },
  auth: { env: 'RATE_LIMIT_AUTH_PER_MINUTE', fallback: 10 },
  upload: { env: 'RATE_LIMIT_UPLOAD_PER_MINUTE', fallback: 20 },
} as const;

export type RateLimitKind = keyof typeof RATE_LIMITS;

export const RATE_LIMIT_WINDOW_MS = 60_000;

export function rateLimitPerMinute(kind: RateLimitKind): number {
  const { env, fallback } = RATE_LIMITS[kind];
  const value = Number(process.env[env]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
