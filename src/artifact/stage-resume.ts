/**
 * @file Stage claim/item resume paths into `.private/` for path-jailed fill (T-L-3).
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, isAbsolute, join } from 'node:path';
import { resolveUnderRoot } from '../config/paths.js';

const ALLOWED_RESUME_EXT = new Set(['.pdf', '.txt', '.doc', '.docx']);

/**
 * Copy a resume hint (repo-relative or absolute vault path) into `.private/resume.<ext>`.
 * Returns the jailed relative path for `profile.resumePath`, or undefined if no hint.
 * Side effect: writes under `privateDirName` (default `.private`).
 */
export function stageResumeIntoPrivate(
  root: string,
  resumeHint: string | undefined,
  privateDirName = '.private',
): string | undefined {
  if (!resumeHint?.trim()) return undefined;
  const hint = resumeHint.trim();
  const src = isAbsolute(hint) ? hint : resolveUnderRoot(root, hint, { realpath: true });
  if (!existsSync(src)) {
    throw new Error(`resume not found: ${hint}`);
  }
  const ext = extname(src).toLowerCase() || '.pdf';
  if (!ALLOWED_RESUME_EXT.has(ext)) {
    throw new Error(`resume extension not allowed: ${ext}`);
  }
  const privateDir = join(root, privateDirName);
  mkdirSync(privateDir, { recursive: true });
  const destName = `resume${ext}`;
  const destAbs = join(privateDir, destName);
  copyFileSync(src, destAbs);
  return `${privateDirName}/${destName}`;
}

export function selfCheckStageResume(): void {
  // ponytail: avoid writing real `.private/` (often cursorignored / sandboxed); tmp root is enough.
  const root = mkdtempSync(join(tmpdir(), 'cua-stage-resume-'));
  try {
    mkdirSync(join(root, 'fixtures'), { recursive: true });
    writeFileSync(join(root, 'fixtures', 'resume.txt'), 'stage-resume self-check\n');
    const staged = stageResumeIntoPrivate(root, 'fixtures/resume.txt');
    if (staged !== '.private/resume.txt') throw new Error(`expected .private/resume.txt got ${staged}`);
    if (!existsSync(join(root, staged))) throw new Error('staged file missing');
    if (!readFileSync(join(root, staged), 'utf8').length) throw new Error('empty staged resume');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith('stage-resume.ts') || process.argv[1]?.endsWith('stage-resume.js')) {
  selfCheckStageResume();
  console.log('stage-resume self-check ok');
}
