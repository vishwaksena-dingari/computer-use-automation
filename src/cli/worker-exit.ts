/**
 * @file Worker-facing exit codes + thin stdout summary for `cua apply` (P3/P5).
 * Gen (G14/G15): optional `gathered` bag from extracts + fill-receipt; submit = verify.
 * Adapt: confirmation proof + explicit submitVerifyState (attempted ≠ verified).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReplayResult } from '../replay/engine.js';
import type { FillReceipt } from '../artifact/fill-receipt.js';
import { resolveSubmitVerifyState, type SubmitVerifyState } from '../artifact/submit-proof.js';

/** 0 ok · 2 HITL waiting · 3 closed · 4 unmapped/verify/fail */
export type WorkerExitCode = 0 | 2 | 3 | 4;

/** Distinct workflow phases (G18) — report what actually ran, not what was requested. */
export type WorkerPhase = 'transform' | 'fill' | 'submit' | 'verify' | 'report';

export type WorkerOutcome =
  | 'filled'
  | 'submitted'
  | 'submit_unconfirmed'
  | 'captcha'
  | 'closed'
  | 'unmapped'
  | 'verify'
  | 'duplicate'
  | 'failed'
  | 'paused';

/** Related results for callers (G14). Submit mode may omit harvest (G15). */
export type WorkerGathered = {
  extracts: Record<string, string>;
  filled: Array<{ key: string; profilePath: string; verified: boolean; actual?: string }>;
  missingOutputs: string[];
  /** True only when --submit and confirmation banner observed. */
  submitVerified: boolean;
  /** Clicked Submit under --submit (may still be unconfirmed). */
  submitAttempted: boolean;
  /** Explicit verify ladder — never equate click with success. */
  submitVerifyState: SubmitVerifyState;
  /** Optional fields skipped (empty profile) — not a failure. */
  skippedOptional?: string[];
  /** Minimum required profile paths still needed (actionable ask). */
  missingRequiredPaths?: string[];
  /** Visible confirmation snippet when scraped. */
  confirmationText?: string;
  /** Application / confirmation / reference id when labeled on page. */
  confirmationReference?: string;
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
  /**
   * Phases that actually completed (G18).
   * transform=profile normalize; fill=verified fields; submit=click; verify=banner or field verify; report=gathered.
   */
  phases: WorkerPhase[];
  /** Related bag; on submit-success primary signal is submitVerified + confirmation*. */
  gathered?: WorkerGathered;
};

/**
 * Which workflow phases completed for this run (never invent success).
 * fill-only: verify means DOM field verify via receipt; submit mode: verify means submitConfirmed.
 */
export function resolveWorkerPhases(opts: {
  hasProfile?: boolean;
  filledCount: number;
  allowSubmit?: boolean;
  submitAttempted?: boolean;
  submitVerified?: boolean;
}): WorkerPhase[] {
  const phases: WorkerPhase[] = [];
  if (opts.hasProfile) phases.push('transform');
  if (opts.filledCount > 0) phases.push('fill');
  if (opts.submitAttempted) phases.push('submit');
  if (opts.submitVerified) phases.push('verify');
  else if (!opts.allowSubmit && opts.filledCount > 0) phases.push('verify');
  phases.push('report');
  return phases;
}

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
  submitAttempted?: boolean;
  allowSubmit?: boolean;
  confirmationText?: string;
  confirmationReference?: string;
  /** When true (submit + verified), skip listing filled harvest as primary (G15). */
  submitHarvestLight?: boolean;
}): WorkerGathered {
  const submitAttempted = Boolean(opts.submitAttempted);
  const submitVerifyState = resolveSubmitVerifyState({
    allowSubmit: opts.allowSubmit,
    submitAttempted,
    submitConfirmed: opts.submitVerified,
  });
  const filled =
    opts.submitHarvestLight && opts.submitVerified
      ? []
      : (opts.receipt?.entries ?? []).map((e) => ({
          key: e.key,
          profilePath: e.profilePath,
          verified: e.verified,
          actual: e.actual,
        }));
  const bag: WorkerGathered = {
    extracts: { ...opts.extracts },
    filled,
    missingOutputs: opts.missingOutputs ?? [],
    submitVerified: opts.submitVerified,
    submitAttempted,
    submitVerifyState,
  };
  if (opts.confirmationText) bag.confirmationText = opts.confirmationText;
  if (opts.confirmationReference) bag.confirmationReference = opts.confirmationReference;
  if (opts.receipt?.skippedOptional?.length) {
    bag.skippedOptional = opts.receipt.skippedOptional;
  }
  if (opts.receipt?.missingRequiredPaths?.length) {
    bag.missingRequiredPaths = opts.receipt.missingRequiredPaths;
  }
  return bag;
}

/** Map replay result → operator/worker summary + process exit code. */
export function workerSummaryFromReplay(
  result: ReplayResult,
  opts: {
    submitted?: boolean;
    allowSubmit?: boolean;
    /** Profile was loaded / normalized for this run. */
    hasProfile?: boolean;
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
  const submitAttempted = Boolean(result.submitAttempted);

  if (result.paused || /paused:/i.test(result.message ?? '')) {
    outcome = code === 'form.CAPTCHA' ? 'captcha' : 'paused';
    exitCode = 2;
  } else if (code === 'form.CAPTCHA') {
    outcome = 'captcha';
    exitCode = 2;
  } else if (code === 'form.CLOSED') {
    outcome = 'closed';
    exitCode = 3;
  } else if (code === 'form.DUPLICATE') {
    outcome = 'duplicate';
    exitCode = 4;
  } else if (code === 'field.UNMAPPED') {
    outcome = 'unmapped';
    exitCode = 4;
  } else if (code === 'field.VERIFY') {
    outcome = 'verify';
    exitCode = 4;
  } else if (
    opts.allowSubmit &&
    submitAttempted &&
    !submitVerified &&
    result.ok &&
    result.status === 'SUCCESS'
  ) {
    // Clicked Submit but no confirmation — never claim submitted (Adapt / G15).
    outcome = 'submit_unconfirmed';
    exitCode = 4;
  } else if (result.ok && result.status === 'SUCCESS') {
    outcome = opts.submitted ? 'submitted' : 'filled';
    exitCode = 0;
  } else if (result.ok && result.status === 'BUSINESS_OUTCOME') {
    outcome = 'failed';
    exitCode = 4;
  }

  const receipt =
    opts.includeGathered !== false ? loadFillReceipt(result.evidenceDir) : null;
  const filledCount =
    receipt?.entries?.filter((e) => e.verified).length ??
    Object.keys(result.outputs ?? {}).length;

  const phases = resolveWorkerPhases({
    hasProfile: opts.hasProfile,
    filledCount,
    allowSubmit: opts.allowSubmit,
    submitAttempted,
    submitVerified,
  });

  const summary: WorkerSummary = {
    ok: exitCode === 0,
    outcome,
    code,
    evidenceDir: result.evidenceDir,
    runId: result.runId,
    exitCode,
    mode,
    phases,
  };

  if (opts.includeGathered !== false) {
    summary.gathered = buildWorkerGathered({
      extracts: result.outputs ?? {},
      receipt,
      missingOutputs: opts.missingOutputs,
      submitVerified,
      submitAttempted,
      allowSubmit: opts.allowSubmit,
      confirmationText: result.submitProof?.text,
      confirmationReference: result.submitProof?.reference,
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
  const dup = workerSummaryFromReplay(
    {
      ...base,
      ok: true,
      status: 'BUSINESS_OUTCOME',
      code: 'form.DUPLICATE',
      message: 'submit refused: already recorded',
      paused: false,
    },
    { includeGathered: false },
  );
  if (dup.exitCode !== 4 || dup.outcome !== 'duplicate') throw new Error('duplicate exit');
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
    {
      ...base,
      ok: true,
      status: 'SUCCESS',
      code: null,
      message: 'ok',
      paused: false,
      submitAttempted: true,
    },
    { allowSubmit: true, submitted: false, includeGathered: false },
  );
  if (
    submitUnconfirmed.outcome !== 'submit_unconfirmed' ||
    submitUnconfirmed.exitCode !== 4 ||
    submitUnconfirmed.ok
  ) {
    throw new Error('submit without confirm must be submit_unconfirmed');
  }
  const submitNoClick = workerSummaryFromReplay(
    {
      ...base,
      ok: true,
      status: 'SUCCESS',
      code: null,
      message: 'ok',
      paused: false,
      submitAttempted: false,
    },
    { allowSubmit: true, submitted: false, includeGathered: false },
  );
  if (submitNoClick.outcome !== 'filled' || submitNoClick.exitCode !== 0) {
    throw new Error('submit mode without click stays filled');
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
    allowSubmit: false,
  });
  if (
    !bag.filled[0]?.verified ||
    bag.missingOutputs[0] !== 'savingsBalance' ||
    bag.submitVerifyState !== 'not_requested'
  ) {
    throw new Error('gathered bag');
  }
  const light = buildWorkerGathered({
    extracts: {},
    receipt,
    submitVerified: true,
    submitAttempted: true,
    allowSubmit: true,
    confirmationText: 'Application received',
    confirmationReference: 'COA-1',
    submitHarvestLight: true,
  });
  if (
    light.filled.length !== 0 ||
    !light.submitVerified ||
    light.submitVerifyState !== 'verified' ||
    light.confirmationReference !== 'COA-1'
  ) {
    throw new Error('submit light harvest + proof');
  }

  const fillPhases = resolveWorkerPhases({
    hasProfile: true,
    filledCount: 2,
    allowSubmit: false,
  });
  if (fillPhases.join(',') !== 'transform,fill,verify,report') {
    throw new Error(`fill phases got ${fillPhases.join(',')}`);
  }
  const submitPhases = resolveWorkerPhases({
    hasProfile: true,
    filledCount: 2,
    allowSubmit: true,
    submitAttempted: true,
    submitVerified: true,
  });
  if (submitPhases.join(',') !== 'transform,fill,submit,verify,report') {
    throw new Error(`submit phases got ${submitPhases.join(',')}`);
  }
  const unconfPhases = resolveWorkerPhases({
    hasProfile: true,
    filledCount: 1,
    allowSubmit: true,
    submitAttempted: true,
    submitVerified: false,
  });
  if (unconfPhases.includes('verify') || !unconfPhases.includes('submit')) {
    throw new Error('unconfirmed must submit without verify');
  }
}

if (process.argv[1]?.endsWith('worker-exit.ts') || process.argv[1]?.endsWith('worker-exit.js')) {
  selfCheckWorkerExit();
  console.log('worker-exit self-check ok');
}
