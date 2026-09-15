/**
 * @file `cua doctor` — local environment checks for apply operators (letter I).
 * Prints JSON lines of { ok, check, detail }; exit 0 only if all required checks pass.
 */
import { existsSync, accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findProjectRoot } from '../config/paths.js';
import { loadConfig, validateConfig } from '../config/load.js';

export type DoctorCheck = { ok: boolean; check: string; detail: string; required?: boolean };

/** Run doctor checks. Side effect: may spawn `npx playwright --version` (optional). */
export function runDoctorChecks(root = findProjectRoot()): DoctorCheck[] {
  const out: DoctorCheck[] = [];
  const distMain = join(root, 'dist', 'cli', 'main.js');
  out.push({
    check: 'build',
    required: true,
    ok: existsSync(distMain),
    detail: existsSync(distMain) ? 'dist/cli/main.js present' : 'run npm run build',
  });
  try {
    const loaded = loadConfig({});
    const errs = validateConfig(loaded);
    out.push({
      check: 'config',
      required: true,
      ok: errs.length === 0,
      detail: errs.length ? errs.join('; ') : `ok provider=${loaded.config.llm.provider}`,
    });
    const hosts = loaded.config.policy?.allowedHosts;
    const hostOk = Array.isArray(hosts) && hosts.length > 0;
    out.push({
      check: 'allowed_hosts',
      required: false,
      ok: hostOk,
      detail: hostOk
        ? `allowedHosts=${hosts.length} (config.yaml + config.local.yaml)`
        : 'no policy.allowedHosts — live ATS will refuse navigation',
    });
  } catch (e) {
    out.push({
      check: 'config',
      required: true,
      ok: false,
      detail: (e as Error).message,
    });
    out.push({
      check: 'allowed_hosts',
      required: false,
      ok: false,
      detail: 'config load failed',
    });
  }
  const privateDir = join(root, '.private');
  out.push({
    check: 'private_dir',
    required: false,
    ok: existsSync(privateDir),
    detail: existsSync(privateDir)
      ? '.private/ present (gitignored vault stage)'
      : 'optional — create via copy-vault-private.sh',
  });
  const claim = join(root, 'fixtures', 'sample-apply-claim.json');
  out.push({
    check: 'claim_fixture',
    required: false,
    ok: existsSync(claim),
    detail: existsSync(claim) ? 'fixtures/sample-apply-claim.json' : 'missing claim fixture',
  });
  const item = join(root, 'fixtures', 'sample-queue-item.json');
  out.push({
    check: 'item_fixture',
    required: false,
    ok: existsSync(item),
    detail: existsSync(item) ? 'fixtures/sample-queue-item.json' : 'missing queue-item fixture',
  });
  const resume = join(root, 'fixtures', 'resume.txt');
  out.push({
    check: 'resume_fixture',
    required: false,
    ok: existsSync(resume),
    detail: existsSync(resume) ? 'fixtures/resume.txt (stage into .private/)' : 'missing resume fixture',
  });
  // Path-jail module present (apply refuses escapes via resolveUnderRoot).
  const pathsMod = join(root, 'dist', 'config', 'paths.js');
  out.push({
    check: 'path_jail',
    required: true,
    ok: existsSync(pathsMod),
    detail: existsSync(pathsMod)
      ? 'dist/config/paths.js (resolveUnderRoot jail)'
      : 'run npm run build — path jail missing from dist',
  });
  try {
    accessSync(join(root, 'node_modules', 'playwright'), constants.R_OK);
    out.push({ check: 'playwright_pkg', required: true, ok: true, detail: 'node_modules/playwright' });
  } catch {
    out.push({
      check: 'playwright_pkg',
      required: true,
      ok: false,
      detail: 'install playwright (npm i)',
    });
  }
  const pw = spawnSync('npx', ['playwright', '--version'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
  });
  out.push({
    check: 'playwright_cli',
    required: false,
    ok: pw.status === 0,
    detail: pw.status === 0 ? (pw.stdout || pw.stderr || 'ok').trim() : 'npx playwright --version failed',
  });
  return out;
}

export function selfCheckDoctor(): void {
  const checks = runDoctorChecks();
  if (!checks.some((c) => c.check === 'build')) throw new Error('doctor missing build check');
  if (!checks.some((c) => c.check === 'config')) throw new Error('doctor missing config check');
  if (!checks.some((c) => c.check === 'path_jail')) throw new Error('doctor missing path_jail check');
}

if (process.argv[1]?.endsWith('doctor.ts') || process.argv[1]?.endsWith('doctor.js')) {
  selfCheckDoctor();
  const checks = runDoctorChecks();
  for (const c of checks) console.log(JSON.stringify(c));
  const bad = checks.filter((c) => c.required && !c.ok);
  console.log(JSON.stringify({ ok: bad.length === 0, failed: bad.map((c) => c.check) }));
  if (bad.length) process.exitCode = 1;
  else console.log('doctor self-check ok');
}
