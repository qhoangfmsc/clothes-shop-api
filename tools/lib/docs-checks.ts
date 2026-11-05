import { moduleOf } from './source-graph';

export interface Snapshot {
  /** Nội dung các file văn bản cần đọc (markdown, controller) theo đường dẫn từ root repo */
  text: Record<string, string>;
  /** Mọi file và thư mục của repo (không có `/` cuối) */
  paths: Set<string>;
}

export interface Problem {
  check: string;
  message: string;
}

export interface CheckOptions {
  /** Trên `main`: spec không được kẹt ở Draft/Approved */
  strict: boolean;
}

const SPEC_STATUSES = ['Draft', 'Approved', 'Implemented', 'Superseded'] as const;
const ROOT_DIRS = ['src', 'test', 'docs', 'tools', 'scripts', '.claude', '.github', '.husky'];

const textFiles = (snapshot: Snapshot, filter: (path: string) => boolean) => Object.keys(snapshot.text).filter(filter).sort();

const problem = (check: string, message: string): Problem => ({ check, message });

/** D1: mỗi module có docs và dòng trong docs/README.md; mỗi docs module có thư mục thật */
export function checkModuleDocs(snapshot: Snapshot): Problem[] {
  const problems: Problem[] = [];
  const modules = [...new Set([...snapshot.paths].map((path) => moduleOf(`${path}/`)).filter((m): m is string => m !== null))].sort();
  const readme = snapshot.text['docs/README.md'] ?? '';
  for (const module of modules) {
    if (!snapshot.paths.has(`docs/modules/${module}.md`))
      problems.push(problem('D1', `src/modules/${module}: thiếu docs/modules/${module}.md`));
    if (!readme.includes(`modules/${module}.md`)) problems.push(problem('D1', `docs/README.md: thiếu dòng cho module ${module}`));
  }
  for (const path of snapshot.paths) {
    const match = /^docs\/modules\/([^/]+)\.md$/.exec(path);
    if (match && match[1] !== 'common' && !modules.includes(match[1]))
      problems.push(problem('D1', `${path}: không có thư mục src/modules/${match[1]}`));
  }
  return problems;
}

interface SpecInfo {
  path: string;
  module: string;
  number: number;
  status: string | null;
}

function readSpecs(snapshot: Snapshot): SpecInfo[] {
  return textFiles(snapshot, (path) => /^docs\/specs\/[^/]+\/\d{4}-[^/]+\.md$/.test(path)).map((path) => {
    const [, module, number] = /^docs\/specs\/([^/]+)\/(\d{4})-/.exec(path) as RegExpExecArray;
    const status = new RegExp(`Trạng thái:\\s*(${SPEC_STATUSES.join('|')})`).exec(snapshot.text[path])?.[1] ?? null;
    return { path, module, number: Number(number), status };
  });
}

/** D2 + D3: spec có trong chỉ mục với đúng trạng thái, số liên tục, Implemented có mục 6 đã điền, và (strict) không kẹt Draft */
export function checkSpecs(snapshot: Snapshot, { strict }: CheckOptions): Problem[] {
  const problems: Problem[] = [];
  const specs = readSpecs(snapshot);
  const index = snapshot.text['docs/specs/README.md'] ?? '';
  const indexed = new Map<string, string>();
  for (const [, path, status] of index.matchAll(/\|\s*[a-z-]+\s*\|\s*\[[^\]]*\]\(([^)]+)\)\s*\|\s*(\w+)\s*\|/g))
    indexed.set(`docs/specs/${path}`, status);

  for (const spec of specs) {
    if (spec.status === null)
      problems.push(problem('D2', `${spec.path}: header thiếu "Trạng thái: Draft|Approved|Implemented|Superseded"`));
    if (!indexed.has(spec.path)) problems.push(problem('D2', `${spec.path}: chưa có trong docs/specs/README.md`));
    else if (spec.status && indexed.get(spec.path) !== spec.status)
      problems.push(problem('D2', `${spec.path}: file ghi ${spec.status} nhưng chỉ mục ghi ${indexed.get(spec.path)}`));
    if (strict && (spec.status === 'Draft' || spec.status === 'Approved'))
      problems.push(problem('D2', `${spec.path}: còn ${spec.status} — hoàn tất (Implemented) hoặc Superseded trước khi vào main`));
    if (spec.status === 'Implemented') {
      const body = snapshot.text[spec.path];
      if (!/^##\s*6\./m.test(body)) problems.push(problem('D3', `${spec.path}: Implemented nhưng thiếu mục "## 6. Kết quả triển khai"`));
      else if (body.slice(body.search(/^##\s*6\./m)).includes('(điền sau khi xong)'))
        problems.push(problem('D3', `${spec.path}: mục 6 còn placeholder`));
    }
  }
  for (const path of indexed.keys())
    if (!snapshot.paths.has(path)) problems.push(problem('D2', `docs/specs/README.md: dòng trỏ tới file không tồn tại ${path}`));

  const byModule = new Map<string, number[]>();
  for (const spec of specs) byModule.set(spec.module, [...(byModule.get(spec.module) ?? []), spec.number]);
  for (const [module, numbers] of byModule) {
    const sorted = [...numbers].sort((a, b) => a - b);
    sorted.forEach((n, i) => {
      if (n !== i + 1) problems.push(problem('D2', `docs/specs/${module}: số spec không liên tục hoặc trùng (${sorted.join(', ')})`));
    });
  }
  return problems;
}

const DOC_SCOPE = (path: string) =>
  path.endsWith('.md') &&
  (path === 'CLAUDE.md' ||
    path === 'README.md' ||
    path === 'test/README.md' ||
    path.startsWith('docs/modules/') ||
    path === 'docs/README.md' ||
    path.startsWith('.claude/rules/') ||
    path.startsWith('.claude/skills/') ||
    path === '.github/pull_request_template.md');

/** D4: liên kết markdown tương đối trỏ đúng file (docs, rule, skill; spec cũng được kiểm vì chúng liên kết nhau) */
export function checkLinks(snapshot: Snapshot): Problem[] {
  const problems: Problem[] = [];
  for (const path of textFiles(snapshot, (p) => p.endsWith('.md') && (DOC_SCOPE(p) || p.startsWith('docs/specs/')))) {
    const dir = path.split('/').slice(0, -1);
    for (const [, target] of snapshot.text[path].matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const clean = decodeURIComponent(target.split('#')[0]);
      if (!clean) continue;
      const parts = clean.startsWith('/') ? clean.slice(1).split('/') : [...dir, ...clean.split('/')];
      const resolved: string[] = [];
      for (const part of parts) {
        if (part === '..') resolved.pop();
        else if (part !== '.' && part !== '') resolved.push(part);
      }
      if (!snapshot.paths.has(resolved.join('/'))) problems.push(problem('D4', `${path}: liên kết hỏng → ${target}`));
    }
  }
  return problems;
}

const GENERATED_PATHS = ['test/.coverage'];

/** Tồn tại, hoặc là tham chiếu spec theo số (`docs/specs/payment/0003` → `0003-split-refund-service.md`), hoặc thư mục sinh ra khi chạy */
function existsOrSpecNumber(snapshot: Snapshot, token: string): boolean {
  if (snapshot.paths.has(token) || GENERATED_PATHS.includes(token)) return true;
  return /^docs\/specs\/[^/]+\/\d{4}$/.test(token) && [...snapshot.paths].some((path) => path.startsWith(`${token}-`));
}

/** D5: đường dẫn file trong `…` ở docs/rule/skill phải tồn tại (spec là lịch sử, không kiểm) */
export function checkPathReferences(snapshot: Snapshot): Problem[] {
  const problems: Problem[] = [];
  for (const path of textFiles(snapshot, DOC_SCOPE)) {
    const seen = new Set<string>();
    for (const [, raw] of snapshot.text[path].matchAll(/`([^`\s]+)`/g)) {
      const token = raw
        .replace(/[.,;:]+$/, '')
        .replace(/:\d+(-\d+)?$/, '')
        .replace(/#.*$/, '')
        .replace(/\/$/, '');
      if (seen.has(token) || /[*<>{}|$()=…]/.test(token)) continue;
      seen.add(token);
      const rooted = ROOT_DIRS.some((root) => token.startsWith(`${root}/`));
      const moduleRelative = !rooted && /^[a-z0-9][\w.-]*\/[\w./-]+\.(ts|md)$/.test(token);
      if (rooted) {
        if (!existsOrSpecNumber(snapshot, token)) problems.push(problem('D5', `${path}: nhắc tới ${token} nhưng file không tồn tại`));
      } else if (moduleRelative) {
        // docs module ghi đường dẫn tương đối với thư mục module (vd `shared/order.constant.ts`)
        const found = [...snapshot.paths].some((candidate) => candidate === token || candidate.endsWith(`/${token}`));
        if (!found) problems.push(problem('D5', `${path}: nhắc tới ${token} nhưng không thấy file`));
      }
    }
  }
  return problems;
}

const HTTP_DECORATOR = /@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/g;
const normalizeParams = (path: string) => path.replace(/:[A-Za-z0-9_]+/g, ':p').replace(/\/+$/, '') || '/';

export interface RouteDef {
  method: string;
  path: string;
  file: string;
}

export function extractRoutes(snapshot: Snapshot): RouteDef[] {
  const routes: RouteDef[] = [];
  for (const file of textFiles(snapshot, (p) => p.endsWith('.controller.ts'))) {
    const code = snapshot.text[file];
    const prefix = /@Controller\(\s*(?:'([^']*)')?\s*\)/.exec(code)?.[1] ?? '';
    for (const [, method, sub] of code.matchAll(HTTP_DECORATOR)) {
      const path = `/${[prefix, sub ?? '']
        .map((part) => part.replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
        .join('/')}`;
      routes.push({ method: method.toUpperCase(), path: normalizeParams(path), file });
    }
  }
  return routes;
}

/** D6: mỗi route của controller có mặt (đường dẫn, không phân biệt tên tham số) trong docs của module sở hữu */
export function checkRoutesDocumented(snapshot: Snapshot): Problem[] {
  const problems: Problem[] = [];
  const documented = new Map<string, Set<string>>();
  const docFor = (file: string) => `docs/modules/${moduleOf(file) ?? 'common'}.md`;
  for (const route of extractRoutes(snapshot)) {
    if (route.path === '/') continue;
    const doc = docFor(route.file);
    if (!documented.has(doc)) {
      const paths = new Set<string>();
      for (const [, found] of (snapshot.text[doc] ?? '').matchAll(/`?(\/(?:api|health)[A-Za-z0-9/_\-:]*)/g))
        paths.add(normalizeParams(found));
      if ((snapshot.text[doc] ?? '').includes('/health')) paths.add('/health');
      documented.set(doc, paths);
    }
    if (!documented.get(doc)?.has(route.path))
      problems.push(problem('D6', `${doc}: thiếu route ${route.method} ${route.path} (${route.file})`));
  }
  return problems;
}

/** D7: mỗi flow có trong test matrix (test/README.md) */
export function checkFlowMatrix(snapshot: Snapshot): Problem[] {
  const readme = snapshot.text['test/README.md'] ?? '';
  return [...snapshot.paths]
    .filter((path) => /^test\/flows\/.+\.flow\.ts$/.test(path))
    .sort()
    .filter((path) => !readme.includes(path.replace('test/flows/', '')) && !readme.includes(path.split('/').pop() as string))
    .map((path) => problem('D7', `test/README.md: thiếu flow ${path}`));
}

/** D8: mỗi migration có trong bảng migration của common.md */
export function checkMigrationsListed(snapshot: Snapshot): Problem[] {
  const common = snapshot.text['docs/modules/common.md'] ?? '';
  return [...snapshot.paths]
    .filter((path) => /^src\/migrations\/\d+-[^/]+\.ts$/.test(path))
    .sort()
    .map((path) => (path.split('/').pop() as string).replace(/\.ts$/, ''))
    .filter((name) => !common.includes(name))
    .map((name) => problem('D8', `docs/modules/common.md: thiếu migration ${name}`));
}

/** D9: mỗi rule trong .claude/rules được nhắc ở CLAUDE.md hoặc mục lục engineering-principles.md */
export function checkRuleIndex(snapshot: Snapshot): Problem[] {
  const index = `${snapshot.text['CLAUDE.md'] ?? ''}\n${snapshot.text['.claude/rules/engineering-principles.md'] ?? ''}`;
  return [...snapshot.paths]
    .filter((path) => /^\.claude\/rules\/[^/]+\.md$/.test(path))
    .sort()
    .filter((path) => !index.includes(path.split('/').pop() as string))
    .map((path) => problem('D9', `${path}: không được nhắc ở CLAUDE.md hoặc engineering-principles.md`));
}

export function checkDocs(snapshot: Snapshot, options: CheckOptions): Problem[] {
  return [
    ...checkModuleDocs(snapshot),
    ...checkSpecs(snapshot, options),
    ...checkLinks(snapshot),
    ...checkPathReferences(snapshot),
    ...checkRoutesDocumented(snapshot),
    ...checkFlowMatrix(snapshot),
    ...checkMigrationsListed(snapshot),
    ...checkRuleIndex(snapshot),
  ];
}
