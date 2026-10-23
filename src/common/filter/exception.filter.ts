import {
  dbError,
  PG_CHECK_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
  PG_NOT_NULL_VIOLATION,
  PG_UNIQUE_VIOLATION,
} from '@common/base/db-error.util';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { EDatabaseErrorCode, ErrorMessages } from '../exceptions/error-codes';

/** Lưới an toàn: vi phạm ràng buộc DB chưa được service ánh xạ riêng là lỗi dữ liệu của client (4xx), không phải lỗi máy chủ */
const INTEGRITY_ERRORS: Record<string, { status: HttpStatus; errorCode: EDatabaseErrorCode }> = {
  [PG_NOT_NULL_VIOLATION]: { status: HttpStatus.BAD_REQUEST, errorCode: EDatabaseErrorCode.DB_NOT_NULL_VIOLATION },
  [PG_CHECK_VIOLATION]: { status: HttpStatus.BAD_REQUEST, errorCode: EDatabaseErrorCode.DB_CHECK_VIOLATION },
  [PG_UNIQUE_VIOLATION]: { status: HttpStatus.CONFLICT, errorCode: EDatabaseErrorCode.DB_UNIQUE_VIOLATION },
  [PG_FOREIGN_KEY_VIOLATION]: { status: HttpStatus.CONFLICT, errorCode: EDatabaseErrorCode.DB_FOREIGN_KEY_VIOLATION },
};

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name);

  catch(exception: HttpException | Error, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let responseBody: any = { statusCode, message: 'Internal server error' };
    const info = dbError(exception);
    const integrity = info && INTEGRITY_ERRORS[info.code] ? { info, ...INTEGRITY_ERRORS[info.code] } : null;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      responseBody = typeof exceptionResponse === 'string' ? { statusCode, message: exceptionResponse } : exceptionResponse;
    } else if (integrity) {
      const { info, status, errorCode } = integrity;
      this.logger.warn(`Integrity violation ${info.code} constraint=${info.constraint ?? '-'} column=${info.column ?? '-'}`);
      statusCode = status;
      // Chỉ nêu cột (do code của ta đặt tên), không lộ SQL hay giá trị
      const detail = info.column ? ` (${info.column})` : '';
      responseBody = { statusCode, errorCode, message: `${ErrorMessages[errorCode]}${detail}` };
    } else {
      // Không leak internal error messages ra client
      this.logger.error(exception.message, (exception as Error).stack);
      responseBody = { statusCode, message: 'Internal server error' };
    }

    // Log chi tiết cho 500 errors
    if (statusCode >= 500) {
      this.logger.error(`[${statusCode}] ${exception.message}`, (exception as Error).stack);
    }

    response.status(statusCode).json(responseBody);
  }
}
