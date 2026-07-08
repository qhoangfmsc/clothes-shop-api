import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name);

  catch(exception: HttpException | Error, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let responseBody: any = { statusCode, message: 'Internal server error' };

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      responseBody = typeof exceptionResponse === 'string' ? { statusCode, message: exceptionResponse } : exceptionResponse;
    } else if (exception instanceof Error) {
      responseBody = {
        statusCode,
        message: exception.message,
      };
    }

    // Log 500 errors with stack trace for debugging
    if (statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception.message, (exception as Error).stack);
    }

    response.status(statusCode).json(responseBody);
  }
}
