// setupFiles: chạy trước mỗi file flow, trước khi bất kỳ module nào của app được import
import { applyTestEnv } from './test-env';

applyTestEnv();

/**
 * Chặn mọi cuộc gọi mạng ra ngoài (Supabase, Google...): flow test phải hermetic. Test cần giả dịch vụ ngoài thì
 * `jest.spyOn(globalThis, 'fetch')` trong chính test đó.
 */
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`Outbound network is disabled in flow tests (fetch ${String(input)}). Mock it with jest.spyOn(globalThis, 'fetch').`);
}) as typeof fetch;
