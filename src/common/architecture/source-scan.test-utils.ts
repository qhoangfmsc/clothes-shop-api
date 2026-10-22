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
