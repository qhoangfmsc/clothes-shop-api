import type { Problem } from './docs-checks';
import { moduleOf } from './source-graph';

export interface ChangeInput {
  /** File đổi so với nhánh gốc (`git diff --name-only base...HEAD`) */
  changedFiles: string[];
  /** Nội dung đầy đủ các commit của PR (`git log base..HEAD --format=%B`) */
  commitMessages: string[];
}

const isTestFile = (path: string) => path.endsWith('.spec.ts') || path.endsWith('.test-utils.ts');
const isBehaviorSource = (path: string) => path.endsWith('.ts') && /^src\/(modules|common|core)\//.test(path) && !isTestFile(path);
const isTest = (path: string) => (path.endsWith('.spec.ts') && path.startsWith('src/')) || /^test\/(flows|support)\//.test(path);

/** Trailer miễn có lý do, vd `No-Docs: đổi tên biến nội bộ`; trailer rỗng không tính */
export function waivers(commitMessages: string[], kind: 'No-Test' | 'No-Docs'): string[] {
  const found: string[] = [];
  for (const message of commitMessages) {
    for (const [, reason] of message.matchAll(new RegExp(`^${kind}:[ \\t]*(\\S[^\\n]{2,})$`, 'gim'))) found.push(reason.trim());
  }
  return found;
}

const docsOwnerOf = (path: string) => {
  const module = moduleOf(path);
  return module ? `docs/modules/${module}.md` : 'docs/modules/common.md';
};

/**
 * Kỷ luật thay đổi trên PR vào main (docs/specs/common/0015):
 * C1 đổi code hành vi thì phải đổi test; C2 đổi module thì đổi docs module đó; C3 đổi migration/hạ tầng thì đổi common.md.
 */
export function checkChange({ changedFiles, commitMessages }: ChangeInput): Problem[] {
  const problems: Problem[] = [];
  const changed = new Set(changedFiles);
  const behavior = changedFiles.filter(isBehaviorSource);
  const migrations = changedFiles.filter((path) => path.startsWith('src/migrations/'));
  const noTest = waivers(commitMessages, 'No-Test');
  const noDocs = waivers(commitMessages, 'No-Docs');

  if ((behavior.length > 0 || migrations.length > 0) && !changedFiles.some(isTest) && noTest.length === 0) {
    problems.push({
      check: 'C1',
      message: `đổi ${behavior.length + migrations.length} file trong src nhưng không đổi test nào (*.spec.ts, test/flows) — thêm test hoặc ghi "No-Test: <lý do>" ở một commit`,
    });
  }

  if (noDocs.length === 0) {
    const owners = new Map<string, string[]>();
    for (const path of behavior) owners.set(docsOwnerOf(path), [...(owners.get(docsOwnerOf(path)) ?? []), path]);
    if (migrations.length > 0) owners.set('docs/modules/common.md', [...(owners.get('docs/modules/common.md') ?? []), ...migrations]);
    for (const [doc, files] of [...owners].sort()) {
      const check = doc === 'docs/modules/common.md' ? 'C3' : 'C2';
      if (!changed.has(doc))
        problems.push({
          check,
          message: `${doc} chưa đổi dù đã đổi ${files[0]}${files.length > 1 ? ` (+${files.length - 1} file)` : ''} — cập nhật docs hoặc ghi "No-Docs: <lý do>"`,
        });
    }
  }
  return problems;
}
