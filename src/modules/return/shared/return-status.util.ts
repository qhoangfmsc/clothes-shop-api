import { throwAppError } from '@common/exceptions/app.exception';
import { EReturnErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus } from '@nestjs/common';
import { ReturnStatus } from './return.constant';
import { ReturnRequest } from './return-request.entity';

export function assertReturnStatus(request: ReturnRequest | null, allowed: readonly ReturnStatus[]): asserts request is ReturnRequest {
  if (!request) throwAppError(EReturnErrorCode.RETURN_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
  if (!allowed.includes(request.status)) {
    throwAppError(
      EReturnErrorCode.RETURN_INVALID_STATE,
      `The return request is ${request.status}; allowed only when ${allowed.join(' or ')}`,
    );
  }
}
