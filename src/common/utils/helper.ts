export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format an error for logging. Includes err.cause when present (e.g. Node.js fetch TypeError
 * wraps the real reason — ECONNREFUSED, ENOTFOUND — inside err.cause).
 */
export function formatError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  const causeStr = cause ? ` | cause: ${cause instanceof Error ? cause.message : String(cause)}` : '';
  return `${err.message}${causeStr}`;
}
