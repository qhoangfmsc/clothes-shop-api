import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { buildRequestLog, RequestLogMiddleware, type RequestLogSource } from './request-log.middleware';

const source = (over: Partial<RequestLogSource> = {}): RequestLogSource => ({
  method: 'GET',
  originalUrl: '/api/orders/abc123?token=secret-token&page=2',
  ip: '10.0.0.7',
  headers: { 'x-request-id': 'req-1', authorization: 'Bearer very-secret' },
  ...over,
});

describe('buildRequestLog', () => {
  it('keeps a fixed set of fields', () => {
    const entry = buildRequestLog(source({ route: { path: '/api/orders/:orderId' }, user: { id: 'u1' } }), 200, 12);

    expect(entry).toEqual({
      event: 'request',
      requestId: 'req-1',
      method: 'GET',
      path: '/api/orders/abc123',
      route: '/api/orders/:orderId',
      status: 200,
      durationMs: 12,
      ip: '10.0.0.7',
      userId: 'u1',
    });
  });

  it('drops the query string and never carries headers, tokens or bodies', () => {
    const text = JSON.stringify(buildRequestLog(source(), 200, 1));

    expect(text).not.toContain('secret-token');
    expect(text).not.toContain('very-secret');
    expect(text).not.toContain('page=2');
  });

  it('uses null for what is unknown (anonymous caller, no matched route, no request id)', () => {
    const entry = buildRequestLog(source({ headers: {}, ip: undefined }), 404, 3);

    expect(entry).toMatchObject({ requestId: null, route: null, userId: null, ip: null, status: 404 });
  });
});

describe('RequestLogMiddleware', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const request = (url: string, statusCode: number) => {
    const res = Object.assign(new EventEmitter(), { statusCode });
    const next = jest.fn();
    new RequestLogMiddleware().use({ ...source({ originalUrl: url }) } as never, res as never, next);
    res.emit('finish');
    return next;
  };

  it('lets the request through and writes one line when the response finishes', () => {
    const next = request('/api/products?limit=5', 200);

    expect(next).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatchObject({ event: 'request', path: '/api/products', status: 200, durationMs: expect.any(Number) });
  });

  it('writes nothing before the response finishes', () => {
    const res = Object.assign(new EventEmitter(), { statusCode: 200 });

    new RequestLogMiddleware().use(source() as never, res as never, jest.fn());

    expect(log).not.toHaveBeenCalled();
  });

  it.each([
    [200, 'log'],
    [302, 'log'],
    [404, 'warn'],
    [429, 'warn'],
    [500, 'error'],
    [503, 'error'],
  ])('logs status %i at level %s', (status, level) => {
    request('/api/x', status);

    const spies = { log, warn, error } as Record<string, jest.SpyInstance>;
    expect(spies[level]).toHaveBeenCalledTimes(1);
    expect(Object.values(spies).filter((spy) => spy.mock.calls.length > 0)).toHaveLength(1);
  });

  it.each(['/', '/health', '/health?probe=1'])('does not log the platform probe %s', (url) => {
    request(url, 200);

    expect(log).not.toHaveBeenCalled();
  });
});
