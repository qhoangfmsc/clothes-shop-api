import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeMissing, type Kind, readRecordedRequests, readRouteTable } from './coverage';

/**
 * Chạy sau `yarn test:flows`: in độ phủ endpoint (route có ca thành công / ca lỗi nghiệp vụ) và áp ratchet với
 * `test/coverage-baseline.json`. `--update-baseline` chỉ gỡ mục đã đủ ca, không bao giờ thêm.
 */
interface Baseline {
  exempt: Record<string, Partial<Record<Kind, string>>>;
  missing: Record<string, Kind[]>;
}

const BASELINE_FILE = resolve(__dirname, '../coverage-baseline.json');
const NEXT_BATCH_SIZE = 5;
const update = process.argv.includes('--update-baseline');

const routes = readRouteTable();
const requests = readRecordedRequests();
if (!requests.length) {
  console.error('Không có dữ liệu độ phủ: chạy `yarn test:flows` (chạy đủ bộ) trước.');
  process.exit(1);
}

const baseline: Baseline = existsSync(BASELINE_FILE)
  ? JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
  : { exempt: {}, missing: Object.fromEntries(computeMissing(routes, requests)) };
if (!existsSync(BASELINE_FILE)) writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, 2)}\n`);

const current = computeMissing(routes, requests, baseline.exempt);
const routeKeys = new Set(routes.map((route) => route.key));
const exemptCount = (kind: Kind) => Object.values(baseline.exempt).filter((entry) => entry[kind]).length;
const covered = (kind: Kind) => routes.length - exemptCount(kind) - [...current.values()].filter((kinds) => kinds.includes(kind)).length;

const problems: string[] = [];
for (const [key, kinds] of current) {
  for (const kind of kinds)
    if (!baseline.missing[key]?.includes(kind))
      problems.push(`Route chưa có ca ${kind === 'success' ? 'thành công' : 'lỗi'}: ${key} — thêm test`);
}
const shrunk: Baseline['missing'] = {};
for (const [key, kinds] of Object.entries(baseline.missing)) {
  if (!routeKeys.has(key)) {
    problems.push(`Baseline chứa route không còn tồn tại: ${key}`);
    continue;
  }
  const stillMissing = kinds.filter((kind) => current.get(key)?.includes(kind));
  for (const kind of kinds.filter((k) => !stillMissing.includes(k)))
    problems.push(`Đã đủ ca ${kind} nhưng còn trong baseline: ${key} — chạy yarn test:coverage:update`);
  if (stillMissing.length) shrunk[key] = stillMissing;
}

if (update) {
  writeFileSync(BASELINE_FILE, `${JSON.stringify({ ...baseline, missing: shrunk }, null, 2)}\n`);
  console.log(`Đã cập nhật baseline: còn ${Object.keys(shrunk).length} route thiếu ca.`);
  process.exit(0);
}

const nextBatch = Object.keys(baseline.missing)
  .filter((key) => current.has(key))
  .slice(0, NEXT_BATCH_SIZE);
console.log(
  `Độ phủ endpoint (${routes.length} route): ca thành công ${covered('success')}/${routes.length - exemptCount('success')}, ca lỗi ${covered('error')}/${routes.length - exemptCount('error')}`,
);
console.log(`Còn thiếu: ${current.size} route. Batch kế tiếp: ${nextBatch.length ? nextBatch.join(' | ') : '(không còn)'}`);
if (problems.length) {
  console.error(`\nRatchet THẤT BẠI:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  process.exit(1);
}
console.log('Ratchet: OK');
