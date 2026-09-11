/**
 * @file Evidence bag helpers — manifests, run ledgers, screenshots dirs.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function writeJson(path: string, value: unknown): void {
  ensureDir(join(path, '..'));
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export function newRunId(prefix = 'run'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sha256Text(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Prepare a chapter directory under evidence/.
 */
export function prepareChapter(evidenceRoot: string, chapter: string): string {
  const dir = join(evidenceRoot, chapter);
  ensureDir(join(dir, 'screenshots'));
  ensureDir(join(dir, 'hitl'));
  return dir;
}

export function copyCapabilitySnapshot(chapterDir: string, capabilityPath: string): void {
  if (!existsSync(capabilityPath)) return;
  cpSync(capabilityPath, join(chapterDir, 'capability.snapshot.json'));
}
