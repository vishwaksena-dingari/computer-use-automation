/**
 * @file `cua last` — summarize newest evidence/private worker.json chapters (letter H).
 * Prints JSON only (no profile PII values).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { findProjectRoot } from '../config/paths.js';

export type LastRunSummary = {
  evidenceDir: string;
  mtimeMs: number;
  exitCode?: number;
  outcome?: string;
  code?: string | null;
  mode?: string;
  submitVerifyState?: string;
  runId?: string;
};

/**
 * List recent private evidence chapters that have worker.json, newest first.
 * Side effect: none (reads only).
 */
export function listRecentWorkerRuns(root = findProjectRoot(), limit = 5): LastRunSummary[] {
  const privateDir = join(root, 'evidence', 'private');
  if (!existsSync(privateDir)) return [];
  const rows: LastRunSummary[] = [];
  for (const name of readdirSync(privateDir)) {
    const dir = join(privateDir, name);
    let st;
    try {
      st = statSync(dir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const workerPath = join(dir, 'worker.json');
    if (!existsSync(workerPath)) continue;
    let worker: Record<string, unknown> = {};
    try {
      worker = JSON.parse(readFileSync(workerPath, 'utf8')) as Record<string, unknown>;
    } catch {
      continue;
    }
    const gathered = (worker.gathered ?? {}) as Record<string, unknown>;
    rows.push({
      evidenceDir: `evidence/private/${name}`,
      mtimeMs: st.mtimeMs,
      exitCode: typeof worker.exitCode === 'number' ? worker.exitCode : undefined,
      outcome: typeof worker.outcome === 'string' ? worker.outcome : undefined,
      code: (worker.code as string | null | undefined) ?? null,
      mode: typeof worker.mode === 'string' ? worker.mode : undefined,
      submitVerifyState:
        typeof gathered.submitVerifyState === 'string' ? gathered.submitVerifyState : undefined,
      runId: typeof worker.runId === 'string' ? worker.runId : undefined,
    });
  }
  rows.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return rows.slice(0, Math.max(1, limit));
}

export function selfCheckLastRuns(): void {
  const rows = listRecentWorkerRuns(findProjectRoot(), 3);
  if (!Array.isArray(rows)) throw new Error('listRecentWorkerRuns');
  for (const r of rows) {
    if (!r.evidenceDir.startsWith('evidence/private/')) throw new Error('path shape');
  }
}

if (process.argv[1]?.endsWith('last-runs.ts') || process.argv[1]?.endsWith('last-runs.js')) {
  selfCheckLastRuns();
  console.log('last-runs self-check ok');
}
