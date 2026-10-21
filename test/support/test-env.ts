/**
 * Biến môi trường của flow test. Gán thẳng vào `process.env` (thắng `.env` vì ConfigModule không ghi đè biến đã có),
 * nên dù máy dev có `.env` trỏ DB thật, flow test vẫn chỉ nói chuyện với DB test.
 */
export const TEST_ENV = {
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
  // Dịch vụ ngoài để rỗng: `.env` của máy dev có thể chứa khoá thật, flow test không bao giờ được dùng (ConfigModule không ghi đè biến đã có)
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  SUPABASE_STORAGE_BUCKET: '',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  STORAGE_URL: '',
} as const;

export function applyTestEnv(): void {
  Object.assign(process.env, TEST_ENV);
  assertTestDatabase();
}

/** Chốt chặn: flow test xoá schema và truncate bảng, nên chỉ được chạy trên DB có tên kết thúc `_test` */
export function assertTestDatabase(): void {
  const database = process.env.POSTGRES_DATABASE ?? '';
  if (!database.endsWith('_test')) {
    throw new Error(`Flow test refuses to run on database "${database}": the name must end with "_test"`);
  }
}
