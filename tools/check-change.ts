import { spawnSync } from 'node:child_process';
import { checkChange } from './lib/change-checks';
import { ROOT } from './lib/fs';

/**
 * yarn check:change [--base <ref>]
 * Kỷ luật thay đổi trên PR (docs/specs/common/0015): đổi code thì phải đổi test và docs, hoặc có trailer miễn kèm lý do.
 * Exit 1 nếu vi phạm; exit 2 nếu không có ref gốc (clone nông: dùng fetch-depth 0).
 */

const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
const base = baseIndex >= 0 ? args[baseIndex + 1] : 'origin/main';

const git = (...cmd: string[]) => spawnSync('git', cmd, { cwd: ROOT, encoding: 'utf8' });

if (git('rev-parse', '--verify', '--quiet', base).status !== 0) {
  console.error(`check:change: không thấy ref "${base}" (clone nông? dùng fetch-depth: 0 hoặc --base <ref>)`);
  process.exit(2);
}

const changedFiles = git('diff', '--name-only', `${base}...HEAD`).stdout.split('\n').filter(Boolean);
const commitMessages = git('log', `${base}..HEAD`, '--format=%B%x00')
  .stdout.split('\0')
  .filter((m) => m.trim());

const problems = checkChange({ changedFiles, commitMessages });
if (problems.length === 0) {
  console.log(`check:change OK (${changedFiles.length} file đổi so với ${base})`);
} else {
  for (const p of problems) console.log(`[${p.check}] ${p.message}`);
  console.log(`\ncheck:change: ${problems.length} vấn đề`);
  process.exit(1);
}
