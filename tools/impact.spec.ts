import { formatImpact } from './lib/format-impact';
import { readTree } from './lib/fs';
import { computeImpact, dependentsByDepth } from './lib/impact';
import {
  buildModuleGraph,
  type FlowFile,
  flowModules,
  GLOBAL_FLOW_DIRS,
  listModules,
  moduleOfUrl,
  routePrefixes,
} from './lib/source-graph';

const file = (path: string, content = '') => ({ path, content });

describe('buildModuleGraph', () => {
  const files = [
    file(
      'src/modules/order/status/order-status.service.ts',
      `import { A } from '../../payment/attempt/payment-attempt.service';\nimport { B } from '@/refund/refund.service';\nimport { C } from '../shared/order.entity';`,
    ),
    file(
      'src/modules/payment/attempt/payment-attempt.service.ts',
      `import { O } from '../../order/shared/order.entity';\nimport { X } from '@common/base/lock.util';`,
    ),
    file('src/modules/refund/refund.service.ts', ''),
    file('src/modules/order/status/order-status.service.spec.ts', `import { R } from '../../review/review.service';`),
    file('src/modules/review/review.service.ts', ''),
  ];

  it('derives module → module edges from alias and relative imports', () => {
    expect(buildModuleGraph(files)).toEqual({ order: ['payment', 'refund'], payment: ['order'], refund: [], review: [] });
  });

  it('ignores spec and test-utils files, self imports and non-module imports', () => {
    expect(buildModuleGraph(files).order).not.toContain('review');
    expect(buildModuleGraph(files).order).not.toContain('order');
  });

  it('lists modules from file paths', () => {
    expect(listModules(files)).toEqual(['order', 'payment', 'refund', 'review']);
  });
});

describe('route prefixes', () => {
  const prefixes = routePrefixes([
    file('src/modules/order/query/order-query.controller.ts', `@Controller('api/orders')\nexport class A {}`),
    file('src/modules/order/status/admin.controller.ts', `@Controller('api/admin/orders')\nexport class B {}`),
    file('src/modules/payment/sepay/sepay.controller.ts', `@Controller('api/webhooks')\nexport class C {}`),
    file('src/main.controller.ts', `@Controller()\nexport class D {}`),
  ]);

  it('maps controller paths to their module', () => {
    expect(prefixes).toEqual(
      expect.arrayContaining([
        { prefix: '/api/orders', module: 'order' },
        { prefix: '/api/admin/orders', module: 'order' },
        { prefix: '/api/webhooks', module: 'payment' },
      ]),
    );
    expect(prefixes).toHaveLength(3);
  });

  it('matches a URL on segment boundaries, longest prefix first', () => {
    expect(moduleOfUrl('/api/orders/abc/cancel', prefixes)).toBe('order');
    expect(moduleOfUrl('/api/webhooks/sepay', prefixes)).toBe('payment');
    expect(moduleOfUrl('/api/orders?page=1', prefixes)).toBe('order');
    expect(moduleOfUrl('/api/orders-archive', prefixes)).toBeNull();
    expect(moduleOfUrl('/health', prefixes)).toBeNull();
  });
});

describe('flowModules', () => {
  const prefixes = [
    { prefix: '/api/admin/refunds', module: 'refund' },
    { prefix: '/api/orders', module: 'order' },
  ];
  const flow = (path: string, content: string, helpers = ''): FlowFile => ({ path, content, helpers });

  it('finds modules from URLs in the flow, in template strings, and in helper files of the same folder', () => {
    const map = flowModules(
      [
        flow('test/flows/x/a.flow.ts', 't.api.get(`/api/orders/${id}`)'),
        flow('test/flows/x/b.flow.ts', 'await placeOrder()', "post('/api/admin/refunds/1/complete')"),
      ],
      prefixes,
      ['order', 'refund'],
    );
    expect(map['test/flows/x/a.flow.ts']).toEqual(['order']);
    expect(map['test/flows/x/b.flow.ts']).toEqual(['refund']);
  });

  it('attaches a flow to the module named after its folder, and treats global folders as module-less', () => {
    const map = flowModules(
      [flow('test/flows/refund/a.flow.ts', ''), ...GLOBAL_FLOW_DIRS.map((dir) => flow(`test/flows/${dir}/a.flow.ts`, "'/api/orders'"))],
      prefixes,
      ['order', 'refund'],
    );
    expect(map['test/flows/refund/a.flow.ts']).toEqual(['refund']);
    for (const dir of GLOBAL_FLOW_DIRS) expect(map[`test/flows/${dir}/a.flow.ts`]).toEqual([]);
  });
});

describe('computeImpact', () => {
  const graph = {
    cart: ['product'],
    order: ['cart', 'payment', 'refund'],
    payment: ['order'],
    'pending-count': ['order', 'payment', 'refund', 'return'],
    product: [],
    refund: ['order', 'payment', 'return'],
    return: ['order', 'refund'],
    wishlist: ['product'],
  };
  const flows = {
    'test/flows/access/a.flow.ts': [],
    'test/flows/cart/c.flow.ts': ['cart'],
    'test/flows/payment/p.flow.ts': ['order', 'payment'],
    'test/flows/wishlist/w.flow.ts': ['wishlist'],
  };

  it('dependents are grouped by depth', () => {
    expect(dependentsByDepth(graph, ['product'])).toEqual([
      ['cart', 'wishlist'],
      ['order'],
      ['payment', 'pending-count', 'refund', 'return'],
    ]);
  });

  it('a payment change reaches order, refund, pending-count directly and return indirectly', () => {
    const report = computeImpact({ changedFiles: ['src/modules/payment/attempt/payment-attempt.service.ts'], graph, flows });
    expect(report.changed).toEqual(['payment']);
    expect(report.direct).toEqual(['order', 'pending-count', 'refund']);
    expect(report.transitive).toEqual(['return']);
    expect(report.docsToUpdate).toEqual(['docs/modules/payment.md']);
    expect(report.docsToReview).toContain('docs/modules/refund.md');
    expect(report.flows).toEqual(['test/flows/access/a.flow.ts', 'test/flows/payment/p.flow.ts']);
    expect(report.unitDirs).toEqual(
      expect.arrayContaining(['src/common', 'src/modules/payment', 'src/modules/order', 'src/modules/refund', 'src/modules/return']),
    );
  });

  it('a leaf module change only selects its own flows plus the global ones', () => {
    const report = computeImpact({ changedFiles: ['src/modules/wishlist/wishlist.service.ts'], graph, flows });
    expect(report.direct).toEqual([]);
    expect(report.flows).toEqual(['test/flows/access/a.flow.ts', 'test/flows/wishlist/w.flow.ts']);
  });

  it.each([
    ['common code', 'src/common/base/lock.util.ts'],
    ['core code', 'src/core/app.setup.ts'],
    ['a migration', 'src/migrations/1792233304878-X.ts'],
    ['dependencies', 'package.json'],
  ])('%s affects everything and requires common.md', (_name, path) => {
    const report = computeImpact({ changedFiles: [path], graph, flows });
    expect(report.everything).toBe(true);
    expect(report.flows).toEqual(Object.keys(flows).sort());
    expect(report.docsToUpdate).toContain('docs/modules/common.md');
  });

  it('a spec-only change in common does not pull in every flow', () => {
    const report = computeImpact({ changedFiles: ['src/common/architecture/architecture.spec.ts'], graph, flows });
    expect(report.everything).toBe(false);
    expect(report.flows).toEqual([]);
    expect(report.unitDirs).toEqual(['src/common']);
  });

  it('a docs-only change selects nothing', () => {
    const report = computeImpact({ changedFiles: ['docs/modules/order.md', '.claude/rules/solid.md', 'tools/impact.ts'], graph, flows });
    expect(report).toMatchObject({ changed: [], flows: [], unitDirs: [], everything: false });
  });

  it('a changed flow runs by itself; a helper in its folder runs its siblings; test/support runs all', () => {
    expect(computeImpact({ changedFiles: ['test/flows/cart/c.flow.ts'], graph, flows }).flows).toContain('test/flows/cart/c.flow.ts');
    expect(computeImpact({ changedFiles: ['test/flows/payment/steps.ts'], graph, flows }).flows).toContain('test/flows/payment/p.flow.ts');
    expect(computeImpact({ changedFiles: ['test/support/builders.ts'], graph, flows }).flows).toEqual(Object.keys(flows).sort());
  });

  it('formats a readable report', () => {
    const text = formatImpact(computeImpact({ changedFiles: ['src/modules/payment/x.service.ts'], graph, flows }), 4);
    expect(text).toContain('Module đã đổi:             payment');
    expect(text).toContain('order, pending-count, refund');
    expect(text).toContain('Cổng cuối vẫn là chạy TOÀN BỘ');
  });
});

describe('the real repository', () => {
  const sources = readTree('src', (path) => path.endsWith('.ts'));
  const graph = buildModuleGraph(sources);
  const prefixes = routePrefixes(sources);
  const flowFiles = readTree('test/flows', (path) => path.endsWith('.flow.ts')).map((f) => {
    const dir = f.path.split('/').slice(0, -1).join('/');
    const helpers = readTree(dir, (p) => p.endsWith('.ts') && !p.endsWith('.flow.ts') && p.split('/').slice(0, -1).join('/') === dir);
    return { ...f, helpers: helpers.map((h) => h.content).join('\n') };
  });
  const modules = listModules(sources);
  const flows = flowModules(flowFiles, prefixes, modules);

  it('sees the known money-flow edges', () => {
    expect(graph.order).toEqual(expect.arrayContaining(['payment', 'refund', 'product']));
    expect(graph.refund).toEqual(expect.arrayContaining(['payment', 'order', 'return']));
    expect(graph.return).toEqual(expect.arrayContaining(['order', 'refund']));
    expect(graph.review).toEqual(expect.arrayContaining(['order', 'product']));
  });

  it('a payment change brings every party of the money flow into scope', () => {
    const report = computeImpact({ changedFiles: ['src/modules/payment/shared/payment-paid.util.ts'], graph, flows });
    const affected = [...report.changed, ...report.direct, ...report.transitive];
    expect(affected).toEqual(expect.arrayContaining(['payment', 'order', 'refund', 'return', 'pending-count']));
    expect(report.flows.some((f) => f.includes('/refund') || f.includes('cancel-and-refund'))).toBe(true);
  });

  it('every module with routes is covered by at least one flow and every flow belongs to a module or a global folder', () => {
    const covered = new Set(Object.values(flows).flat());
    const withRoutes = new Set(prefixes.map((p) => p.module));
    expect(modules.filter((module) => withRoutes.has(module) && !covered.has(module))).toEqual([]);
    const orphans = Object.entries(flows)
      .filter(([path, hit]) => hit.length === 0 && !GLOBAL_FLOW_DIRS.includes(path.split('/').slice(-2, -1)[0]))
      .map(([path]) => path);
    expect(orphans).toEqual([]);
  });
});
