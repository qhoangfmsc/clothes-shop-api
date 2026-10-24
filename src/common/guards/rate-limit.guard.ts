import { throwAppError } from '@common/exceptions/app.exception';
import { ERateLimitErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Guard toàn cục của `@nestjs/throttler`; chỉ đổi dạng lỗi thành `AppException` 429 / 9201 như phần còn lại của API (header `Retry-After` do thư viện đặt) */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected async throwThrottlingException(): Promise<void> {
    throwAppError(ERateLimitErrorCode.RATE_LIMITED, undefined, HttpStatus.TOO_MANY_REQUESTS);
  }
}
