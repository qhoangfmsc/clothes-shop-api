import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const ROOT = resolve(__dirname, '../../..');

/** Đường dẫn tương đối từ root repo, dùng `/` để so khớp allowlist */
export const rel = (file: string) => relative(ROOT, file).split('\\').join('/');

export function listFiles(dir: string, filter: (file: string) => boolean = () => true): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = join(ROOT, dir, name);
    if (statSync(path).isDirectory()) out.push(...listFiles(join(dir, name), filter));
    else if (filter(rel(path))) out.push(rel(path));
  }
  return out.sort();
}

export const isSource = (file: string) => file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.endsWith('.test-utils.ts');

export const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

export function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export const count = (pattern: RegExp, text: string) => [...text.matchAll(pattern)].length;

/** So số vi phạm thực tế với allowlist: mới/tăng → lỗi; giảm mà allowlist chưa giảm → lỗi nhắc cập nhật */
export function compareToAllowlist(actual: Record<string, number>, allowed: Record<string, number>, what: string): string[] {
  const problems: string[] = [];
  for (const [file, n] of Object.entries(actual)) {
    if (!(file in allowed)) problems.push(`${file}: ${n} ${what} (mới, không được phép)`);
    else if (n > allowed[file]) problems.push(`${file}: ${what} tăng từ ${allowed[file]} lên ${n}`);
  }
  for (const [file, n] of Object.entries(allowed)) {
    const now = actual[file] ?? 0;
    if (now < n)
      problems.push(`${file}: còn ${now} ${what} nhưng allowlist ghi ${n} — ${now ? `giảm allowlist xuống ${now}` : 'xoá khỏi allowlist'}`);
  }
  return problems;
}
