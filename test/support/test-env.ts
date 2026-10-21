import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

/** File cấu hình flow test ở root repo — nơi duy nhất người dùng chỉnh (xem chú thích trong file) */
export const TEST_ENV_FILE = resolve(__dirname, '../../.env.test');

/** Giá trị mặc định khi `.env.test` thiếu khoá; trùng với giá trị trong file `.env.test` đi kèm repo */
const DEFAULTS = {
  POSTGRES_HOST: '127.0.0.1',
  POSTGRES_PORT: '55432',
  POSTGRES_USERNAME: 'test',
  POSTGRES_PASSWORD: 'test',
  POSTGRES_DATABASE: 'clothes_shop_test',
  JWT_SECRET: 'flow-test-jwt-secret',
  SEPAY_RECEIVING_BANK_CODE: 'VCB',
  SEPAY_RECEIVING_BANK_NAME: 'Vietcombank',
  SEPAY_RECEIVING_ACCOUNT: '0123456789',
  SEPAY_RECEIVING_ACCOUNT_NAME: 'DOOVAN TEST',
  SEPAY_WEBHOOK_SECRET: 'flow-test-sepay-secret',
  PAYMENT_TRANSFER_PREFIX: 'DH',
};

/**
 * Dịch vụ ngoài luôn rỗng, KHÔNG cấu hình được: `.env` của máy dev có thể chứa khoá thật, flow test không bao giờ được dùng
 * (ConfigModule không ghi đè biến đã có, nên gán rỗng ở đây là đủ).
 */
const EXTERNAL_SERVICE_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_STORAGE_BUCKET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'STORAGE_URL',
] as const;

function readTestEnvFile(): Record<string, string> {
  let content: string;
  try {
    content = readFileSync(TEST_ENV_FILE, 'utf8');
  } catch {
    return {}; // không có file: dùng mặc định
  }
  const values = parse(content);

  const forbidden = EXTERNAL_SERVICE_KEYS.filter((key) => key in values);
  if (forbidden.length) {
    throw new Error(
      `${TEST_ENV_FILE}: ${forbidden.join(', ')} cannot be configured for flow tests (they are always blank and the network is blocked). Remove them.`,
    );
  }
  const unknown = Object.keys(values).filter((key) => !(key in DEFAULTS));
  if (unknown.length) {
    throw new Error(`${TEST_ENV_FILE}: unknown key(s) ${unknown.join(', ')}. Allowed: ${Object.keys(DEFAULTS).join(', ')}.`);
  }
  return values;
}

/** Thứ tự ưu tiên: `.env.test` > mặc định trong code; dịch vụ ngoài luôn rỗng */
export const TEST_ENV = {
  ...DEFAULTS,
  ...readTestEnvFile(),
  ...Object.fromEntries(EXTERNAL_SERVICE_KEYS.map((key) => [key, ''])),
} as typeof DEFAULTS & Record<(typeof EXTERNAL_SERVICE_KEYS)[number], ''>;

/** Gán thẳng vào `process.env`: thắng `.env` của app (ConfigModule không ghi đè biến đã có), kể cả khi `.env` trỏ DB thật */
export function applyTestEnv(): void {
  Object.assign(process.env, TEST_ENV);
  assertTestDatabase();
}

/** Chốt chặn: flow test xoá schema và truncate bảng, nên chỉ được chạy trên DB có tên kết thúc `_test` */
export function assertTestDatabase(): void {
  const database = process.env.POSTGRES_DATABASE ?? '';
  if (!database.endsWith('_test')) {
    throw new Error(`Flow test refuses to run on database "${database}": POSTGRES_DATABASE in .env.test must end with "_test"`);
  }
}
