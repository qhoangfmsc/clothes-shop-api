import { moduleOf } from './source-graph';

export interface ImpactInput {
  changedFiles: string[];
  /** module → các module nó import */
  graph: Record<string, string[]>;
  /** flow file → các module nó gọi qua HTTP (rỗng = flow toàn cục như access, health, rate-limit) */
  flows: Record<string, string[]>;
}

export interface ImpactReport {
  /** Module có file bị đổi (kể cả chỉ đổi spec) */
  changed: string[];
  /** Module import trực tiếp module đã đổi (độ sâu 1) */
  direct: string[];
  /** Module phụ thuộc gián tiếp (độ sâu ≥ 2) */
  transitive: string[];
  /** Đổi hạ tầng dùng chung hoặc schema: mọi module bị ảnh hưởng */
  everything: boolean;
  reasons: string[];
  /** Docs phải cập nhật (module đã đổi, common.md khi đổi hạ tầng/migration) */
  docsToUpdate: string[];
  /** Docs cần rà lại (module bị ảnh hưởng gián tiếp) */
  docsToReview: string[];
  unitDirs: string[];
  flows: string[];
}

const ALWAYS_UNIT_DIR = 'src/common';
const isTest = (path: string) => path.endsWith('.spec.ts') || path.endsWith('.test-utils.ts');
const isDocsOnly = (path: string) =>
  path.startsWith('docs/') ||
  path.startsWith('.claude/') ||
  path.startsWith('.github/') ||
  path.startsWith('tools/') ||
  path.endsWith('.md');

type Scope =
  | { kind: 'module'; module: string; testOnly: boolean }
  | { kind: 'everything'; reason: string }
  | { kind: 'flows'; reason: string }
  | { kind: 'unitOnly'; dir: string }
  | { kind: 'none' };

function classify(path: string): Scope {
  const module = moduleOf(path);
  if (module) return { kind: 'module', module, testOnly: isTest(path) };
  if (isDocsOnly(path)) return { kind: 'none' };
  if (isTest(path) && path.startsWith('src/'))
    return { kind: 'unitOnly', dir: path.startsWith('src/common/') ? ALWAYS_UNIT_DIR : path.split('/').slice(0, 3).join('/') };
  if (path.startsWith('src/migrations/') || path === 'data-source.ts')
    return { kind: 'everything', reason: `${path}: đổi schema, ảnh hưởng mọi module` };
  if (path.startsWith('src/common/') || path.startsWith('src/core/') || /^src\/main[.-]/.test(path) || path === 'src/main.ts')
    return { kind: 'everything', reason: `${path}: hạ tầng dùng chung, ảnh hưởng mọi module` };
  if (path.startsWith('test/flows/')) return { kind: 'flows', reason: path };
  if (path.startsWith('test/')) return { kind: 'flows', reason: `${path}: hạ tầng test, chạy lại mọi flow` };
  return { kind: 'everything', reason: `${path}: cấu hình/phụ thuộc dự án, ảnh hưởng mọi module` };
}

/** Module import (trực tiếp hoặc gián tiếp) các module trong `seeds`, theo độ sâu */
export function dependentsByDepth(graph: Record<string, string[]>, seeds: string[]): string[][] {
  const seen = new Set(seeds);
  const levels: string[][] = [];
  let frontier = seeds;
  while (frontier.length) {
    const next = Object.keys(graph)
      .filter((module) => !seen.has(module) && graph[module].some((dep) => frontier.includes(dep)))
      .sort();
    next.forEach((module) => seen.add(module));
    if (next.length) levels.push(next);
    frontier = next;
  }
  return levels;
}

export function computeImpact({ changedFiles, graph, flows }: ImpactInput): ImpactReport {
  const modules = Object.keys(graph).sort();
  const changed = new Set<string>();
  const changedFlows = new Set<string>();
  const reasons: string[] = [];
  const extraUnitDirs = new Set<string>();
  let everything = false;
  let allFlows = false;
  let structuralDocs = false;

  for (const path of changedFiles) {
    const scope = classify(path);
    if (scope.kind === 'module') changed.add(scope.module);
    else if (scope.kind === 'unitOnly') extraUnitDirs.add(scope.dir);
    else if (scope.kind === 'everything') {
      everything = true;
      structuralDocs = true;
      reasons.push(scope.reason);
    } else if (scope.kind === 'flows') {
      if (path.startsWith('test/flows/')) {
        const dir = path.split('/').slice(0, 3).join('/');
        for (const flow of Object.keys(flows)) if (path in flows ? flow === path : flow.startsWith(`${dir}/`)) changedFlows.add(flow);
      } else {
        allFlows = true;
        reasons.push(scope.reason);
      }
    }
  }

  const [directLevel = [], ...deeper] = everything ? [[]] : dependentsByDepth(graph, [...changed]);
  const direct = directLevel;
  const transitive = deeper.flat().sort();
  const affected = everything ? modules : [...new Set([...changed, ...direct, ...transitive])].sort();

  const runtimeChanged = changed.size > 0 || everything || allFlows || changedFlows.size > 0;
  const selected = new Set<string>(changedFlows);
  for (const [flow, hit] of Object.entries(flows)) {
    // flow không gọi module nào (access, health, rate-limit) là lưới toàn cục: chạy mỗi khi có thay đổi runtime
    const global = hit.length === 0 && runtimeChanged;
    if (allFlows || everything || global || hit.some((module) => affected.includes(module))) selected.add(flow);
  }

  return {
    changed: [...changed].sort(),
    direct,
    transitive,
    everything,
    reasons,
    docsToUpdate: [
      ...[...changed].sort().map((module) => `docs/modules/${module}.md`),
      ...(structuralDocs ? ['docs/modules/common.md'] : []),
    ],
    docsToReview: (everything ? [] : [...direct, ...transitive]).map((module) => `docs/modules/${module}.md`),
    unitDirs: [
      ...(runtimeChanged || extraUnitDirs.size ? [ALWAYS_UNIT_DIR] : []),
      ...extraUnitDirs,
      ...(everything ? ['src'] : affected.map((module) => `src/modules/${module}`)),
    ].filter((dir, i, all) => all.indexOf(dir) === i),
    flows: [...selected].sort(),
  };
}
