import type { Client } from 'pg';

/** Đóng kết nối để nhả khoá advisory. */
export default async function globalTeardown(): Promise<void> {
  await (globalThis as { __flowRunLock?: Client }).__flowRunLock?.end();
}
