import { buildSnapshot } from './check-docs';
import {
  checkDocs,
  checkFlowMatrix,
  checkLinks,
  checkMigrationsListed,
  checkModuleDocs,
  checkPathReferences,
  checkRoutesDocumented,
  checkRuleIndex,
  checkSpecs,
  extractRoutes,
  type Snapshot,
} from './lib/docs-checks';

function snapshot(text: Record<string, string>, extraPaths: string[] = []): Snapshot {
  const paths = new Set<string>([...Object.keys(text), ...extraPaths]);
  for (const path of [...paths]) for (let dir = path.split('/').slice(0, -1); dir.length; dir = dir.slice(0, -1)) paths.add(dir.join('/'));
  return { text, paths };
}

const spec = (status: string, section6 = '## 6. Kết quả triển khai\n\n- ok') =>
  `# 0001 — X\n\n> Module: \`a\` · Trạng thái: ${status} · Ngày: 2026-01-01\n\n${section6}`;
const index = (rows: string[]) => `| Module | Spec | Trạng thái | Nội dung |\n|---|---|---|---|\n${rows.join('\n')}`;

describe('D1 module docs', () => {
  const ok = snapshot({ 'docs/README.md': '[a](modules/a.md)', 'docs/modules/a.md': '' }, ['src/modules/a/a.module.ts']);
  it('passes when docs and index row exist', () => expect(checkModuleDocs(ok)).toEqual([]));
  it('flags a module without docs file and README row', () => {
    const bad = snapshot({ 'docs/README.md': '' }, ['src/modules/b/b.module.ts']);
    expect(checkModuleDocs(bad).map((p) => p.message)).toEqual([
      'src/modules/b: thiếu docs/modules/b.md',
      'docs/README.md: thiếu dòng cho module b',
    ]);
  });
  it('flags a docs file whose module no longer exists but allows common.md', () => {
    const bad = snapshot({ 'docs/README.md': '', 'docs/modules/gone.md': '', 'docs/modules/common.md': '' });
    expect(checkModuleDocs(bad).map((p) => p.message)).toEqual(['docs/modules/gone.md: không có thư mục src/modules/gone']);
  });
});

describe('D2/D3 specs', () => {
  const row = (status: string) => `| a | [0001](a/0001-x.md) | ${status} | x |`;
  const base = (status: string, indexStatus = status, body = spec(status)) =>
    snapshot({ 'docs/specs/a/0001-x.md': body, 'docs/specs/README.md': index([row(indexStatus)]) });

  it('passes for an indexed Implemented spec with a filled section 6', () =>
    expect(checkSpecs(base('Implemented'), { strict: true })).toEqual([]));
  it('flags a spec missing from the index', () => {
    const s = snapshot({ 'docs/specs/a/0001-x.md': spec('Implemented'), 'docs/specs/README.md': index([]) });
    expect(checkSpecs(s, { strict: false }).map((p) => p.message)).toEqual(['docs/specs/a/0001-x.md: chưa có trong docs/specs/README.md']);
  });
  it('flags status drift between file and index', () => {
    expect(checkSpecs(base('Implemented', 'Draft'), { strict: false }).map((p) => p.message)[0]).toContain(
      'file ghi Implemented nhưng chỉ mục ghi Draft',
    );
  });
  it('allows Draft off main but not in strict mode', () => {
    expect(checkSpecs(base('Draft'), { strict: false })).toEqual([]);
    expect(checkSpecs(base('Draft'), { strict: true }).map((p) => p.message)[0]).toContain('còn Draft');
    expect(checkSpecs(base('Approved'), { strict: true })).toHaveLength(1);
  });
  it('flags an Implemented spec with a missing or placeholder section 6', () => {
    expect(checkSpecs(base('Implemented', 'Implemented', spec('Implemented', '## 5. Rủi ro')), { strict: false })[0].message).toContain(
      'thiếu mục "## 6.',
    );
    expect(
      checkSpecs(base('Implemented', 'Implemented', spec('Implemented', '## 6. Kết quả\n\n_(điền sau khi xong)_')), { strict: false })[0]
        .message,
    ).toContain('placeholder');
  });
  it('flags a missing status header, an index row without file, and gaps in numbering', () => {
    const s = snapshot({
      'docs/specs/a/0001-x.md': '# no header',
      'docs/specs/a/0003-z.md': spec('Implemented'),
      'docs/specs/README.md': index([
        row('Implemented'),
        '| a | [0003](a/0003-z.md) | Implemented | z |',
        '| a | [0009](a/0009-gone.md) | Implemented | g |',
      ]),
    });
    const messages = checkSpecs(s, { strict: false }).map((p) => p.message);
    expect(messages.some((m) => m.includes('header thiếu'))).toBe(true);
    expect(messages.some((m) => m.includes('0009-gone.md'))).toBe(true);
    expect(messages.some((m) => m.includes('không liên tục'))).toBe(true);
  });
});

describe('D4 links', () => {
  it('resolves relative links, ignores urls and anchors, flags broken ones', () => {
    const s = snapshot({
      'docs/modules/a.md': '[ok](b.md) [up](../README.md#x) [web](https://x.dev) [anchor](#top) [bad](missing.md)',
      'docs/modules/b.md': '',
      'docs/README.md': '',
    });
    expect(checkLinks(s).map((p) => p.message)).toEqual(['docs/modules/a.md: liên kết hỏng → missing.md']);
  });
});

describe('D5 path references', () => {
  const s = snapshot(
    {
      'docs/modules/order.md': [
        '`src/modules/order/shared/order.constant.ts` `shared/order.constant.ts` `docs/specs/order/0001`',
        '`src/modules/order/gone.ts` `shared/gone.ts` `src/modules/*/x.ts` `docs/specs/<m>/NNNN.md` `x.service.ts`',
      ].join('\n'),
    },
    ['src/modules/order/shared/order.constant.ts', 'docs/specs/order/0001-typed.md'],
  );
  it('accepts real, module-relative and spec-number references and skips placeholders', () => {
    expect(checkPathReferences(s).map((p) => p.message)).toEqual([
      'docs/modules/order.md: nhắc tới src/modules/order/gone.ts nhưng file không tồn tại',
      'docs/modules/order.md: nhắc tới shared/gone.ts nhưng không thấy file',
    ]);
  });
});

describe('D6 routes documented', () => {
  const controller = `@Controller('api/orders')\nexport class C {\n @Get()\n a() {}\n @Get(':orderId')\n b() {}\n @Patch(':orderId/cancel')\n c() {}\n}`;
  it('extracts method and full path with normalized params', () => {
    expect(extractRoutes(snapshot({ 'src/modules/order/c.controller.ts': controller })).map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /api/orders',
      'GET /api/orders/:p',
      'PATCH /api/orders/:p/cancel',
    ]);
  });
  it('passes when the module docs list the path (any parameter name) and flags the missing ones', () => {
    const s = snapshot({
      'src/modules/order/c.controller.ts': controller,
      'docs/modules/order.md': '| GET | `/api/orders` |\n| GET | `/api/orders/:id` |',
    });
    expect(checkRoutesDocumented(s).map((p) => p.message)).toEqual([
      'docs/modules/order.md: thiếu route PATCH /api/orders/:p/cancel (src/modules/order/c.controller.ts)',
    ]);
  });
  it('maps the health controller to common.md', () => {
    const s = snapshot({
      'src/main.controller.ts': "@Controller()\nexport class M {\n @Get()\n a() {}\n @Get('health')\n b() {}\n}",
      'docs/modules/common.md': '`GET /health`',
    });
    expect(checkRoutesDocumented(s)).toEqual([]);
  });
});

describe('D7 D8 D9', () => {
  it('D7 flags a flow missing from the test matrix, matching by path or file name', () => {
    const s = snapshot({ 'test/README.md': '`payment/a.flow.ts`' }, ['test/flows/payment/a.flow.ts', 'test/flows/payment/b.flow.ts']);
    expect(checkFlowMatrix(s).map((p) => p.message)).toEqual(['test/README.md: thiếu flow test/flows/payment/b.flow.ts']);
  });
  it('D8 flags a migration missing from common.md', () => {
    const s = snapshot({ 'docs/modules/common.md': '| `1-A` |' }, ['src/migrations/1-A.ts', 'src/migrations/2-B.ts']);
    expect(checkMigrationsListed(s).map((p) => p.message)).toEqual(['docs/modules/common.md: thiếu migration 2-B']);
  });
  it('D9 flags a rule that nothing links to', () => {
    const s = snapshot(
      { 'CLAUDE.md': '`.claude/rules/a.md` `.claude/rules/engineering-principles.md`', '.claude/rules/engineering-principles.md': '' },
      ['.claude/rules/a.md', '.claude/rules/orphan.md'],
    );
    expect(checkRuleIndex(s).map((p) => p.message)).toEqual([
      '.claude/rules/orphan.md: không được nhắc ở CLAUDE.md hoặc engineering-principles.md',
    ]);
  });
});

describe('the real repository passes check:docs', () => {
  it('has no problems in non-strict mode (spec drafts are allowed before merging to main)', () => {
    expect(checkDocs(buildSnapshot(), { strict: false })).toEqual([]);
  });
});
