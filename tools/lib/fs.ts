import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const ROOT = resolve(__dirname, '../..');

export interface SourceFile {
  /** Đường dẫn từ root repo, dùng `/` */
  path: string;
  content: string;
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.coverage']);

export function readTree(dir: string, accept: (path: string) => boolean): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const path = relative(ROOT, full).split('\\').join('/');
        if (accept(path)) out.push({ path, content: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(join(ROOT, dir));
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
