import { type ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import { AllExceptionFilter } from './exception.filter';

function run(exception: unknown, headers: Record<string, string> = {}) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = { switchToHttp: () => ({ getResponse: () => ({ status }), getRequest: () => ({ headers }) }) } as unknown as ArgumentsHost;
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

  it('logs a 5xx once with the request id so it can be matched with the request log line, and keeps the id out of the response body', () => {
    const result = run(new Error('boom'), { 'x-request-id': 'req-123' });

    const errors = (Logger.prototype.error as jest.Mock).mock.calls;
    expect(errors).toHaveLength(1);
    expect(errors[0][0]).toContain('requestId=req-123');
    expect(JSON.stringify(result.body)).not.toContain('req-123');
  });

  it('logs integrity violations with the request id, and marks a missing id with a dash', () => {
    run(dbFailure('23505', { constraint: 'UQ_x' }), { 'x-request-id': 'req-9' });
    run(dbFailure('23505', { constraint: 'UQ_x' }));

    const warns = (Logger.prototype.warn as jest.Mock).mock.calls.map(([message]) => message as string);
    expect(warns[0]).toContain('requestId=req-9');
    expect(warns[1]).toContain('requestId=-');
  });

  it('does not log client errors as errors', () => {
    run(new BadRequestException('bad'), { 'x-request-id': 'req-1' });

    expect(Logger.prototype.error).not.toHaveBeenCalled();
  });
});
