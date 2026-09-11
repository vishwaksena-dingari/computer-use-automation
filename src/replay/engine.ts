/**
 * @file Deterministic capability replay — zero LLM (docs/replay-outcomes.md).
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { Capability } from '../artifact/schema.js';
import type { RuntimeConfig } from '../config/schema.js';
import { resolveTarget } from '../surface/resolve-locator.js';
import { assertActionAllowed, assertHostAllowed } from '../policy/guard.js';
import {
  writeIntervention,
  type PauseReason,
} from '../session/hitl.js';
import { applyBindings, bindingsEntryPath } from '../artifact/bindings.js';
import {
  patchTargetFromNote,
  targetKeyFromStep,
} from '../discover/patch-locator.js';
import { ensureDir, writeJson } from '../evidence/store.js';
import { repoRelative } from '../config/paths.js';
import { log } from '../util/log.js';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

export type RunStatus = 'SUCCESS' | 'BUSINESS_OUTCOME' | 'RECOVERABLE' | 'HARD_FAILURE';

export type ReplayResult = {
  ok: boolean;
  status: RunStatus;
  code: string | null;
  message: string;
  capabilityId: string;
  capabilityVersion: string;
  params: Record<string, string>;
  outputs: Record<string, string>;
  error: { reason: string; stepId?: string } | null;
  runId: string;
  evidenceDir: string;
  durationMs: number;
  /** Always 0 for pure replay; HITL patch may bump via side channel in evidence only. */
  llmCalls: number;
  paused?: boolean;
  autoRetrainAttempts?: number;
};

export type ReplayOptions = {
  capability: Capability;
  config: RuntimeConfig;
  /** Project root — public paths are emitted relative to this (no home dirs). */
  root: string;
  params: Record<string, string>;
  runId: string;
  evidenceDir: string;
  headed?: boolean;
  /** When true, risky/policy blocks pause instead of hard-failing immediately. */
  escalateOnPolicy?: boolean;
  /** Opt-in: after resume note, one LLM locator patch of the stuck target (P1b). */
  hitlLocatorPatch?: boolean;
  /** Optional bindings overlay merged before steps run (S8). */
  bindingsOverlay?: Record<string, unknown> | null;
  existingContext?: BrowserContext;
  existingPage?: Page;
  existingBrowser?: Browser;
};

type LedgerEntry = {
  at: string;
  stepId: string;
  action: string;
  ok: boolean;
  detail?: string;
};

function targetKey(ref: { $ref: string }): string {
  return ref.$ref.replace('#/targets/', '');
}

function resolveUrlFrom(
  config: RuntimeConfig,
  urlFrom: string,
  capability: Capability,
): string {
  if (urlFrom === 'config.target.entryPath' || urlFrom === 'config.target.baseUrl') {
    const base = config.target.baseUrl.replace(/\/$/, '');
    const bound = bindingsEntryPath(capability);
    const pathRaw = bound ?? config.target.entryPath;
    const path = pathRaw.startsWith('/') ? pathRaw : `/${pathRaw}`;
    return `${base}${path}`;
  }
  if (urlFrom.startsWith('http')) return urlFrom;
  throw new Error(`unsupported urlFrom ${urlFrom}`);
}

function resolveValueFrom(params: Record<string, string>, valueFrom: string): string {
  if (valueFrom.startsWith('inputs.')) {
    const key = valueFrom.slice('inputs.'.length);
    const v = params[key];
    if (v === undefined) throw new Error(`missing param ${key}`);
    return v;
  }
  return valueFrom;
}

async function evalCheckpoint(
  page: Page,
  capability: Capability,
  name: string,
): Promise<boolean> {
  const ck = capability.checkpoints[name];
  if (!ck) return false;
  switch (ck.kind) {
    case 'visible': {
      try {
        const t = capability.targets[targetKey(ck.target)];
        if (!t) return false;
        const loc = await resolveTarget(page, { ...t, timeoutMs: Math.min(t.timeoutMs, 2500) });
        return loc.isVisible();
      } catch {
        return false;
      }
    }
    case 'hidden': {
      try {
        const t = capability.targets[targetKey(ck.target)];
        if (!t) return true;
        const loc = await resolveTarget(page, { ...t, timeoutMs: 800 });
        return !(await loc.isVisible());
      } catch {
        return true;
      }
    }
    case 'url':
      return page.url().includes(ck.includes);
    case 'textIncludes': {
      if (ck.target) {
        try {
          const t = capability.targets[targetKey(ck.target)];
          if (!t) return false;
          const loc = await resolveTarget(page, { ...t, timeoutMs: 2000 });
          const text = await loc.innerText();
          return text.includes(ck.text);
        } catch {
          return false;
        }
      }
      const body = await page.locator('body').innerText();
      return body.includes(ck.text);
    }
    case 'allOf': {
      for (const ref of ck.refs) {
        if (!(await evalCheckpoint(page, capability, ref))) return false;
      }
      return true;
    }
    case 'anyOf': {
      for (const ref of ck.refs) {
        if (await evalCheckpoint(page, capability, ref)) return true;
      }
      return false;
    }
    default:
      return false;
  }
}

/**
 * Execute capability steps with Playwright. llmCalls stays 0 unless HITL locator patch runs.
 */
export async function replayCapability(opts: ReplayOptions): Promise<ReplayResult> {
  const started = Date.now();
  const capability = applyBindings(opts.capability, opts.bindingsOverlay);
  const { config, params, runId, evidenceDir, root } = opts;
  const ledger: LedgerEntry[] = [];
  const outputs: Record<string, string> = {};
  let llmCalls = 0;

  ensureDir(join(evidenceDir, 'screenshots'));
  ensureDir(join(evidenceDir, 'hitl'));

  let browser = opts.existingBrowser;
  let context = opts.existingContext;
  let page = opts.existingPage;
  let ownsBrowser = false;

  const finish = async (
    partial: Omit<ReplayResult, 'durationMs' | 'llmCalls' | 'runId' | 'evidenceDir' | 'capabilityId' | 'capabilityVersion' | 'params'>,
  ): Promise<ReplayResult> => {
    writeJson(join(evidenceDir, 'run.json'), { runId, ledger, llmCalls });
    if (ownsBrowser && browser) await browser.close().catch(() => undefined);
    const result = {
      ...partial,
      capabilityId: capability.id,
      capabilityVersion: capability.version,
      params,
      runId,
      evidenceDir: repoRelative(root, evidenceDir),
      durationMs: Date.now() - started,
      llmCalls,
    };
    log(partial.ok ? 'info' : 'warn', 'replay finish', {
      status: partial.status,
      code: partial.code,
      steps: ledger.length,
    });
    return result;
  };

  try {
    if (!page || !context) {
      browser = await chromium.launch({ headless: !(opts.headed ?? false) });
      ownsBrowser = true;
      context = await browser.newContext();
      page = await context.newPage();
    }

    const stepsById = new Map(capability.steps.map((s) => [s.id, s]));
    let stepId: string | undefined = capability.steps[0]?.id;
    let guard = 0;

    while (stepId) {
      if (guard++ > config.limits.maxSteps) {
        return finish({
          ok: false,
          status: 'HARD_FAILURE',
          code: null,
          message: 'max steps exceeded',
          outputs,
          error: { reason: 'max_steps' },
        });
      }
      const step = stepsById.get(stepId);
      if (!step) {
        return finish({
          ok: false,
          status: 'HARD_FAILURE',
          code: null,
          message: `unknown step ${stepId}`,
          outputs,
          error: { reason: 'unknown_step', stepId },
        });
      }

      log('debug', 'replay step', { stepId: step.id, action: step.action });

      const policy = assertActionAllowed(config, step.action);
      if (!policy.ok) {
        if (opts.escalateOnPolicy) {
          const shot = join(evidenceDir, 'hitl', 'pause.png');
          await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
          writeIntervention(evidenceDir, {
            schemaVersion: 1,
            runId,
            mode: 'replay',
            reasonCode: policy.reasonCode as PauseReason,
            reasonDetail: policy.detail,
            capabilityId: capability.id,
            stepId: step.id,
            pageUrl: page.url(),
            screenshotPath: 'hitl/pause.png',
            owner: 'paused',
            pausedAt: new Date().toISOString(),
          });
          return finish({
            ok: false,
            status: 'HARD_FAILURE',
            code: policy.reasonCode,
            message: `paused: ${policy.detail}`,
            outputs,
            error: { reason: policy.reasonCode, stepId: step.id },
            paused: true,
          });
        }
        return finish({
          ok: false,
          status: 'HARD_FAILURE',
          code: null,
          message: policy.detail,
          outputs,
          error: { reason: policy.reasonCode, stepId: step.id },
        });
      }

      try {
        if (step.action === 'navigate') {
          const url = resolveUrlFrom(config, step.urlFrom, capability);
          const hostOk = assertHostAllowed(config, url);
          if (!hostOk.ok) {
            return finish({
              ok: false,
              status: 'HARD_FAILURE',
              code: null,
              message: hostOk.detail,
              outputs,
              error: { reason: hostOk.reasonCode, stepId: step.id },
            });
          }
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.limits.stepTimeoutMs });
          ledger.push({ at: new Date().toISOString(), stepId: step.id, action: 'navigate', ok: true, detail: url });
          stepId = nextSequential(capability, step.id);
          continue;
        }

        if (step.action === 'fill') {
          const t = capability.targets[targetKey(step.target)];
          const loc = await resolveTarget(page, t);
          const value = resolveValueFrom(params, step.valueFrom);
          await loc.fill(value);
          ledger.push({ at: new Date().toISOString(), stepId: step.id, action: 'fill', ok: true });
          stepId = nextSequential(capability, step.id);
          continue;
        }

        if (step.action === 'click') {
          const t = capability.targets[targetKey(step.target)];
          const loc = await resolveTarget(page, t);
          await loc.click();
          ledger.push({ at: new Date().toISOString(), stepId: step.id, action: 'click', ok: true });
          stepId = nextSequential(capability, step.id);
          continue;
        }

        if (step.action === 'wait') {
          await page.waitForTimeout(step.timeoutMs ?? 300);
          ledger.push({ at: new Date().toISOString(), stepId: step.id, action: 'wait', ok: true });
          stepId = nextSequential(capability, step.id);
          continue;
        }

        if (step.action === 'extract') {
          const t = capability.targets[targetKey(step.target)];
          const loc = await resolveTarget(page, t);
          const text = (await loc.innerText()).trim();
          outputs[step.output] = text;
          ledger.push({
            at: new Date().toISOString(),
            stepId: step.id,
            action: 'extract',
            ok: true,
            detail: step.output,
          });
          stepId = nextSequential(capability, step.id);
          continue;
        }

        if (step.action === 'branch') {
          let matched: (typeof step.on)[number] | undefined;
          for (const arm of step.on) {
            if (await evalCheckpoint(page, capability, arm.when.checkpoint)) {
              matched = arm;
              break;
            }
          }
          if (!matched) {
            ledger.push({
              at: new Date().toISOString(),
              stepId: step.id,
              action: 'branch',
              ok: false,
              detail: 'no_branch_arm',
            });
            return finish({
              ok: false,
              status: 'HARD_FAILURE',
              code: null,
              message: 'no matching branch arm',
              outputs,
              error: { reason: 'no_branch_arm', stepId: step.id },
            });
          }
          if ('outcome' in matched) {
            ledger.push({
              at: new Date().toISOString(),
              stepId: step.id,
              action: 'branch',
              ok: true,
              detail: matched.outcome,
            });
            await page
              .screenshot({ path: join(evidenceDir, 'screenshots', 'terminal.png'), fullPage: true })
              .catch(() => undefined);
            return finish({
              ok: true,
              status: 'BUSINESS_OUTCOME',
              code: matched.outcome,
              message: `Business outcome ${matched.outcome}`,
              outputs: {},
              error: null,
            });
          }
          ledger.push({
            at: new Date().toISOString(),
            stepId: step.id,
            action: 'branch',
            ok: true,
            detail: `next=${matched.next}`,
          });
          stepId = matched.next;
          continue;
        }
      } catch (e) {
        const msg = (e as Error).message || String(e);
        log('warn', 'replay step failed', { stepId: step.id, action: step.action, detail: msg });
        ledger.push({
          at: new Date().toISOString(),
          stepId: step.id,
          action: step.action,
          ok: false,
          detail: msg,
        });
        const reason = msg.includes('locator_miss') ? 'locator_miss' : 'step_error';
        if (opts.escalateOnPolicy && reason === 'locator_miss') {
          const shot = join(evidenceDir, 'hitl', 'pause.png');
          await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
          writeIntervention(evidenceDir, {
            schemaVersion: 1,
            runId,
            mode: 'replay',
            reasonCode: 'STUCK',
            reasonDetail: msg,
            capabilityId: capability.id,
            stepId: step.id,
            pageUrl: page.url(),
            screenshotPath: 'hitl/pause.png',
            owner: 'paused',
            pausedAt: new Date().toISOString(),
          });
          console.error(`HITL pause (${runId}): STUCK — ${msg}`);
          console.error(`  screenshot: hitl/pause.png`);
          console.error(`  resume: cua escalate resume --run ${runId}`);
          const resumed = await waitForResume(evidenceDir, config.limits.runTimeoutMs);
          if (!resumed.ok) {
            return finish({
              ok: false,
              status: 'HARD_FAILURE',
              code: 'STUCK',
              message: `HITL timeout: ${msg}`,
              outputs,
              error: { reason: 'STUCK', stepId: step.id },
              paused: true,
            });
          }
          if (opts.hitlLocatorPatch && resumed.note.trim()) {
            const tKey = targetKeyFromStep(capability, step.id);
            if (tKey) {
              const patch = await patchTargetFromNote({
                page,
                capability,
                targetKey: tKey,
                note: resumed.note,
                config,
              });
              llmCalls += patch.llmCalls;
              writeJson(join(evidenceDir, 'hitl', 'locator-patch.json'), {
                targetKey: tKey,
                ...patch,
                humanActionsRecorded: false,
              });
              ledger.push({
                at: new Date().toISOString(),
                stepId: step.id,
                action: 'hitl_locator_patch',
                ok: patch.patched,
                detail: patch.detail,
              });
            }
          }
          // re-observe: retry same step once
          continue;
        }
        return finish({
          ok: false,
          status: 'HARD_FAILURE',
          code: null,
          message: msg,
          outputs,
          error: { reason, stepId: step.id },
        });
      }
    }

    const success = await evalCheckpoint(page, capability, capability.successCheckpoint);
    const requiredOutputs = capability.outputs.filter((o) => true);
    const missing = requiredOutputs.filter((o) => !outputs[o.name]?.length);
    if (success && missing.length === 0) {
      await page
        .screenshot({ path: join(evidenceDir, 'screenshots', 'success.png'), fullPage: true })
        .catch(() => undefined);
      return finish({
        ok: true,
        status: 'SUCCESS',
        code: null,
        message: 'Capability completed successfully',
        outputs,
        error: null,
      });
    }
    return finish({
      ok: false,
      status: 'HARD_FAILURE',
      code: null,
      message: success ? `missing outputs: ${missing.map((m) => m.name).join(',')}` : 'success checkpoint not met',
      outputs,
      error: { reason: 'success_check_failed' },
    });
  } catch (e) {
    return finish({
      ok: false,
      status: 'HARD_FAILURE',
      code: null,
      message: (e as Error).message,
      outputs,
      error: { reason: 'replay_crash' },
    });
  }
}

function nextSequential(capability: Capability, currentId: string): string | undefined {
  const idx = capability.steps.findIndex((s) => s.id === currentId);
  if (idx < 0 || idx + 1 >= capability.steps.length) return undefined;
  return capability.steps[idx + 1]?.id;
}

async function waitForResume(
  evidenceDir: string,
  timeoutMs: number,
): Promise<{ ok: boolean; note: string }> {
  const resumeFile = join(evidenceDir, 'hitl', 'resume.json');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(resumeFile)) {
      try {
        const body = JSON.parse(readFileSync(resumeFile, 'utf8')) as { note?: string };
        return { ok: true, note: String(body.note ?? '') };
      } catch {
        return { ok: true, note: '' };
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, note: '' };
}
