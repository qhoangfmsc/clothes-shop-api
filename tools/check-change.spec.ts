import { checkChange, waivers } from './lib/change-checks';

const run = (changedFiles: string[], commitMessages: string[] = ['feat: x']) =>
  checkChange({ changedFiles, commitMessages })
    .map((p) => p.check)
    .sort();

describe('check:change', () => {
  it('passes when code, test and docs of the module change together', () => {
    expect(
      run([
        'src/modules/order/status/order-status.service.ts',
        'src/modules/order/status/order-status.service.spec.ts',
        'docs/modules/order.md',
      ]),
    ).toEqual([]);
  });

  it('C1: code without any test', () => {
    expect(run(['src/modules/order/status/order-status.service.ts', 'docs/modules/order.md'])).toEqual(['C1']);
  });

  it('a flow test or test support counts as a test', () => {
    expect(run(['src/modules/order/x.service.ts', 'test/flows/order/x.flow.ts', 'docs/modules/order.md'])).toEqual([]);
    expect(run(['src/modules/order/x.service.ts', 'test/support/builders.ts', 'docs/modules/order.md'])).toEqual([]);
  });

  it('C2: module code changed but its own docs did not (another module doc does not help)', () => {
    expect(run(['src/modules/order/x.service.ts', 'src/modules/order/x.service.spec.ts', 'docs/modules/payment.md'])).toEqual(['C2']);
  });

  it('C2 once per module that lacks docs', () => {
    expect(run(['src/modules/order/a.service.ts', 'src/modules/payment/b.service.ts', 'src/modules/order/a.service.spec.ts'])).toEqual([
      'C2',
      'C2',
    ]);
  });

  it('C3: common/core code or a migration requires common.md', () => {
    expect(run(['src/common/base/lock.util.ts', 'src/common/base/lock.util.spec.ts'])).toEqual(['C3']);
    expect(run(['src/migrations/1-X.ts', 'test/flows/a/b.flow.ts'])).toEqual(['C3']);
    expect(run(['src/core/app.setup.ts', 'src/common/x.spec.ts', 'docs/modules/common.md'])).toEqual([]);
  });

  it('spec, test-utils, docs, tools and rules alone need nothing', () => {
    expect(
      run([
        'src/modules/order/x.service.spec.ts',
        'src/modules/order/x.test-utils.ts',
        'docs/modules/order.md',
        '.claude/rules/solid.md',
        'tools/impact.ts',
      ]),
    ).toEqual([]);
  });

  it('trailers waive with a reason: No-Test waives C1, No-Docs waives C2 and C3', () => {
    const files = ['src/modules/order/x.service.ts', 'src/common/y.util.ts'];
    expect(run(files)).toEqual(['C1', 'C2', 'C3']);
    expect(run(files, ['refactor: rename\n\nNo-Test: đổi tên biến nội bộ'])).toEqual(['C2', 'C3']);
    expect(run(files, ['refactor: rename\n\nNo-Docs: đổi tên biến nội bộ'])).toEqual(['C1']);
    expect(run(files, ['a\n\nNo-Test: đổi tên biến\nNo-Docs: đổi tên biến'])).toEqual([]);
  });

  it('an empty or one-word trailer does not count', () => {
    expect(waivers(['x\n\nNo-Test:'], 'No-Test')).toEqual([]);
    expect(waivers(['x\n\nNo-Test: ok'], 'No-Test')).toEqual([]);
    expect(waivers(['x\n\nno-docs:   lý do rõ ràng '], 'No-Docs')).toEqual(['lý do rõ ràng']);
  });
});
