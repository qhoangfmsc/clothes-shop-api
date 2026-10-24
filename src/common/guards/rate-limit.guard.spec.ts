import { AppException } from '@common/exceptions/app.exception';
import { RateLimitGuard } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  it('rejects with an AppException 429 and error code 9201', async () => {
    const guard = Object.create(RateLimitGuard.prototype) as { throwThrottlingException: () => Promise<void> };

    const error = await guard.throwThrottlingException().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(429);
    expect((error as AppException).getResponse()).toMatchObject({
      statusCode: 429,
      errorCode: 9201,
      message: 'Too many requests, please try again later',
    });
  });
});
