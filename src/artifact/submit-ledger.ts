/**
 * @file Local double-submit guard — refuse a second `--submit` for the same job + profile email.
 * Ledger: `.private/submit-ledger.json` (gitignored). Delete the file to reset.
 *
 * ponytail: no file lock (single-operator CLI). Fail closed on corrupt JSON.
 * Job identity keeps query string (Greenhouse `?gh_jid=`). Hash is key only; jobUrl stored clear.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveUnderRoot } from '../config/paths.js';
import { getProfilePath } from './profile.js';

export type SubmitLedgerEntry = {
  key: string;
  jobUrl: string;
  at: string;
  /** undefined = intent recorded before click; true/false = after confirmation scrape */
  submitConfirmed?: boolean;
};

type LedgerFile = { schemaVersion: 1; entries: SubmitLedgerEntry[] };

function ledgerFile(root: string): string {
  return resolveUnderRoot(root, '.private/submit-ledger.json');
}

/**
 * Normalize job URL for identity: host + path (trim trailing /) + search (job ids often live in query).
 * Ashby Overview vs `/application` (and `/overview`) are the same posting — collapse those suffixes.
 */
export function normalizeJobUrl(jobUrl: string): string {
  try {
    const u = new URL(jobUrl);
    let path = u.pathname.replace(/\/$/, '') || '';
    // FRAGILE: Ashby only — other ATS path suffixes must stay distinct (e.g. Greenhouse embed tokens).
    if (/\.ashbyhq\.com$/i.test(u.host)) {
      path = path.replace(/\/(application|overview)$/i, '');
    }
    return `${u.host}${path}${u.search}`;
  } catch {
    return jobUrl.trim().replace(/\/$/, '');
  }
}

/**
 * Stable ledger key from job URL + profile email (casefold).
 * Side effect: none.
 */
export function submitGuardKey(jobUrl: string, profile: Record<string, unknown>): string {
  const hostPath = normalizeJobUrl(jobUrl);
  const emailRaw = getProfilePath(profile, 'email');
  const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
  return createHash('sha256').update(`${hostPath}\0${email}`).digest('hex').slice(0, 16);
}

function loadLedger(root: string): LedgerFile {
  const path = ledgerFile(root);
  if (!existsSync(path)) return { schemaVersion: 1, entries: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`submit ledger corrupt — inspect or delete ${path}`);
  }
  const o = parsed as { schemaVersion?: number; entries?: SubmitLedgerEntry[] };
  if (o.schemaVersion !== 1 || !Array.isArray(o.entries)) {
    throw new Error(`submit ledger corrupt — inspect or delete ${path}`);
  }
  return { schemaVersion: 1, entries: o.entries };
}

function writeLedgerAtomic(root: string, data: LedgerFile): void {
  const path = ledgerFile(root);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.submit-ledger.${process.pid}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, path);
}

/**
 * Refuse if this job+profile was already recorded (intent or confirmed).
 * Throws if ledger JSON is corrupt (fail closed).
 */
export function checkSubmitGuard(
  root: string,
  key: string,
): { ok: true } | { ok: false; detail: string } {
  const { entries } = loadLedger(root);
  const hit = entries.find((e) => e.key === key);
  if (!hit) return { ok: true };
  return {
    ok: false,
    detail: `submit refused: already recorded for this job+profile at ${hit.at}${
      hit.submitConfirmed === true ? ' (confirmed)' : hit.submitConfirmed === false ? ' (unconfirmed)' : ' (intent)'
    }`,
  };
}

/** Record intent before click, or update confirmation after. */
export function recordSubmitGuard(
  root: string,
  entry: { key: string; jobUrl: string; submitConfirmed?: boolean },
): void {
  const data = loadLedger(root);
  const next: SubmitLedgerEntry = {
    key: entry.key,
    jobUrl: entry.jobUrl,
    at: new Date().toISOString(),
    submitConfirmed: entry.submitConfirmed,
  };
  const i = data.entries.findIndex((e) => e.key === next.key);
  if (i >= 0) data.entries[i] = next;
  else data.entries.push(next);
  writeLedgerAtomic(root, data);
}

/** Drop a key (e.g. click failed after intent) so the operator can retry. */
export function clearSubmitGuardKey(root: string, key: string): void {
  const data = loadLedger(root);
  const next = data.entries.filter((e) => e.key !== key);
  if (next.length === data.entries.length) return;
  writeLedgerAtomic(root, { schemaVersion: 1, entries: next });
}

export function selfCheckSubmitGuard(): void {
  const a = submitGuardKey('https://job-boards.greenhouse.io/figma/jobs/1?x=1', {
    email: 'A@x.com',
  });
  const b = submitGuardKey('https://job-boards.greenhouse.io/figma/jobs/1/?x=1', {
    email: 'a@x.com',
  });
  const c = submitGuardKey('https://job-boards.greenhouse.io/figma/jobs/2?x=1', {
    email: 'a@x.com',
  });
  const d = submitGuardKey('https://boards.greenhouse.io/embed/job_app?for=figma&token=1', {
    email: 'a@x.com',
  });
  const e = submitGuardKey('https://boards.greenhouse.io/embed/job_app?for=figma&token=2', {
    email: 'a@x.com',
  });
  if (a !== b) throw new Error('submitGuardKey normalize');
  if (a === c) throw new Error('submitGuardKey must differ by job path');
  if (d === e) throw new Error('submitGuardKey must keep query (token)');
  if (normalizeJobUrl('https://x.com/a/') !== 'x.com/a') throw new Error('normalizeJobUrl path');
  const ashOverview = submitGuardKey('https://jobs.ashbyhq.com/co/role-1', { email: 'a@x.com' });
  const ashApp = submitGuardKey('https://jobs.ashbyhq.com/co/role-1/application', { email: 'a@x.com' });
  const ashOther = submitGuardKey('https://jobs.ashbyhq.com/co/role-2/application', { email: 'a@x.com' });
  if (ashOverview !== ashApp) throw new Error('Ashby Overview must equal /application ledger key');
  if (ashOverview === ashOther) throw new Error('Ashby distinct roles must differ');
}

if (process.argv[1]?.endsWith('submit-ledger.ts') || process.argv[1]?.endsWith('submit-ledger.js')) {
  selfCheckSubmitGuard();
  console.log('submit-ledger self-check ok');
}
