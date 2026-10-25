import { spawnSync } from 'node:child_process';
import { formatImpact } from './lib/format-impact';
import { ROOT, readTree } from './lib/fs';
import { computeImpact } from './lib/impact';
import { buildModuleGraph, type FlowFile, flowModules, listModules, routePrefixes } from './lib/source-graph';

/**
 * yarn impact [--base <ref>] [--files a,b] [--run unit|flows|all] [--json]
 * Suy ra module/flow bị ảnh hưởng từ git diff (docs/specs/common/0014). Gợi ý cho vòng lặp phát triển; cổng cuối vẫn chạy toàn bộ.
 */

const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const git = (...cmd: string[]) => {
  const result = spawnSync('git', cmd, { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.split('\n').filter(Boolean) : null;
};

function defaultBase(): string {
  for (const ref of ['main', 'origin/main']) if (git('rev-parse', '--verify', '--quiet', ref)) return ref;
  return 'HEAD~1';
}

function changedFiles(): string[] {
  const explicit = option('files');
  if (explicit) return explicit.split(',').map((file) => file.trim());
  const base = option('base') ?? defaultBase();
  const committed = git('diff', '--name-only', `${base}...HEAD`) ?? [];
  const working = git('diff', '--name-only', 'HEAD') ?? [];
  const untracked = git('ls-files', '--others', '--exclude-standard') ?? [];
  return [...new Set([...committed, ...working, ...untracked])].sort();
}

const sources = readTree('src', (path) => path.endsWith('.ts'));
const graph = buildModuleGraph(sources);
const prefixes = routePrefixes(sources);
const flowFiles: FlowFile[] = readTree('test/flows', (path) => path.endsWith('.ts'))
  .filter((file) => file.path.endsWith('.flow.ts'))
  .map((flow) => {
    const dir = flow.path.split('/').slice(0, -1).join('/');
    const helpers = readTree(
      dir,
      (path) => path.endsWith('.ts') && !path.endsWith('.flow.ts') && path.split('/').slice(0, -1).join('/') === dir,
    );
    return { ...flow, helpers: helpers.map((helper) => helper.content).join('\n') };
  });
const flows = flowModules(flowFiles, prefixes, listModules(sources));

const report = computeImpact({ changedFiles: changedFiles(), graph, flows });

if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
else console.log(formatImpact(report, Object.keys(flows).length));

const run = option('run');
if (run) {
  const env = { ...process.env, NODE_OPTIONS: '--experimental-vm-modules' };
  const exec = (cmd: string, cmdArgs: string[]) => spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', env }).status ?? 1;
  let status = 0;
  if (run === 'unit' || run === 'all') {
    console.log('\n> Unit test của module bị ảnh hưởng');
    const dirs = report.unitDirs.map((dir) => dir.replace(/^src\//, ''));
    status ||= exec('npx', ['jest', '--forceExit', ...dirs]);
  }
  if ((run === 'flows' || run === 'all') && report.flows.length) {
    console.log('\n> Flow test bị ảnh hưởng (cần Docker; bật DB bằng yarn test:db:up)');
    status ||=
      exec('yarn', ['test:db:up']) ||
      exec('npx', ['jest', '--config', 'test/jest.flows.config.js', '--runInBand', '--forceExit', ...report.flows]);
  }
  process.exit(status);
}
