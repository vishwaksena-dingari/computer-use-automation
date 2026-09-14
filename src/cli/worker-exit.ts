/**
 * @file Worker-facing exit codes + thin stdout summary for `cua apply` (P3/P5).
 * Gen (G14/G15): optional `gathered` bag from extracts + fill-receipt; submit = verify.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReplayResult } from '../replay/engine.js';
import type { FillReceipt } from '../artifact/fill-receipt.js';

/** 0 ok · 2 HITL waiting · 3 closed · 4 unmapped/verify/fail */
export type WorkerExitCode = 0 | 2 | 3 | 4;

export type WorkerOutcome =
  | 'filled'
  | 'submitted'
  | 'captcha'
  | 'closed'
  | 'unmapped'
  | 'verify'
  | 'failed'
  | 'paused';

/** Related results for callers (G14). Submit mode may omit harvest (G15). */
export type WorkerGathered = {
  extracts: Record<string, string>;
  filled: Array<{ key: string; profilePath: string; verified: boolean; actual?: string }>;
  missingOutputs: string[];
  /** True only when --submit and confirmation banner observed. */
  submitVerified: boolean;
};

export type WorkerSummary = {
  ok: boolean;
  outcome: WorkerOutcome;
  code: string | null;
  evidenceDir: string;
  runId: string;
  exitCode: WorkerExitCode;
  /** Explicit so operators/reviewers never confuse fill-only with submit. */
  mode: 'fill-only' | 'submit';
  /** Related bag; on submit-success primary signal is submitVerified. */
  gathered?: WorkerGathered;
};

/** Load fill-receipt.json if present (redacted). */
export function loadFillReceipt(evidenceDir: string): FillReceipt | null {
  const p = join(evidenceDir, 'fill-receipt.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as FillReceipt;
  } catch {
    return null;
  }
}

/** Build gathered bag from replay extracts + optional receipt (G14). */
export function buildWorkerGathered(opts: {
  extracts: Record<string, string>;
  receipt: FillReceipt | null;
  missingOutputs?: string[];
  submitVerified: boolean;
  /** When true (submit + verified), skip listing filled harvest as primary (G15). */
  submitHarvestLight?: boolean;
}): WorkerGathered {
  const filled =
    opts.submitHarvestLight && opts.submitVerified
      ? []
      : (opts.receipt?.entries ?? []).map((e) => ({
          key: e.key,
          profilePath: e.profilePath,
          verified: e.verified,
          actual: e.actual,
        }));
  return {
    extracts: { ...opts.extracts },
    filled,
    missingOutputs: opts.missingOutputs ?? [],
    submitVerified: opts.submitVerified,
  };
}

/** Map replay result → operator/worker summary + process exit code. */
export function workerSummaryFromReplay(
  result: ReplayResult,
  opts: {
    submitted?: boolean;
    allowSubmit?: boolean;
    /** Declared Capability output names still empty after run. */
    missingOutputs?: string[];
    /** Attach gathered bag (default true when evidenceDir readable). */
    includeGathered?: boolean;
  } = {},
): WorkerSummary {
  const code = result.code ?? null;
  let outcome: WorkerOutcome = 'failed';
  let exitCode: WorkerExitCode = 4;
  const mode: 'fill-only' | 'submit' = opts.allowSubmit ? 'submit' : 'fill-only';
  const submitVerified = Boolean(opts.submitted);

  if (result.paused || /paused:/i.test(result.message ?? '')) {
    outcome = code === 'form.CAPTCHA' ? 'captcha' : 'paused';
    exitCode = 2;
  } else if (code === 'form.CAPTCHA') {
    outcome = 'captcha';
    exitCode = 2;
  } else if (code === 'form.CLOSED') {
    outcome = 'closed';
    exitCode = 3;
  } else if (code === 'field.UNMAPPED') {
    outcome = 'unmapped';
    exitCode = 4;
  } else if (code === 'field.VERIFY') {
    outcome = 'verify';
    exitCode = 4;
  } else if (result.ok && result.status === 'SUCCESS') {
    outcome = opts.submitted ? 'submitted' : 'filled';
    exitCode = 0;
  } else if (result.ok && result.status === 'BUSINESS_OUTCOME') {
    outcome = 'failed';
    exitCode = 4;
  }

  const summary: WorkerSummary = {
    ok: exitCode === 0,
    outcome,
    code,
    evidenceDir: result.evidenceDir,
    runId: result.runId,
    exitCode,
    mode,
  };

  if (opts.includeGathered !== false) {
    const receipt = loadFillReceipt(result.evidenceDir);
    summary.gathered = buildWorkerGathered({
      extracts: result.outputs ?? {},
      receipt,
      missingOutputs: opts.missingOutputs,
      submitVerified,
      submitHarvestLight: mode === 'submit' && submitVerified,
    });
  }

  return summary;
}

export function selfCheckWorkerExit(): void {
  const base = {
    capabilityId: 'c',
    capabilityVersion: '0.1.0',
    params: {} as Record<string, string>,
    status: 'HARD_FAILURE' as const,
    message: 'paused: captcha',
    outputs: {} as Record<string, string>,
    error: null,
    runId: 'r1',
    evidenceDir: 'evidence/private/x',
    durationMs: 1,
    llmCalls: 0,
  };
  const paused = workerSummaryFromReplay(
    {
      ...base,
      ok: false,
      code: 'form.CAPTCHA',
      paused: true,
    },
    { includeGathered: false },
  );
  if (paused.exitCode !== 2 || paused.outcome !== 'captcha') throw new Error('captcha exit');
  const closed = workerSummaryFromReplay(
    {
      ...base,
      ok: true,
      status: 'BUSINESS_OUTCOME',
      code: 'form.CLOSED',
      message: 'closed',
      paused: false,
    },
    { includeGathered: false },
  );
  if (closed.exitCode !== 3) throw new Error('closed exit');
  const ok = workerSummaryFromReplay(
    {
      ...base,
      ok: true,
      status: 'SUCCESS',
      code: null,
      message: 'ok',
      paused: false,
      outputs: { savingsBalance: '$1' },
    },
    { includeGathered: false },
  );
  if (ok.exitCode !== 0 || ok.outcome !== 'filled') throw new Error('success exit');
  if (ok.mode !== 'fill-only') throw new Error('fill-only mode');
  const submitMode = workerSummaryFromReplay(
    { ...base, ok: true, status: 'SUCCESS', code: null, message: 'ok', paused: false },
    { allowSubmit: true, submitted: true, includeGathered: false },
  );
  if (submitMode.mode !== 'submit' || submitMode.outcome !== 'submitted') {
    throw new Error('submit mode');
  }
  const submitUnconfirmed = workerSummaryFromReplay(
    { ...base, ok: true, status: 'SUCCESS', code: null, message: 'ok', paused: false },
    { allowSubmit: true, submitted: false, includeGathered: false },
  );
  if (submitUnconfirmed.outcome !== 'filled' || submitUnconfirmed.mode !== 'submit') {
    throw new Error('submit without confirm must be filled');
  }
  const empty = workerSummaryFromReplay(
    {
      ...base,
      ok: true,
      status: 'BUSINESS_OUTCOME',
      code: 'field.UNMAPPED',
      message: 'empty fill: no fields filled',
      paused: false,
    },
    { includeGathered: false },
  );
  if (empty.exitCode !== 4 || empty.outcome !== 'unmapped') throw new Error('empty fill exit');

  const receipt: FillReceipt = {
    schemaVersion: 1,
    at: new Date().toISOString(),
    entries: [
      {
        key: 'email',
        profilePath: 'email',
        kind: 'text',
        expected: 'a***@example.test',
        actual: 'a***@example.test',
        verified: true,
      },
    ],
    filledKeys: ['email'],
    unverifiedRequired: [],
  };
  const bag = buildWorkerGathered({
    extracts: { a: '1' },
    receipt,
    missingOutputs: ['savingsBalance'],
    submitVerified: false,
  });
  if (!bag.filled[0]?.verified || bag.missingOutputs[0] !== 'savingsBalance') {
    throw new Error('gathered bag');
  }
  const light = buildWorkerGathered({
    extracts: {},
    receipt,
    submitVerified: true,
    submitHarvestLight: true,
  });
  if (light.filled.length !== 0 || !light.submitVerified) throw new Error('submit light harvest');
}

if (process.argv[1]?.endsWith('worker-exit.ts') || process.argv[1]?.endsWith('worker-exit.js')) {
  selfCheckWorkerExit();
  console.log('worker-exit self-check ok');
}
