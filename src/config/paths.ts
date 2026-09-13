/**
 * @file Resolve project root and config/env file paths.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
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

/** Gitignored local overlay beside config.yaml (never committed). */
export function configLocalYamlPath(root: string): string {
  return join(root, 'config.local.yaml');
}

/**
 * Resolve a repo-relative path and refuse escapes outside project root.
 * Returns absolute path under root.
 */
export function resolveUnderRoot(root: string, relOrAbs: string): string {
  const abs = isAbsolute(relOrAbs) ? resolve(relOrAbs) : resolve(root, relOrAbs);
  const rel = relative(resolve(root), abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`path must be inside project root: ${relOrAbs}`);
  }
  return abs;
}

/** Absolute path to `.env` under project root. */
export function envFilePath(root: string): string {
  return join(root, '.env');
}

/**
 * Repo-relative POSIX path for CLI/evidence output — never emit absolute home paths.
 */
export function repoRelative(root: string, filePath: string): string {
  const abs = isAbsolute(filePath) ? resolve(filePath) : resolve(root, filePath);
  const rel = relative(resolve(root), abs);
  return (rel === '' ? '.' : rel).split('\\').join('/');
}

/** Self-check: resolveUnderRoot refuses escapes. */
export function selfCheckPaths(): void {
  const root = findProjectRoot();
  const ok = resolveUnderRoot(root, 'fixtures/applicant-profile.json');
  if (!ok.includes('applicant-profile')) throw new Error('resolveUnderRoot failed');
  let threw = false;
  try {
    resolveUnderRoot(root, '../outside.json');
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('resolveUnderRoot should refuse ..');
}

if (process.argv[1]?.endsWith('paths.ts') || process.argv[1]?.endsWith('paths.js')) {
  selfCheckPaths();
  console.log('paths self-check ok');
}
