import { DEFAULT_JWT_SECRET } from '../common/constants/security.constant';
import { validateEnv, validateEnvForConfigModule } from './env.validation';

const STRONG_SECRET = 'x'.repeat(40);
const production = (overrides: Record<string, unknown> = {}) => ({
  NODE_ENV: 'production',
  JWT_SECRET: STRONG_SECRET,
  POSTGRES_HOST: 'db.internal',
  POSTGRES_USERNAME: 'shop',
  POSTGRES_PASSWORD: 'db-password-1',
  POSTGRES_DATABASE: 'shop',
  CORS_ORIGINS: 'https://shop.example.com,https://admin.example.com',
  GOOGLE_CLIENT_ID: 'client-id',
  SEPAY_WEBHOOK_SECRET: 'whsec',
  SEPAY_RECEIVING_ACCOUNT: '0123456789',
  ...overrides,
});
const message = (config: Record<string, unknown>) => {
  try {
    validateEnv(config);
  } catch (error) {
    return (error as Error).message;
  }
  return null;
};

describe('validateEnv', () => {
  it('accepts a complete production configuration and returns it untouched', () => {
    const config = production();

    expect(validateEnv(config)).toBe(config);
  });

  it.each([undefined, 'development', 'test'])('does not require anything else when NODE_ENV is %s', (env) => {
    expect(message({ NODE_ENV: env })).toBeNull();
    expect(message({ NODE_ENV: env, JWT_SECRET: DEFAULT_JWT_SECRET })).toBeNull();
  });

  it.each([
    ['missing', undefined, 'JWT_SECRET: bắt buộc'],
    ['blank', '   ', 'JWT_SECRET: bắt buộc'],
    ['the source default', DEFAULT_JWT_SECRET, 'JWT_SECRET: đang dùng giá trị mặc định'],
    ['too short', 'a'.repeat(31), 'JWT_SECRET: tối thiểu 32'],
  ])('refuses a production JWT secret that is %s', (_name, secret, expected) => {
    expect(message(production({ JWT_SECRET: secret }))).toContain(expected);
  });

  it('accepts a secret of exactly the minimum length', () => {
    expect(message(production({ JWT_SECRET: 'a'.repeat(32) }))).toBeNull();
  });

  it.each([
    'POSTGRES_HOST',
    'POSTGRES_USERNAME',
    'POSTGRES_PASSWORD',
    'POSTGRES_DATABASE',
    'GOOGLE_CLIENT_ID',
    'SEPAY_WEBHOOK_SECRET',
    'SEPAY_RECEIVING_ACCOUNT',
    'CORS_ORIGINS',
  ])('refuses production without %s', (key) => {
    expect(message(production({ [key]: '' }))).toContain(`${key}: bắt buộc`);
    expect(message(production({ [key]: undefined }))).toContain(`${key}: bắt buộc`);
  });

  it.each(['localhost:3000', 'ftp://shop.example.com', 'https://ok.example.com,not a url'])('refuses CORS_ORIGINS %s', (origins) => {
    expect(message(production({ CORS_ORIGINS: origins }))).toContain('CORS_ORIGINS: mỗi origin');
  });

  it('lists every problem at once', () => {
    const text = message(production({ JWT_SECRET: 'short', POSTGRES_PASSWORD: '', CORS_ORIGINS: undefined })) as string;

    expect(text).toContain('JWT_SECRET');
    expect(text).toContain('POSTGRES_PASSWORD');
    expect(text).toContain('CORS_ORIGINS');
  });

  it('never prints a secret value', () => {
    const text = message(production({ JWT_SECRET: 'tooshortsecret', POSTGRES_PASSWORD: '' })) as string;

    expect(text).not.toContain('tooshortsecret');
    expect(text).not.toContain(STRONG_SECRET);
  });

  it.each(['PORT', 'POSTGRES_PORT'])('refuses a %s that is not a port in any environment', (key) => {
    for (const value of ['abc', '0', '65536', '80.5', '-1']) expect(message({ [key]: value })).toContain(`${key}: phải là số nguyên`);
    expect(message({ [key]: '7001' })).toBeNull();
    expect(message({ [key]: undefined })).toBeNull();
  });
});

describe('validateEnv rate limit settings', () => {
  it.each([
    'RATE_LIMIT_DEFAULT_PER_MINUTE',
    'RATE_LIMIT_AUTH_PER_MINUTE',
    'RATE_LIMIT_UPLOAD_PER_MINUTE',
  ])('refuses a %s that is not a positive integer', (key) => {
    for (const value of ['0', '-1', '1.5', 'abc']) expect(message({ [key]: value })).toContain(`${key}: phải là số nguyên dương`);
    expect(message({ [key]: '30' })).toBeNull();
  });

  it('refuses a TRUST_PROXY that is not a non-negative integer, and accepts 0 and 1', () => {
    for (const value of ['-1', '1.5', 'yes']) expect(message({ TRUST_PROXY: value })).toContain('TRUST_PROXY: phải là số nguyên không âm');
    expect(message({ TRUST_PROXY: '0' })).toBeNull();
    expect(message({ TRUST_PROXY: '1' })).toBeNull();
  });
});

describe('validateEnvForConfigModule', () => {
  afterEach(() => {
    delete process.env.ONLY_IN_PROCESS_ENV;
  });

  it('returns only what comes from the .env file so that process.env stays live for ConfigService', () => {
    process.env.ONLY_IN_PROCESS_ENV = 'live';

    const kept = validateEnvForConfigModule({ ONLY_IN_PROCESS_ENV: 'live', FROM_ENV_FILE: 'x' });

    expect(kept).toEqual({ FROM_ENV_FILE: 'x' });
  });

  it('still validates the whole configuration', () => {
    expect(() => validateEnvForConfigModule({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });
});
