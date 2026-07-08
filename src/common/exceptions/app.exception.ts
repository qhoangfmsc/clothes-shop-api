import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorMessages } from './error-codes';

export class AppException extends HttpException {
  constructor(errorCode: number, message?: string | undefined, statusCode: HttpStatus = HttpStatus.BAD_REQUEST) {
    const defaultMessage = ErrorMessages[errorCode] || 'An error occurred';
    const finalMessage = message || defaultMessage;

    super(
      {
        statusCode,
        errorCode,
        message: finalMessage,
      },
      statusCode,
    );
  }
}

/**
 * Helper function để throw AppException một cách ngắn gọn
 *
 * @example
 * throwAppError(AuthAdminErrorCode.ADMIN_DISABLED);
 * throwAppError(AuthAdminErrorCode.ADMIN_DISABLED, 'Custom message');
 */
export function throwAppError(errorCode: number, message?: string, statusCode?: HttpStatus): never {
  throw new AppException(errorCode, message, statusCode);
}
