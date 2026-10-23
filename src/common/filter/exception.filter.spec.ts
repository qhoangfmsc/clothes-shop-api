import { type ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import { AllExceptionFilter } from './exception.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  new AllExceptionFilter().catch(exception as Error, host);
  return { status: status.mock.calls[0][0] as number, body: json.mock.calls[0][0] as Record<string, unknown> };
}
const dbFailure = (code: string, extra: object = {}) =>
  Object.assign(new Error('insert failed: secret SQL here'), { driverError: { code, ...extra } });

describe('AllExceptionFilter', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['23502', 400, 9101, { column: 'name' }, 'A required value is missing (name)'],
    ['23514', 400, 9102, { constraint: 'CK_x' }, 'A value is outside the allowed range'],
    ['23505', 409, 9103, { constraint: 'UQ_x' }, 'This value already exists'],
    ['23503', 409, 9104, { constraint: 'FK_x' }, 'This record conflicts with related data'],
  ])('maps database integrity violation %s to HTTP %i with error code %i and no SQL in the message', (code, status, errorCode, extra, message) => {
    const result = run(dbFailure(code, extra));

    expect(result).toEqual({ status, body: { statusCode: status, errorCode, message } });
  });

  it('still answers 500 without details for other database or unknown errors', () => {
    for (const exception of [dbFailure('40P01'), dbFailure('22P02'), new Error('boom')]) {
      expect(run(exception)).toEqual({ status: 500, body: { statusCode: 500, message: 'Internal server error' } });
    }
  });

  it('keeps the body of HTTP exceptions', () => {
    expect(run(new BadRequestException('bad'))).toMatchObject({ status: 400, body: { message: 'bad' } });
  });
});
