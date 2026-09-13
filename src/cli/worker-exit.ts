/**
 * @file Worker-facing exit codes + thin stdout summary for `cua apply` (P3/P5).
 */
import type { ReplayResult } from '../replay/engine.js';

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

export type WorkerSummary = {
  ok: boolean;
  outcome: WorkerOutcome;
  code: string | null;
  evidenceDir: string;
  runId: string;
  exitCode: WorkerExitCode;
  /** Explicit so operators/reviewers never confuse fill-only with submit. */
  mode: 'fill-only' | 'submit';
};

/** Map replay result → operator/worker summary + process exit code. */
export function workerSummaryFromReplay(
  result: ReplayResult,
  opts: { submitted?: boolean; allowSubmit?: boolean } = {},
): WorkerSummary {
  const code = result.code ?? null;
  let outcome: WorkerOutcome = 'failed';
  let exitCode: WorkerExitCode = 4;
  const mode: 'fill-only' | 'submit' = opts.allowSubmit ? 'submit' : 'fill-only';

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

  return {
    ok: exitCode === 0,
    outcome,
    code,
    evidenceDir: result.evidenceDir,
    runId: result.runId,
    exitCode,
    mode,
  };
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
  const paused = workerSummaryFromReplay({
    ...base,
    ok: false,
    code: 'form.CAPTCHA',
    paused: true,
  });
  if (paused.exitCode !== 2 || paused.outcome !== 'captcha') throw new Error('captcha exit');
  const closed = workerSummaryFromReplay({
    ...base,
    ok: true,
    status: 'BUSINESS_OUTCOME',
    code: 'form.CLOSED',
    message: 'closed',
    paused: false,
  });
  if (closed.exitCode !== 3) throw new Error('closed exit');
  const ok = workerSummaryFromReplay({
    ...base,
    ok: true,
    status: 'SUCCESS',
    code: null,
    message: 'ok',
    paused: false,
  });
  if (ok.exitCode !== 0 || ok.outcome !== 'filled') throw new Error('success exit');
  if (ok.mode !== 'fill-only') throw new Error('fill-only mode');
  const submitMode = workerSummaryFromReplay(
    { ...base, ok: true, status: 'SUCCESS', code: null, message: 'ok', paused: false },
    { allowSubmit: true, submitted: true },
  );
  if (submitMode.mode !== 'submit' || submitMode.outcome !== 'submitted') {
    throw new Error('submit mode');
  }
  const empty = workerSummaryFromReplay({
    ...base,
    ok: true,
    status: 'BUSINESS_OUTCOME',
    code: 'field.UNMAPPED',
    message: 'empty fill: no fields filled',
    paused: false,
  });
  if (empty.exitCode !== 4 || empty.outcome !== 'unmapped') throw new Error('empty fill exit');
}

if (process.argv[1]?.endsWith('worker-exit.ts') || process.argv[1]?.endsWith('worker-exit.js')) {
  selfCheckWorkerExit();
  console.log('worker-exit self-check ok');
}
