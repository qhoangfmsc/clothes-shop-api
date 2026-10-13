import { createHmac } from 'node:crypto';
import { verifySepaySignature } from './sepay-signature.util';

const SECRET = 'test-secret';
const NOW_MS = 1_800_000_000_000;
const NOW_S = String(NOW_MS / 1000);
const body = Buffer.from('{"id":92704,"transferAmount":5000000}');

const sign = (timestamp: string, raw: Buffer, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), raw]))
    .digest('hex')}`;

const verify = (over: Partial<Parameters<typeof verifySepaySignature>[0]> = {}) =>
  verifySepaySignature({
    secret: SECRET,
    rawBody: body,
    signatureHeader: sign(NOW_S, body),
    timestampHeader: NOW_S,
    nowMs: NOW_MS,
    ...over,
  });

describe('verifySepaySignature', () => {
  it('accepts a correctly signed request', () => {
    expect(verify()).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verify({ rawBody: Buffer.from('{"id":92704,"transferAmount":1}') })).toBe(false);
  });

  it('rejects a signature made with another secret', () => {
    expect(verify({ signatureHeader: sign(NOW_S, body, 'other') })).toBe(false);
  });

  it('rejects a signature that does not bind the timestamp', () => {
    expect(verify({ signatureHeader: sign('1', body) })).toBe(false);
  });

  it('rejects missing headers or secret', () => {
    expect(verify({ signatureHeader: undefined })).toBe(false);
    expect(verify({ timestampHeader: undefined })).toBe(false);
    expect(verify({ secret: '' })).toBe(false);
  });

  it('rejects signatures without the sha256= prefix, with wrong length, or non-hex garbage', () => {
    expect(verify({ signatureHeader: sign(NOW_S, body).slice('sha256='.length) })).toBe(false);
    expect(verify({ signatureHeader: 'sha256=abc' })).toBe(false);
    expect(verify({ signatureHeader: `sha256=${'z'.repeat(64)}` })).toBe(false);
  });

  it('rejects a non-numeric timestamp', () => {
    expect(verify({ timestampHeader: 'abc', signatureHeader: sign('abc', body) })).toBe(false);
  });

  it('enforces the ±300s replay window (boundary inclusive)', () => {
    const old = String(NOW_MS / 1000 - 301);
    const edge = String(NOW_MS / 1000 - 300);
    const future = String(NOW_MS / 1000 + 301);
    expect(verify({ timestampHeader: old, signatureHeader: sign(old, body) })).toBe(false);
    expect(verify({ timestampHeader: future, signatureHeader: sign(future, body) })).toBe(false);
    expect(verify({ timestampHeader: edge, signatureHeader: sign(edge, body) })).toBe(true);
  });

  it('uses the first value when a header arrives as an array', () => {
    expect(verify({ signatureHeader: [sign(NOW_S, body), 'x'], timestampHeader: [NOW_S] })).toBe(true);
  });
});
