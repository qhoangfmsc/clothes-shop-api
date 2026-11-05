import { RATE_LIMITS, rateLimitPerMinute } from './rate-limit.config';

describe('rateLimitPerMinute', () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const { env } of Object.values(RATE_LIMITS)) {
      if (saved[env] === undefined) delete process.env[env];
      else process.env[env] = saved[env];
    }
  });

  it('uses the built-in defaults, stricter for auth and uploads than for everything else', () => {
    for (const { env } of Object.values(RATE_LIMITS)) delete process.env[env];

    expect([rateLimitPerMinute('default'), rateLimitPerMinute('auth'), rateLimitPerMinute('upload')]).toEqual([120, 10, 20]);
  });

  it('reads the environment on every call so a change needs no restart of the code path', () => {
    process.env.RATE_LIMIT_AUTH_PER_MINUTE = '3';
    expect(rateLimitPerMinute('auth')).toBe(3);
    process.env.RATE_LIMIT_AUTH_PER_MINUTE = '7';
    expect(rateLimitPerMinute('auth')).toBe(7);
  });

  it.each(['0', '-5', '1.5', 'abc', ''])('falls back to the default for the invalid value "%s"', (value) => {
    process.env.RATE_LIMIT_UPLOAD_PER_MINUTE = value;

    expect(rateLimitPerMinute('upload')).toBe(20);
  });
});
