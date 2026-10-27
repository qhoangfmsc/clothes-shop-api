import { dirname, join, normalize } from 'node:path/posix';
import type { SourceFile } from './fs';

const MODULES_DIR = 'src/modules';
const isTestFile = (path: string) => path.endsWith('.spec.ts') || path.endsWith('.test-utils.ts');

/** Module sở hữu một đường dẫn `src/modules/<m>/...`, hoặc null */
export function moduleOf(path: string): string | null {
  const match = new RegExp(`^${MODULES_DIR}/([^/]+)/`).exec(path);
  return match ? match[1] : null;
}

export function listModules(files: SourceFile[]): string[] {
  return [...new Set(files.map((file) => moduleOf(file.path)).filter((m): m is string => m !== null))].sort();
}

/** Đồ thị import: module → các module nó import (bỏ qua spec/test-utils). Cạnh suy ra từ code nên không lệch theo thời gian. */
export function buildModuleGraph(files: SourceFile[]): Record<string, string[]> {
  const modules = new Set(listModules(files));
  const graph: Record<string, Set<string>> = Object.fromEntries([...modules].map((m) => [m, new Set<string>()]));

  for (const file of files) {
    const owner = moduleOf(file.path);
    if (!owner || isTestFile(file.path)) continue;
    for (const [, specifier] of file.content.matchAll(/from\s+'([^']+)'/g)) {
      let target: string | null = null;
      if (specifier.startsWith('@/')) target = join(MODULES_DIR, specifier.slice(2));
      else if (specifier.startsWith('.')) target = normalize(join(dirname(file.path), specifier));
      if (!target) continue;
      const dep = moduleOf(`${target}/`);
      if (dep && dep !== owner && modules.has(dep)) graph[owner].add(dep);
    }
  }
  return Object.fromEntries(Object.entries(graph).map(([m, deps]) => [m, [...deps].sort()]));
}

export interface RoutePrefix {
  /** Dạng `/api/admin/orders` */
  prefix: string;
  module: string;
}

/** Tiền tố route của mỗi controller (`@Controller('api/orders')` → `/api/orders`) gắn với module chứa nó */
export function routePrefixes(files: SourceFile[]): RoutePrefix[] {
  const found = new Map<string, string>();
  for (const file of files) {
    const owner = moduleOf(file.path);
    if (!owner || !file.path.endsWith('.controller.ts')) continue;
    for (const [, path] of file.content.matchAll(/@Controller\(\s*'([^']+)'\s*\)/g)) {
      if (path) found.set(`/${path.replace(/^\/+|\/+$/g, '')}`, owner);
    }
  }
  return [...found].map(([prefix, module]) => ({ prefix, module })).sort((a, b) => b.prefix.length - a.prefix.length);
}

/** Module sở hữu một URL (khớp tiền tố dài nhất theo ranh giới đoạn) */
export function moduleOfUrl(url: string, prefixes: RoutePrefix[]): string | null {
  const clean = url.split('?')[0].replace(/\/+$/, '');
  for (const { prefix, module } of prefixes) {
    if (clean === prefix || clean.startsWith(`${prefix}/`)) return module;
  }
  return null;
}

export interface FlowFile extends SourceFile {
  /** Nội dung các file hỗ trợ cùng thư mục (steps) mà flow này dùng chung */
  helpers: string;
}

/** Flow kiểm toàn hệ thống (bảng route–quyền, ma trận 401/403, rate limit, health): không thuộc module nào, chạy mỗi khi có thay đổi runtime */
export const GLOBAL_FLOW_DIRS = ['access', 'rate-limit', 'health', 'migration'];

/** Flow → các module nó gọi qua HTTP (theo URL xuất hiện trong flow và file `steps` cùng thư mục) */
export function flowModules(flows: FlowFile[], prefixes: RoutePrefix[], modules: string[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const flow of flows) {
    const hit = new Set<string>();
    const dir = flow.path.split('/').slice(-2, -1)[0];
    if (GLOBAL_FLOW_DIRS.includes(dir)) {
      result[flow.path] = [];
      continue;
    }
    for (const [, url] of `${flow.content}\n${flow.helpers}`.matchAll(/['"`](\/(?:api|health)[^'"`\s$?{]*)/g)) {
      const module = moduleOfUrl(url, prefixes);
      if (module) hit.add(module);
    }
    if (modules.includes(dir)) hit.add(dir);
    result[flow.path] = [...hit].sort();
  }
  return result;
}
