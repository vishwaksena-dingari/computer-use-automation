/**
 * @file Evidence screenshot gallery helpers for fillFormFlow apply runs.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { writeJson, ensureDir } from './store.js';

/** Minimal page surface used by capture (Playwright Page satisfies this). */
export type ShotPage = {
  screenshot: (opts: { path: string; fullPage?: boolean }) => Promise<Buffer>;
};

/**
 * Full-page evidence shot under `screenshots/`. Never throws (apply must not crash).
 * Appends relative path to `gallery` only when the file lands on disk.
 */
export async function captureEvidenceShot(
  page: ShotPage,
  evidenceDir: string,
  fileName: string,
  gallery: string[],
): Promise<void> {
  const abs = join(evidenceDir, 'screenshots', fileName);
  await page.screenshot({ path: abs, fullPage: true }).catch(() => undefined);
  if (existsSync(abs)) gallery.push(`screenshots/${fileName}`);
}

/** Persist gallery paths for operators browsing evidence. */
export function writeScreenshotManifest(evidenceDir: string, shots: string[]): void {
  writeJson(join(evidenceDir, 'screenshots-manifest.json'), {
    schemaVersion: 1,
    shots,
  });
}

/** Self-check: success path records gallery entry; throw path is swallowed. */
export async function selfCheckEvidenceShots(): Promise<void> {
  const dir = join(process.cwd(), '.scratch', 'shot-self-check');
  rmSync(dir, { recursive: true, force: true });
  ensureDir(join(dir, 'screenshots'));
  const gallery: string[] = [];
  const okPage: ShotPage = {
    screenshot: async ({ path }) => {
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, 'png');
      return Buffer.from('png');
    },
  };
  await captureEvidenceShot(okPage, dir, 'page-0-before-fill.png', gallery);
  if (!gallery.includes('screenshots/page-0-before-fill.png')) {
    throw new Error('gallery must record successful shot');
  }
  const badPage: ShotPage = {
    screenshot: async () => {
      throw new Error('boom');
    },
  };
  await captureEvidenceShot(badPage, dir, 'page-0-after-fill.png', gallery);
  if (gallery.length !== 1) throw new Error('failed shot must not append');
  writeScreenshotManifest(dir, gallery);
  if (!existsSync(join(dir, 'screenshots-manifest.json'))) {
    throw new Error('manifest missing');
  }
  rmSync(dir, { recursive: true, force: true });
}

if (process.argv[1]?.endsWith('shots.ts') || process.argv[1]?.endsWith('shots.js')) {
  selfCheckEvidenceShots()
    .then(() => console.log('evidence-shots self-check ok'))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
}
