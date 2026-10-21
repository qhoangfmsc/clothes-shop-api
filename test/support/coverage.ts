import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizePath } from './route-path';

export type Kind = 'success' | 'error';
export interface RouteRef {
  key: string;
  isPublic: boolean;
}

const COVERAGE_DIR = resolve(__dirname, '../.coverage');
const REQUESTS_FILE = resolve(COVERAGE_DIR, 'requests.jsonl');
const ROUTES_FILE = resolve(COVERAGE_DIR, 'routes.json');

export const routeKeyOf = (method: string, path: string) => `${method.toUpperCase()} ${normalizePath(path)}`;

export function resetCoverage(): void {
  rmSync(COVERAGE_DIR, { recursive: true, force: true });
  mkdirSync(COVERAGE_DIR, { recursive: true });
}

export function recordRequest(method: string, path: string, status: number): void {
  appendFileSync(REQUESTS_FILE, `${JSON.stringify({ key: routeKeyOf(method, path), status })}\n`);
}

export function writeRouteTable(routes: RouteRef[]): void {
  mkdirSync(COVERAGE_DIR, { recursive: true });
  writeFileSync(ROUTES_FILE, JSON.stringify(routes));
}

export function readRouteTable(): RouteRef[] {
  return JSON.parse(readFileSync(ROUTES_FILE, 'utf8'));
}

export function readRecordedRequests(): { key: string; status: number }[] {
  try {
    return readFileSync(REQUESTS_FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

// Status 401/403 của route cần đăng nhập là kết quả của guard (ma trận auth đã kiểm), không phải ca lỗi nghiệp vụ
const isSuccess = (status: number) => status >= 200 && status < 400;
const isBusinessError = (status: number, route: RouteRef) => status >= 400 && (route.isPublic || (status !== 401 && status !== 403));

/** Với mỗi route chưa đủ ca: thiếu `success` và/hoặc `error`, theo thứ tự route; route đủ ca không có trong kết quả. */
export function computeMissing(
  routes: RouteRef[],
  requests: { key: string; status: number }[],
  exempt: Record<string, Partial<Record<Kind, string>>> = {},
): Map<string, Kind[]> {
  const statusesByRoute = new Map<string, number[]>();
  for (const { key, status } of requests) statusesByRoute.set(key, [...(statusesByRoute.get(key) ?? []), status]);

  const missing = new Map<string, Kind[]>();
  for (const route of routes) {
    const statuses = statusesByRoute.get(route.key) ?? [];
    const kinds: Kind[] = [];
    if (!statuses.some(isSuccess) && !exempt[route.key]?.success) kinds.push('success');
    if (!statuses.some((status) => isBusinessError(status, route)) && !exempt[route.key]?.error) kinds.push('error');
    if (kinds.length) missing.set(route.key, kinds);
  }
  return missing;
}
