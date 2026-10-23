import { join } from 'node:path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import {
  COMMON_IMPORTS_MODULES,
  CROSS_MODULE_WRITES,
  MANY_DEPENDENCIES_SERVICES,
  OVERSIZED_SERVICES,
  SERVICE_MAX_DEPENDENCIES,
  SERVICE_MAX_LINES,
  UNUSED_EXPORTS,
} from './architecture-allowlist.test-utils';
import { count, isSource, listFiles, ROOT, read, stripComments } from './source-scan.test-utils';

/** Luật kiến trúc được máy ép (docs/specs/common/0002). Vi phạm cũ nằm trong allowlist và chỉ được co lại. */

/** So số vi phạm thực tế với allowlist: mới/tăng → lỗi; giảm mà allowlist chưa giảm → lỗi nhắc cập nhật */
function compareToAllowlist(actual: Record<string, number>, allowed: Record<string, number>, what: string): string[] {
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

describe('Architecture rules', () => {
  const serviceFiles = listFiles('src/modules', (file) => file.endsWith('.service.ts'));

  it('common and core never import from modules', () => {
    const importsModules = (code: string) =>
      [...stripComments(code).matchAll(/from\s+'([^']+)'/g)].some(([, path]) => path.startsWith('@/') || path.includes('modules/'));
    const actual: Record<string, number> = {};
    for (const file of [...listFiles('src/common', isSource), ...listFiles('src/core', isSource)]) {
      if (importsModules(read(file))) actual[file] = 1;
    }
    const allowed = Object.fromEntries(Object.keys(COMMON_IMPORTS_MODULES).map((file) => [file, 1]));
    expect(compareToAllowlist(actual, allowed, 'import từ modules/')).toEqual([]);
  });

  it('keeps the Nest module graph free of cycles, forwardRef and undefined imports', async () => {
    const owned = new Map<unknown, string>();
    for (const file of listFiles('src', (f) => f.endsWith('.module.ts'))) {
      const loaded = await import(join(ROOT, file));
      for (const value of Object.values(loaded)) if (typeof value === 'function') owned.set(value, value.name);
    }

    const problems: string[] = [];
    const edges = new Map<unknown, unknown[]>();
    for (const [module, name] of owned) {
      const targets: unknown[] = [];
      for (const entry of (Reflect.getMetadata(MODULE_METADATA.IMPORTS, module as object) ?? []) as {
        forwardRef?: unknown;
        module?: unknown;
      }[]) {
        if (entry === undefined) problems.push(`${name} có entry imports là undefined (thường do vòng import giữa file module)`);
        if (entry?.forwardRef) problems.push(`${name} dùng forwardRef`);
        const target = typeof entry === 'function' ? entry : entry?.module;
        if (owned.has(target)) targets.push(target);
      }
      edges.set(module, targets);
    }

    // chống qua rỗng: phải thấy module và cạnh phụ thuộc thật
    expect(owned.size).toBeGreaterThan(10);
    expect([...edges.values()].flat().length).toBeGreaterThan(10);

    const cycles: string[] = [];
    const finished = new Set<unknown>();
    const visit = (module: unknown, path: unknown[]) => {
      if (path.includes(module)) {
        cycles.push([...path.slice(path.indexOf(module)), module].map((m) => owned.get(m)).join(' -> '));
        return;
      }
      if (finished.has(module)) return;
      for (const next of edges.get(module) ?? []) visit(next, [...path, module]);
      finished.add(module);
    };
    for (const module of owned.keys()) visit(module, []);

    expect({ problems, cycles }).toEqual({ problems: [], cycles: [] });
  });

  it('has no unused exports in common and core', () => {
    const scope = [...listFiles('src/common', isSource), ...listFiles('src/core', isSource)];
    const others = [...listFiles('src', (f) => f.endsWith('.ts')), ...listFiles('test', (f) => f.endsWith('.ts')), 'data-source.ts']
      .filter((file) => !file.startsWith('src/common/architecture/'))
      .map((file) => ({ file, text: stripComments(read(file)) }));
    const exportPattern = /export\s+(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:const|function|class|interface|type|enum)\s+(\w+)/g;

    const unused: Record<string, string[]> = {};
    for (const file of scope) {
      const own = stripComments(read(file));
      for (const [, name] of own.matchAll(exportPattern)) {
        const word = new RegExp(`\\b${name}\\b`);
        const usedElsewhere = others.some((other) => other.file !== file && word.test(other.text));
        if (!usedElsewhere && count(new RegExp(word.source, 'g'), own) <= 1) unused[file] = [...(unused[file] ?? []), name];
      }
    }

    const actual = Object.fromEntries(Object.entries(unused).map(([file, names]) => [file, names.length]));
    const allowed = Object.fromEntries(Object.entries(UNUSED_EXPORTS).map(([file, names]) => [file, names.length]));
    expect(compareToAllowlist(actual, allowed, 'export không được dùng')).toEqual([]);
    expect(unused).toEqual(UNUSED_EXPORTS);
  });

  it('services throw errors through throwAppError, not raw HTTP exceptions', () => {
    const violations: string[] = [];
    for (const file of serviceFiles) {
      const raw = [...stripComments(read(file)).matchAll(/throw new (\w+Exception)\(/g)].filter(([, name]) => name !== 'AppException');
      if (raw.length)
        violations.push(`${file}: ${raw.length} throw exception thô (${raw.map(([, name]) => name).join(', ')}) — dùng throwAppError`);
    }
    expect(violations).toEqual([]);
  });

  it('takes row locks only through findLocked', () => {
    const offenders = listFiles('src', isSource)
      .filter((file) => file !== 'src/common/base/lock.util.ts' && /lock:\s*\{\s*mode:/.test(stripComments(read(file))))
      .map((file) => `${file}: khoá dòng trực tiếp — dùng findLocked (@common/base/lock.util)`);
    expect(offenders).toEqual([]);
  });

  it('writes tables of other modules only through functions of the owner module', () => {
    const ownerOf = new Map<string, string>();
    for (const file of listFiles('src/modules', (f) => f.endsWith('.entity.ts'))) {
      const module = file.split('/')[2];
      for (const [, name] of stripComments(read(file)).matchAll(/export class (\w+)/g)) ownerOf.set(name, module);
    }

    const actual: Record<string, number> = {};
    for (const file of listFiles(
      'src/modules',
      (f) => isSource(f) && !f.endsWith('.entity.ts') && !f.endsWith('.module.ts') && !f.endsWith('.spec.ts'),
    )) {
      const module = file.split('/')[2];
      const code = stripComments(read(file));
      const foreign = [...ownerOf].filter(([, owner]) => owner !== module).map(([entity]) => entity);

      let writes = 0;
      for (const entity of foreign) {
        writes += count(new RegExp(`\\b(?:update|delete|insert|remove|upsert|create)\\(\\s*${entity}\\b`, 'g'), code);
        for (const [, repo] of code.matchAll(
          new RegExp(`@InjectRepository\\(${entity}\\)\\s*(?:private|protected|public)?\\s*(?:readonly\\s+)?(\\w+)`, 'g'),
        )) {
          writes += count(
            new RegExp(`this\\.${repo}\\.(?:save|update|delete|remove|insert|upsert|create|softDelete|increment|decrement)\\(`, 'g'),
            code,
          );
        }
      }
      if (writes) actual[file] = writes;
    }
    expect(compareToAllowlist(actual, CROSS_MODULE_WRITES, 'chỗ ghi bảng của module khác (dùng hàm *-state.util của module chủ)')).toEqual(
      [],
    );
  });

  it('declares entity status columns with a type union, not string', () => {
    const entityFiles = listFiles('src/modules', (file) => file.endsWith('.entity.ts'));
    const violations: string[] = [];
    for (const file of entityFiles) {
      for (const [, name] of stripComments(read(file)).matchAll(/^\s+(\w*[sS]tatus)\??!?:\s*string\b/gm)) {
        violations.push(`${file}: cột ${name} khai báo string — dùng type union của hằng trạng thái (as const)`);
      }
    }
    expect(violations).toEqual([]);
  });

  it(`keeps services within ${SERVICE_MAX_LINES} lines and ${SERVICE_MAX_DEPENDENCIES} constructor dependencies`, () => {
    const problems: string[] = [];
    for (const file of serviceFiles) {
      const code = read(file);
      const lines = code.split('\n').length;
      const constructorParams = /constructor\(([\s\S]*?)\)\s*\{/.exec(code)?.[1] ?? '';
      const dependencies = count(/(?:private|protected|public)\s+(?:readonly\s+)?\w+/g, constructorParams);

      const maxLines = OVERSIZED_SERVICES[file] ?? SERVICE_MAX_LINES;
      if (lines > maxLines) problems.push(`${file}: ${lines} dòng, tối đa ${maxLines}`);
      const maxDependencies = MANY_DEPENDENCIES_SERVICES[file] ?? SERVICE_MAX_DEPENDENCIES;
      if (dependencies > maxDependencies) problems.push(`${file}: ${dependencies} dependency, tối đa ${maxDependencies}`);

      if (file in OVERSIZED_SERVICES && lines <= SERVICE_MAX_LINES)
        problems.push(`${file}: đã ≤ ${SERVICE_MAX_LINES} dòng, xoá khỏi OVERSIZED_SERVICES`);
      if (file in MANY_DEPENDENCIES_SERVICES && dependencies <= SERVICE_MAX_DEPENDENCIES)
        problems.push(`${file}: đã ≤ ${SERVICE_MAX_DEPENDENCIES} dependency, xoá khỏi MANY_DEPENDENCIES_SERVICES`);
    }
    for (const file of [...Object.keys(OVERSIZED_SERVICES), ...Object.keys(MANY_DEPENDENCIES_SERVICES)]) {
      if (!serviceFiles.includes(file)) problems.push(`${file}: không còn tồn tại, xoá khỏi allowlist`);
    }
    expect(problems).toEqual([]);
  });
});
