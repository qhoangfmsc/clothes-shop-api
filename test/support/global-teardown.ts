import type { Client } from 'pg';

/** Đóng kết nối giữ khoá advisory của `global-setup` → nhả khoá cho lần chạy sau */
export default async function globalTeardown(): Promise<void> {
  await (globalThis as { __flowRunLock?: Client }).__flowRunLock?.end();
}
