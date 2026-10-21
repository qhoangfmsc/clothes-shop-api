import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

export const TEST_ENV_FILE = resolve(__dirname, '../../.env.test');

// Kết nối Postgres test: cấu hình được ở .env.test
const POSTGRES_DEFAULTS = {
  POSTGRES_HOST: '127.0.0.1',
  POSTGRES_PORT: '55432',
  POSTGRES_USERNAME: 'test',
  POSTGRES_PASSWORD: 'test',
  POSTGRES_DATABASE: 'clothes_shop_test',
};

// Giá trị giả cố định của test, không cấu hình
const FIXED = {
  JWT_SECRET: 'flow-test-jwt-secret',
  SEPAY_RECEIVING_BANK_CODE: 'VCB',
  SEPAY_RECEIVING_BANK_NAME: 'Vietcombank',
  SEPAY_RECEIVING_ACCOUNT: '0123456789',
  SEPAY_RECEIVING_ACCOUNT_NAME: 'DOOVAN TEST',
  SEPAY_WEBHOOK_SECRET: 'flow-test-sepay-secret',
  PAYMENT_TRANSFER_PREFIX: 'DH',
};

// Luôn rỗng: `.env` của máy dev có thể chứa khoá thật
const EXTERNAL_SERVICE_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_STORAGE_BUCKET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
] as const;

function readPostgresOverrides(): Record<string, string> {
  let content: string;
  try {
    content = readFileSync(TEST_ENV_FILE, 'utf8');
  } catch {
    return {};
  }
  const values = parse(content);
  const unknown = Object.keys(values).filter((key) => !(key in POSTGRES_DEFAULTS));
  if (unknown.length) {
    throw new Error(
      `${TEST_ENV_FILE}: unknown key(s) ${unknown.join(', ')}. Only ${Object.keys(POSTGRES_DEFAULTS).join(', ')} can be set.`,
    );
  }
  return values;
}

export const TEST_ENV = {
  ...POSTGRES_DEFAULTS,
  ...readPostgresOverrides(),
  ...FIXED,
  ...(Object.fromEntries(EXTERNAL_SERVICE_KEYS.map((key) => [key, ''])) as Record<(typeof EXTERNAL_SERVICE_KEYS)[number], ''>),
};

// Gán thẳng vào process.env để thắng `.env` của app
export function applyTestEnv(): void {
  Object.assign(process.env, TEST_ENV);
  assertTestDatabase();
}

// Chặn xoá nhầm DB thật: flow test drop schema và truncate bảng
export function assertTestDatabase(): void {
  const database = process.env.POSTGRES_DATABASE ?? '';
  if (!database.endsWith('_test')) {
    throw new Error(`Flow test refuses to run on database "${database}": POSTGRES_DATABASE in .env.test must end with "_test"`);
  }
}
