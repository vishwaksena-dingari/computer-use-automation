/**
 * @file Resolve project root and config/env file paths.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = 'computer-use-automation';

/**
 * Walk up from start until package.json name is computer-use-automation.
 * Falls back to the package next to compiled `dist/` when cwd is outside the repo.
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir);
  for (;;) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
        if (pkg.name === PACKAGE_NAME) return dir;
      } catch {
        /* keep walking */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const fromSrc = resolve(here, '../..');
  if (existsSync(join(fromSrc, 'package.json'))) return fromSrc;
  return resolve(startDir);
}

/** Absolute path to config.yaml (override wins). */
export function configYamlPath(root: string, override?: string): string {
  return override ? resolve(override) : join(root, 'config.yaml');
}

/** Absolute path to `.env` under project root. */
export function envFilePath(root: string): string {
  return join(root, '.env');
}
