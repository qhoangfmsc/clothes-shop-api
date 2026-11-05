import { CONTROLLERS_WITH_DB_ACCESS, RAW_HTTP_EXCEPTIONS, UNSUFFIXED_FILES } from './architecture-allowlist.test-utils';
import { compareToAllowlist, count, isSource, listFiles, read, stripComments } from './source-scan.test-utils';

/** Convention của .claude/rules/coding-conventions.md và architecture.md mà máy kiểm được (docs/specs/common/0013). */

const ROLE_SUFFIXES = [
  'controller',
  'service',
  'module',
  'entity',
  'dto',
  'presenter',
  'util',
  'constant',
  'decorator',
  'guard',
  'filter',
  'middleware',
  'strategy',
  'scheduler',
  'config',
  'validators',
  'validation',
  'transform',
  'exception',
  'setup',
  'storage',
];
const TEST_SUFFIXES = ['spec', 'test-utils'];

const sourceFiles = () => listFiles('src', (f) => f.endsWith('.ts') && !f.startsWith('src/migrations/'));
const pascal = (kebab: string) =>
  kebab
    .split(/[.-]/)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');

describe('Coding conventions', () => {
  it('names files in kebab-case with a role suffix: x.<role>.ts (and x.<role>.spec.ts, x.test-utils.ts)', () => {
    const problems: string[] = [];
    for (const file of sourceFiles()) {
      const name = file.split('/').pop() as string;
      const parts = name.replace(/\.ts$/, '').split('.');
      const base = parts[0];
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(base)) problems.push(`${file}: tên phải kebab-case`);

      const roles = parts.slice(1);
      if (roles.length === 0) {
        if (!(file in UNSUFFIXED_FILES)) problems.push(`${file}: thiếu hậu tố vai trò (x.service.ts, x.util.ts...)`);
        continue;
      }
      const [role, test, ...rest] = roles;
      const isTest = TEST_SUFFIXES.includes(role);
      if (!isTest && !ROLE_SUFFIXES.includes(role)) problems.push(`${file}: hậu tố .${role} không thuộc danh sách vai trò`);
      if (!isTest && test && !TEST_SUFFIXES.includes(test)) problems.push(`${file}: chỉ được .${role}.spec.ts hoặc .${role}.test-utils.ts`);
      if (rest.length) problems.push(`${file}: quá nhiều đoạn trong tên file`);
    }
    for (const file of Object.keys(UNSUFFIXED_FILES)) {
      if (!sourceFiles().includes(file)) problems.push(`${file}: không còn tồn tại, xoá khỏi UNSUFFIXED_FILES`);
    }
    expect(problems).toEqual([]);
  });

  it('exports a class named after its file for services, controllers, modules, schedulers and guards', () => {
    const problems: string[] = [];
    const roles = ['service', 'controller', 'module', 'scheduler', 'guard'];
    for (const file of sourceFiles().filter(isSource)) {
      const name = (file.split('/').pop() as string).replace(/\.ts$/, '');
      if (!roles.some((role) => name.endsWith(`.${role}`))) continue;
      const expected = pascal(name);
      if (!new RegExp(`export class ${expected}\\b`).test(stripComments(read(file)))) {
        problems.push(`${file}: phải export class ${expected}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps DTOs in dtos/ folders named *.dto.ts', () => {
    const problems: string[] = [];
    for (const file of listFiles('src/modules', (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))) {
      const inDtos = file.includes('/dtos/');
      const isDto = file.endsWith('.dto.ts');
      if (inDtos && !isDto) problems.push(`${file}: file trong dtos/ phải là *.dto.ts`);
      if (isDto && !inDtos) problems.push(`${file}: *.dto.ts phải nằm trong thư mục dtos/`);
    }
    expect(problems).toEqual([]);
  });

  it('keeps controllers away from the database: they call services only', () => {
    const actual: Record<string, number> = {};
    for (const file of sourceFiles().filter((f) => f.endsWith('.controller.ts'))) {
      const n = count(/@InjectRepository|@InjectDataSource|\bEntityManager\b|\bDataSource\b|\bRepository</g, stripComments(read(file)));
      if (n) actual[file] = 1;
    }
    expect(compareToAllowlist(actual, CONTROLLERS_WITH_DB_ACCESS, 'chỗ controller chạm DB trực tiếp (chuyển vào service)')).toEqual([]);
  });

  it('throws raw HTTP exceptions nowhere outside the allowlist; business errors use throwAppError', () => {
    const actual: Record<string, number> = {};
    for (const file of sourceFiles().filter(isSource)) {
      const n = [...stripComments(read(file)).matchAll(/throw new (\w+Exception)\(/g)].filter(([, name]) => name !== 'AppException').length;
      if (n) actual[file] = n;
    }
    expect(compareToAllowlist(actual, RAW_HTTP_EXCEPTIONS, 'chỗ ném exception HTTP thô (dùng throwAppError)')).toEqual([]);
  });

  it('does not use console.* in application code (use Nest Logger)', () => {
    const offenders = sourceFiles()
      .filter(isSource)
      .filter((file) => /\bconsole\.(log|warn|error|info|debug)\(/.test(stripComments(read(file))))
      .map((file) => `${file}: dùng console.* — dùng Logger của Nest`);
    expect(offenders).toEqual([]);
  });

  it('does not read process.env in feature modules (use ConfigService)', () => {
    const offenders = listFiles('src/modules', isSource)
      .filter((file) => /\bprocess\.env\b/.test(stripComments(read(file))))
      .map((file) => `${file}: đọc process.env — dùng ConfigService`);
    expect(offenders).toEqual([]);
  });
});
