import { readdirSync } from 'node:fs';
import { checkDocs, type Snapshot } from './lib/docs-checks';
import { ROOT, readTree } from './lib/fs';

/**
 * yarn check:docs [--strict]
 * Đối chiếu docs, spec, test matrix với code (docs/specs/common/0015). Exit 1 nếu có vi phạm.
 */

const TEXT = (path: string) => path.endsWith('.md') || path.endsWith('.controller.ts');

export function buildSnapshot(): Snapshot {
  const text: Record<string, string> = {};
  const paths = new Set<string>();
  for (const dir of ['src', 'test', 'docs', 'tools', '.claude', '.github', '.husky', 'scripts']) {
    try {
      for (const file of readTree(dir, () => true)) {
        paths.add(file.path);
        if (TEXT(file.path)) text[file.path] = file.content;
      }
    } catch {
      // thư mục chưa tồn tại
    }
  }
  for (const entry of readdirSync(ROOT)) if (entry !== 'node_modules' && entry !== 'dist' && entry !== '.git') paths.add(entry);
  for (const root of ['CLAUDE.md', 'README.md']) {
    try {
      const file = readTree('.', (path) => path === root)[0];
      if (file) {
        paths.add(file.path);
        text[file.path] = file.content;
      }
    } catch {
      // bỏ qua
    }
  }
  for (const path of [...paths]) for (let dir = path.split('/').slice(0, -1); dir.length; dir = dir.slice(0, -1)) paths.add(dir.join('/'));
  return { text, paths };
}

if (require.main === module) {
  const strict = process.argv.includes('--strict');
  const problems = checkDocs(buildSnapshot(), { strict });
  if (problems.length === 0) {
    console.log(`check:docs OK${strict ? ' (strict)' : ''}`);
  } else {
    for (const check of [...new Set(problems.map((p) => p.check))].sort()) {
      console.log(`\n[${check}]`);
      for (const p of problems.filter((x) => x.check === check)) console.log(`  - ${p.message}`);
    }
    console.log(`\ncheck:docs: ${problems.length} vấn đề`);
    process.exit(1);
  }
}
