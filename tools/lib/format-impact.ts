import type { ImpactReport } from './impact';

const list = (items: string[]) => (items.length ? items.join(', ') : '—');

/** Báo cáo cho người đọc; bản này là thứ dán vào báo cáo cuối ("Phạm vi ảnh hưởng") */
export function formatImpact(report: ImpactReport, totalFlows: number): string {
  const lines = ['Phạm vi ảnh hưởng của thay đổi', ''];
  if (report.everything) {
    lines.push('  Mức: TOÀN BỘ (đổi hạ tầng dùng chung / schema / cấu hình dự án)');
    for (const reason of report.reasons) lines.push(`    - ${reason}`);
  } else if (report.changed.length === 0 && report.flows.length === 0 && report.unitDirs.length === 0) {
    lines.push('  Không có file nào ảnh hưởng runtime (chỉ docs/rule/công cụ); vẫn chạy yarn check:docs.');
  } else {
    lines.push(`  Module đã đổi:             ${list(report.changed)}`);
    lines.push(`  Phụ thuộc trực tiếp (bắt buộc kiểm lại): ${list(report.direct)}`);
    lines.push(`  Phụ thuộc gián tiếp:       ${list(report.transitive)}`);
  }
  lines.push('', `  Docs phải cập nhật: ${list(report.docsToUpdate)}`);
  if (report.docsToReview.length) lines.push(`  Docs cần rà lại:    ${list(report.docsToReview)}`);
  lines.push('', `  Unit test chạy lại: ${list(report.unitDirs)}`);
  lines.push(`  Flow test chạy lại (${report.flows.length}/${totalFlows}):`);
  for (const flow of report.flows) lines.push(`    - ${flow}`);
  lines.push('', '  Cổng cuối vẫn là chạy TOÀN BỘ: yarn test && yarn test:flows (CI cũng vậy).');
  return lines.join('\n');
}
