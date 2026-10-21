import { applyTestEnv } from './test-env';

applyTestEnv();

// Chặn mạng ra ngoài; test cần giả dịch vụ ngoài thì jest.spyOn(globalThis, 'fetch')
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`Outbound network is disabled in flow tests (fetch ${String(input)}). Mock it with jest.spyOn(globalThis, 'fetch').`);
}) as typeof fetch;
