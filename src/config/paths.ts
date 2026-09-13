/**
 * @file Resolve project root and config/env file paths.
 */
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, extname } from 'node:path';
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
 * Returns absolute path under root. Pass `realpath: true` to reject symlink escapes
 * (same policy as upload jail / --profile). Nonexistent write targets jail via nearest
 * existing ancestor realpath (T-B-25).
 */
export function resolveUnderRoot(
  root: string,
  relOrAbs: string,
  opts?: { realpath?: boolean },
): string {
  const abs = isAbsolute(relOrAbs) ? resolve(relOrAbs) : resolve(root, relOrAbs);
  if (opts?.realpath) {
    const rootReal = existsSync(root) ? realpathSync(root) : resolve(root);
    // Dangling symlink leaf: existsSync is false but writeFileSync would follow — refuse.
    try {
      if (lstatSync(abs).isSymbolicLink() && !existsSync(abs)) {
        throw new Error(`path must be inside project root: ${relOrAbs}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('path must be inside')) throw e;
      // ENOENT — fall through to ancestor jail.
    }
    if (existsSync(abs)) {
      const absReal = realpathSync(abs);
      const rel = relative(rootReal, absReal);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new Error(`path must be inside project root: ${relOrAbs}`);
      }
      return absReal;
    }
    // Leaf may not exist yet (writes) — realpath nearest existing ancestor.
    let ancestor = dirname(abs);
    while (!existsSync(ancestor)) {
      const parent = dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
    const ancestorReal = existsSync(ancestor) ? realpathSync(ancestor) : resolve(ancestor);
    const leaf = relative(ancestor, abs);
    const absReal = leaf && leaf !== '' ? resolve(ancestorReal, leaf) : ancestorReal;
    const rel = relative(rootReal, absReal);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`path must be inside project root: ${relOrAbs}`);
    }
    return absReal;
  }
  const rel = relative(resolve(root), abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`path must be inside project root: ${relOrAbs}`);
  }
  return abs;
}

/** Allowed resume / upload extensions (T-B-20). */
const UPLOAD_EXTS = new Set(['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt']);

/**
 * Resolve an upload path under root (realpath) and require a document extension.
 */
export function resolveUploadUnderRoot(root: string, relOrAbs: string): string {
  const abs = resolveUnderRoot(root, relOrAbs, { realpath: true });
  const ext = extname(abs).toLowerCase();
  if (!UPLOAD_EXTS.has(ext)) {
    throw new Error(`upload must be a document (${[...UPLOAD_EXTS].join(', ')}), got: ${relOrAbs}`);
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

/** Self-check: resolveUnderRoot refuses escapes; realpath + upload ext. */
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
  threw = false;
  try {
    resolveUploadUnderRoot(root, 'fixtures/applicant-profile.json');
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('resolveUploadUnderRoot should refuse non-document');
  const real = resolveUnderRoot(root, 'fixtures/applicant-profile.json', { realpath: true });
  if (!real.includes('applicant-profile')) throw new Error('realpath resolve failed');
  // T-B-25: nonexistent leaf under root still jails via ancestor realpath.
  const nested = resolveUnderRoot(root, 'evidence/private/__write_jail_probe__/out.json', {
    realpath: true,
  });
  if (!nested.includes('evidence')) throw new Error('write-path resolve failed');
  let escapeThrew = false;
  try {
    resolveUnderRoot(root, '../outside/__write_jail_probe__/x.json', { realpath: true });
  } catch {
    escapeThrew = true;
  }
  if (!escapeThrew) throw new Error('realpath write path must refuse .. escape');
}

if (process.argv[1]?.endsWith('paths.ts') || process.argv[1]?.endsWith('paths.js')) {
  selfCheckPaths();
  console.log('paths self-check ok');
}
