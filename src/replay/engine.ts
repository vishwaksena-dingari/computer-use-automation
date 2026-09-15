/**
 * @file Deterministic capability replay — zero LLM (docs/replay-outcomes.md).
 */
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright';
import type { Capability, FieldMap } from '../artifact/schema.js';
import type { RuntimeConfig } from '../config/schema.js';
import { resolveTarget } from '../surface/resolve-locator.js';
import { assertActionAllowed, assertHostAllowed } from '../policy/guard.js';
import {
  writeIntervention,
  type PauseReason,
} from '../session/hitl.js';
import {
  startActionRecorder,
  writeRecordedActions,
  applyRecordedToTarget,
} from '../session/record-actions.js';
import { applyBindings, bindingsEntryPath } from '../artifact/bindings.js';
import { loadFieldMapById } from '../artifact/field-map.js';
import { runFillForm, type FillFormMode } from '../artifact/fill-form.js';
import { makeCraftAnswer } from '../artifact/craft-answer.js';
import { getProfilePath, setProfilePath } from '../artifact/profile.js';
import { buildFillReceipt, writeFillReceipt, unverifiedRequiredKeys, type FillReceipt } from '../artifact/fill-receipt.js';
import { formOutcomeFromPageText } from '../artifact/form-outcomes.js';
import { extractSubmitProof, submitConfirmVisibleRegex } from '../artifact/submit-proof.js';
import { checkSubmitGuard, clearSubmitGuardKey, recordSubmitGuard, submitGuardKey } from '../artifact/submit-ledger.js';
import {
  filterFieldMapToControls,
  repairFieldMap,
  writeFieldMapById,
  writePrivateFieldMapById,
  writeProposedFieldMap,
  shouldPersistSiteFieldMap,
} from '../artifact/repair-field-map.js';
import { observeControls } from '../surface/observe-controls.js';
import { detectAtsFamily } from '../surface/detect-ats.js';
import { listVisibleRequiredErrors } from '../surface/page-errors.js';
import {
  patchTargetFromNote,
  targetKeyFromStep,
} from '../discover/patch-locator.js';
import { ensureDir, writeJson } from '../evidence/store.js';
import { captureEvidenceShot, writeScreenshotManifest } from '../evidence/shots.js';
import { repoRelative, resolveUnderRoot } from '../config/paths.js';
import { log } from '../util/log.js';
import { existsSync, readFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

/** Flatten nested profile object keys for field-map binding (flags.x, answers.y). */
function flattenProfileKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    out.push(path);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenProfileKeys(v as Record<string, unknown>, path));
    }
  }
  return out;
}

/** Click Sign In / Next / Continue on multi-page ATS flows. */
async function clickFormAdvance(page: Page): Promise<boolean> {
  const candidates = [
    // Workday SSO chooser → email/password form
    page.locator('[data-automation-id="SignInWithEmailButton"]'),
    page.getByRole('button', { name: /Sign in with email/i }),
    // Create Account submit (Workday overlays a click_filter div over the real submit)
    page.locator('[data-automation-id="click_filter"][aria-label="Create Account"]'),
    page.locator('[data-automation-id="createAccountSubmitButton"]'),
    // Multipage apply navigation (before generic Sign In — header also says Sign In)
    page.locator('[data-automation-id="bottom-navigation-next-button"]:visible'),
    page.getByRole('button', { name: /Save and Continue/i }),
    page.getByRole('button', { name: /^Next$/i }),
    page.getByRole('button', { name: /^Continue$/i }),
    page.getByRole('button', { name: /^Finish/i }),
    // Auth submit only (avoid header utility Sign In)
    page.locator('#signInBtn'),
    page.locator('[data-automation-id="signInSubmitButton"]'),
    page.locator('[data-automation-id="click_filter"][aria-label="Sign In"]'),
    page.locator('[data-automation-id="click_filter_Sign In"]'),
  ];
  for (const loc of candidates) {
    try {
      const first = loc.first();
      await first.waitFor({ state: 'visible', timeout: 1500 });
      await first.click({ timeout: 4000 });
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

/**
 * Job Overview / JD pages have zero form controls — open the Application surface.
 * Ashby: Application tab or "Apply for this Job". Greenhouse-ish Apply buttons too.
 * Rejects navigation off the allowed host list (T-W-14).
 * T-W-13: poll all candidates in one ~2s window (not 6×1.5s serial waits on miss).
 */
async function openApplyFormSurface(
  page: Page,
  allowedHosts: string[],
): Promise<'opened' | 'blocked' | 'none'> {
  const beforeHost = (() => {
    try {
      return new URL(page.url()).hostname.toLowerCase();
    } catch {
      return '';
    }
  })();
  const hostOk = (url: string) => {
    try {
      const h = new URL(url).hostname.toLowerCase();
      if (allowedHosts.some((a) => a.toLowerCase() === h)) return true;
      return Boolean(beforeHost && h === beforeHost);
    } catch {
      return false;
    }
  };
  const candidates = [
    page.getByRole('tab', { name: /^Application$/i }),
    page.getByRole('link', { name: /^Application$/i }),
    page.getByRole('button', { name: /Apply for this [Jj]ob/i }),
    page.getByRole('link', { name: /Apply for this [Jj]ob/i }),
    page.getByRole('button', { name: /^Apply now$/i }),
    page.getByRole('link', { name: /^Apply now$/i }),
  ];
  const deadline = Date.now() + 2000;
  let target: Locator | null = null;
  while (!target && Date.now() < deadline) {
    for (const loc of candidates) {
      const first = loc.first();
      if (await first.isVisible().catch(() => false)) {
        target = first;
        break;
      }
    }
    if (!target) await page.waitForTimeout(100);
  }
  if (!target) return 'none';
  try {
    await target.click({ timeout: 4000 });
    await page.waitForTimeout(600);
    if (!hostOk(page.url())) return 'blocked';
    return 'opened';
  } catch {
    return 'none';
  }
}

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
  /** True only when --submit and a confirmation banner was observed. */
  submitConfirmed?: boolean;
  /** True when --submit path clicked a Submit control (may still be unconfirmed). */
  submitAttempted?: boolean;
  /** Scraped confirmation text / reference when available (Adapt). */
  submitProof?: { text?: string; reference?: string; matchedPhrase?: string };
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
  /** Opt-in P3: record operator clicks during HITL pause and merge into stuck target. */
  recordActions?: boolean;
  /** Optional bindings overlay merged before steps run (S8). */
  bindingsOverlay?: Record<string, unknown> | null;
  /** G1 applicant profile for fillForm (never baked into Capability). */
  profile?: Record<string, unknown>;
  /** G1: deterministic (default) | hybrid (rare LLM craft). */
  mode?: FillFormMode;
  /** Optional company blurb for hybrid craft. */
  companyContext?: string;
  /** Opt-in: persist repaired field-map under capabilities/field-maps/. */
  writeFieldMap?: boolean;
  /**
   * Dormant form repair loop when fill/verify stuck (default 3, cap 5).
   * Happy path stays 0 LLM; each stuck iteration may call repairFieldMap once.
   */
  formRepairMax?: number;
  /** Opt-in HAR path (written when browser context closes). */
  recordHarPath?: string;
  /** Playwright recordHar content mode. */
  recordHarContent?: 'omit' | 'embed';
  /** If true with recordHarPath: delete HAR after successful runs (failure-only retain). */
  harRetainOnFailure?: boolean;
  /** Start Playwright tracing; keep `trace.zip` under evidence only when the run fails. */
  traceOnFailure?: boolean;
  /**
   * When true, fillFormFlow may click a visible Submit control (default false — fill-only).
   * DECISIONS G6: irreversible apply is explicit.
   */
  allowSubmit?: boolean;
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

/** Shared fill-receipt write — keeps unverifiedRequired default + pageUrl consistent. */
function persistFillReceipt(
  evidenceDir: string,
  page: Page,
  opts: {
    entries: FillReceipt['entries'];
    filledKeys: string[];
    failDetail?: string;
    skippedOptional?: string[];
    unverifiedRequired?: string[];
  },
): void {
  writeFillReceipt(
    evidenceDir,
    buildFillReceipt({
      pageUrl: page.url(),
      entries: opts.entries,
      filledKeys: opts.filledKeys,
      unverifiedRequired:
        opts.unverifiedRequired ?? opts.entries.filter((e) => !e.verified).map((e) => e.key),
      failDetail: opts.failDetail,
      skippedOptional: opts.skippedOptional,
    }),
  );
}

/** Common runFillForm bag — callers pass fieldMap + skipInvisibleRequired explicitly. */
function fillNow(
  bag: {
    page: Page;
    profile: Record<string, unknown>;
    mode: FillFormMode;
    config: RuntimeConfig;
    root: string;
    companyContext?: string;
    craftAnswer?: Parameters<typeof runFillForm>[0]['craftAnswer'];
  },
  fieldMap: FieldMap,
  extra?: { skipInvisibleRequired?: boolean },
) {
  return runFillForm({
    page: bag.page,
    fieldMap,
    profile: bag.profile,
    mode: bag.mode,
    config: bag.config,
    root: bag.root,
    companyContext: bag.companyContext,
    craftAnswer: bag.craftAnswer,
    skipInvisibleRequired: extra?.skipInvisibleRequired,
  });
}

/** Screenshot + intervention write for pause paths (resume wiring stays at call site). */
async function pauseHitl(opts: {
  evidenceDir: string;
  page: Page;
  runId: string;
  capabilityId: string;
  stepId: string;
  reasonCode: PauseReason;
  reasonDetail: string;
}): Promise<void> {
  const shot = join(opts.evidenceDir, 'hitl', 'pause.png');
  await opts.page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
  writeIntervention(opts.evidenceDir, {
    schemaVersion: 1,
    runId: opts.runId,
    mode: 'replay',
    reasonCode: opts.reasonCode,
    reasonDetail: opts.reasonDetail,
    capabilityId: opts.capabilityId,
    stepId: opts.stepId,
    pageUrl: opts.page.url(),
    screenshotPath: 'hitl/pause.png',
    owner: 'paused',
    pausedAt: new Date().toISOString(),
  });
}

export async function replayCapability(opts: ReplayOptions): Promise<ReplayResult> {
  const started = Date.now();
  const capability = applyBindings(opts.capability, opts.bindingsOverlay);
  const { config, params, runId, evidenceDir, root } = opts;
  const ledger: LedgerEntry[] = [];
  const outputs: Record<string, string> = {};
  let llmCalls = 0;
  let submitConfirmed = false;
  let submitAttempted = false;
  let submitProof: { text?: string; reference?: string; matchedPhrase?: string } | undefined;

  ensureDir(join(evidenceDir, 'screenshots'));
  ensureDir(join(evidenceDir, 'hitl'));

  let browser = opts.existingBrowser;
  let context = opts.existingContext;
  let page = opts.existingPage;
  let ownsBrowser = false;
  let tracingStarted = false;

  /** Prefer page-level captcha/closed, else fill detail taxonomy. */
  const resolveFormCode = async (detail: string): Promise<string> => {
    const body = await page!
      .locator('body')
      .innerText()
      .then((t) => t.slice(0, 4000))
      .catch(() => '');
    return formOutcomeFromPageText(body, detail);
  };

  /** CAPTCHA/MFA + --escalate → same-session HITL pause (P3). */
  const finishFormOutcome = async (
    detail: string,
    stepId: string,
  ): Promise<ReplayResult> => {
    const code = await resolveFormCode(detail);
    if (
      opts.escalateOnPolicy &&
      (code === 'form.CAPTCHA' || /mfa|2fa|one-time|verification code/i.test(detail))
    ) {
      const shot = join(evidenceDir, 'hitl', 'pause.png');
      await page!.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
      writeIntervention(evidenceDir, {
        schemaVersion: 1,
        runId,
        mode: 'replay',
        reasonCode: 'POLICY_BLOCK' as PauseReason,
        reasonDetail: detail,
        capabilityId: capability.id,
        stepId,
        pageUrl: page!.url(),
        screenshotPath: 'hitl/pause.png',
        owner: 'paused',
        pausedAt: new Date().toISOString(),
      });
      return finish({
        ok: false,
        status: 'HARD_FAILURE',
        code,
        message: `paused: ${detail}`,
        outputs: {},
        error: { reason: 'hitl_pause', stepId },
        paused: true,
      });
    }
    return finish({
      ok: true,
      status: 'BUSINESS_OUTCOME',
      code,
      message: detail,
      outputs: {},
      error: null,
    });
  };

  const finish = async (
    partial: Omit<ReplayResult, 'durationMs' | 'llmCalls' | 'runId' | 'evidenceDir' | 'capabilityId' | 'capabilityVersion' | 'params'>,
  ): Promise<ReplayResult> => {
    // Persist auth cookies/localStorage for next run (Playwright storageState).
    if (ownsBrowser && context && config.session.storageStatePath) {
      try {
        const abs = resolveUnderRoot(root, config.session.storageStatePath);
        mkdirSync(dirname(abs), { recursive: true });
        await context.storageState({ path: abs });
      } catch {
        /* best effort — refuse escapes silently on save; load path is fail-closed below */
      }
    }
    writeJson(join(evidenceDir, 'run.json'), { runId, ledger, llmCalls });
    if (tracingStarted && context) {
      try {
        if (partial.ok) {
          await context.tracing.stop();
        } else {
          await context.tracing.stop({ path: join(evidenceDir, 'trace.zip') });
        }
      } catch {
        /* best effort */
      }
      tracingStarted = false;
    }
    // Operator watch: keep headed window open after fill (CUA_HEADED_HOLD_MS, cap 5m).
    const holdMs = Math.min(
      Math.max(0, Number(process.env.CUA_HEADED_HOLD_MS || 0) || 0),
      300_000,
    );
    if (opts.headed && holdMs > 0 && page) {
      await page.waitForTimeout(holdMs).catch(() => undefined);
    }
    if (ownsBrowser && context) await context.close().catch(() => undefined);
    if (ownsBrowser && browser) await browser.close().catch(() => undefined);
    // Failure-only HAR: Playwright writes on close — drop the file after happy path.
    // P6: never keep HAR outside evidence/private unless CUA_ALLOW_PUBLIC_HAR=1.
    if (opts.recordHarPath && existsSync(opts.recordHarPath)) {
      const underPrivate = /(?:^|\/)evidence\/private(?:\/|$)/.test(
        repoRelative(root, evidenceDir).replace(/\\/g, '/'),
      );
      const allowPublic = process.env.CUA_ALLOW_PUBLIC_HAR === '1';
      const drop =
        (opts.harRetainOnFailure && partial.ok) || (!underPrivate && !allowPublic);
      if (drop) {
        try {
          unlinkSync(opts.recordHarPath);
        } catch {
          /* ignore */
        }
      }
    }
    const result = {
      ...partial,
      capabilityId: capability.id,
      capabilityVersion: capability.version,
      params,
      runId,
      evidenceDir: repoRelative(root, evidenceDir),
      durationMs: Date.now() - started,
      llmCalls,
      submitConfirmed: partial.submitConfirmed ?? submitConfirmed,
      submitAttempted: partial.submitAttempted ?? submitAttempted,
      submitProof: partial.submitProof ?? submitProof,
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
      const storageAbs = config.session.storageStatePath
        ? resolveUnderRoot(root, config.session.storageStatePath)
        : undefined;
      const contextOpts: Parameters<Browser['newContext']>[0] = {};
      if (storageAbs && existsSync(storageAbs)) {
        contextOpts.storageState = storageAbs;
      }
      if (opts.recordHarPath) {
        contextOpts.recordHar = {
          path: opts.recordHarPath,
          content: opts.recordHarContent ?? 'omit',
        };
      }
      context = await browser.newContext(contextOpts);
      page = await context.newPage();
      if (opts.traceOnFailure) {
        await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
        tracingStarted = true;
      }
    }

    // Placeholder until first navigate; about:blank must not lock family to unknown.
    let atsFamily = detectAtsFamily(
      page.url() && page.url() !== 'about:blank' ? page.url() : config.target.baseUrl,
    );
    const refreshAtsFamily = async (): Promise<void> => {
      const raw = page!.url();
      const url = raw && raw !== 'about:blank' ? raw : config.target.baseUrl;
      let body = '';
      try {
        body = await page!.locator('body').innerText({ timeout: 2000 });
      } catch {
        /* blank / cross-origin */
      }
      atsFamily = detectAtsFamily(url, body);
      try {
        writeJson(join(evidenceDir, 'ats-family.json'), { family: atsFamily, url });
      } catch {
        /* ignore */
      }
    };
    try {
      writeJson(join(evidenceDir, 'ats-family.json'), {
        family: atsFamily,
        url: page.url() && page.url() !== 'about:blank' ? page.url() : config.target.baseUrl,
      });
    } catch {
      /* ignore */
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
          // Re-check host after redirects (H / F3).
          const landed = page.url();
          const landedOk = assertHostAllowed(config, landed);
          if (!landedOk.ok) {
            return finish({
              ok: false,
              status: 'HARD_FAILURE',
              code: null,
              message: `after navigate: ${landedOk.detail}`,
              outputs,
              error: { reason: landedOk.reasonCode, stepId: step.id },
            });
          }
          await refreshAtsFamily();
          ledger.push({ at: new Date().toISOString(), stepId: step.id, action: 'navigate', ok: true, detail: landed });
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

        if (step.action === 'fillForm') {
          if (atsFamily === 'unknown') await refreshAtsFamily();
          const profile = opts.profile ?? {};
          const mode: FillFormMode = opts.mode ?? 'deterministic';
          const mapId = step.fieldMapRef;
          let fieldMap: FieldMap | null = null;
          try {
            fieldMap = loadFieldMapById(root, mapId);
          } catch {
            fieldMap = null;
          }

          const profileKeys = flattenProfileKeys(profile);
          const craftTimeoutMs = Math.max(
            5_000,
            Math.min(180_000, config.limits.runTimeoutMs - (Date.now() - started)),
          );
          // ponytail: one craft factory per arm — separate budgets (S1); do not share across arms.
          const maybeCraft = makeCraftAnswer({
            config,
            mode,
            profile,
            profileKeys,
            budget: opts.formRepairMax ?? 3,
            timeoutMs: craftTimeoutMs,
          });
          const fillBag = {
            page: page!,
            profile,
            mode,
            config,
            root,
            companyContext: opts.companyContext,
            craftAnswer: maybeCraft,
          };

          // Dormant repair loop: try map → on stuck repair+retry until ok or budget.
          const formRepairMax = Math.min(5, Math.max(1, opts.formRepairMax ?? 3));
          let repairBudget = formRepairMax;
          const activePage = page!;
          const runRepair = async (reason: string): Promise<boolean> => {
            if (repairBudget <= 0) return false;
            repairBudget -= 1;
            const repair = await repairFieldMap({
              page: activePage,
              fieldMap,
              mapId,
              config,
              profileKeys,
              reason,
              allowLlm: true,
              root,
              atsFamily,
            });
            fieldMap = repair.map;
            llmCalls += repair.llmCalls;
            writeProposedFieldMap(evidenceDir, fieldMap);
            // T-G-5: never persist site maps on repair alone — wait for verified fill.
            ledger.push({
              at: new Date().toISOString(),
              stepId: step.id,
              action: 'field_map_repair',
              ok: true,
              detail: `${repair.note}:${reason} (left=${repairBudget})`,
            });
            return true;
          };

          if (!fieldMap) {
            const ok = await runRepair('bootstrap');
            if (!ok || !fieldMap) {
              return finish({
                ok: false,
                status: 'HARD_FAILURE',
                code: null,
                message: `field-map not found: ${mapId}`,
                outputs: {},
                error: { reason: 'field_map_missing', stepId: step.id },
              });
            }
          }

          let fillResult = await fillNow(fillBag, fieldMap!);
          llmCalls += fillResult.llmCalls;

          let lastFailDetail = fillResult.ok ? '' : fillResult.detail;
          while (!fillResult.ok && (await runRepair(`stuck:${fillResult.detail}`))) {
            ledger.push({
              at: new Date().toISOString(),
              stepId: step.id,
              action: 'fillForm',
              ok: false,
              detail: `retry after repair: ${fillResult.detail}`,
            });
            fillResult = await fillNow(fillBag, fieldMap!);
            llmCalls += fillResult.llmCalls;
            // No progress → stop burning repairs (same failure after map change).
            if (!fillResult.ok && fillResult.detail === lastFailDetail) break;
            lastFailDetail = fillResult.ok ? '' : fillResult.detail;
          }

          if (!fillResult.ok) {
            persistFillReceipt(
              evidenceDir,
              page,
              {
                entries: fillResult.receipt,
                filledKeys: fillResult.receipt.filter((e) => e.verified).map((e) => e.key),
                unverifiedRequired: fillResult.receipt.filter((e) => !e.verified).map((e) => e.key),
                failDetail: fillResult.detail,
                skippedOptional: fillResult.skippedOptional,
            },
            );
            ledger.push({
              at: new Date().toISOString(),
              stepId: step.id,
              action: 'fillForm',
              ok: false,
              detail: fillResult.detail,
            });
            await page
              .screenshot({ path: join(evidenceDir, 'screenshots', 'terminal.png'), fullPage: true })
              .catch(() => undefined);
            if (opts.escalateOnPolicy) {
              await pauseHitl({
                evidenceDir,
                page,
                runId,
                capabilityId: capability.id,
                stepId: step.id,
                reasonCode: 'STUCK',
                reasonDetail: fillResult.detail,
              });
              console.error(`HITL pause (${runId}): STUCK — ${fillResult.detail}`);
              console.error(`  screenshot: hitl/pause.png`);
              console.error(`  resume: cua escalate resume --run ${runId} [--note "value"]`);
              const resumed = await waitForResume(evidenceDir, config.limits.runTimeoutMs);
              if (!resumed.ok) {
                return finish({
                  ok: false,
                  status: 'HARD_FAILURE',
                  code: fillResult.code,
                  message: `HITL timeout: ${fillResult.detail}`,
                  outputs: {},
                  error: { reason: 'STUCK', stepId: step.id },
                  paused: true,
                });
              }
              if (resumed.note.trim()) {
                // Preflight may join several paths with commas — apply note to the first only.
                const path = fillResult.profilePath.split(',')[0]?.trim();
                if (path) setProfilePath(profile, path, resumed.note.trim());
              }
              fillResult = await fillNow(fillBag, fieldMap);
              llmCalls += fillResult.llmCalls;
              if (!fillResult.ok) {
                persistFillReceipt(
                  evidenceDir,
                  page,
                  {
                    entries: fillResult.receipt,
                    filledKeys: fillResult.receipt.filter((e) => e.verified).map((e) => e.key),
                    unverifiedRequired: fillResult.receipt.filter((e) => !e.verified).map((e) => e.key),
                    failDetail: fillResult.detail,
                    skippedOptional: fillResult.skippedOptional,
                  },
                );
                ledger.push({
                  at: new Date().toISOString(),
                  stepId: step.id,
                  action: 'fillForm',
                  ok: false,
                  detail: `after HITL: ${fillResult.detail}`,
                });
                return finishFormOutcome(fillResult.detail, step.id);
              }
            } else {
              persistFillReceipt(
                evidenceDir,
                page,
                {
                  entries: fillResult.receipt,
                  filledKeys: fillResult.receipt.filter((e) => e.verified).map((e) => e.key),
                  unverifiedRequired: fillResult.receipt.filter((e) => !e.verified).map((e) => e.key),
                  failDetail: fillResult.detail,
                  skippedOptional: fillResult.skippedOptional,
              },
              );
              return finishFormOutcome(fillResult.detail, step.id);
            }
          }
          persistFillReceipt(
            evidenceDir,
            page,
            {
              entries: fillResult.receipt,
              filledKeys: fillResult.filled,
              unverifiedRequired: fillResult.receipt.filter((e) => !e.verified).map((e) => e.key),
              failDetail:
                fillResult.filled.length === 0 ? 'empty fill: no fields filled' : undefined,
              skippedOptional: fillResult.skippedOptional,
            },
          );
          // T-W-11: same honesty as fillFormFlow — never SUCCESS with zero fills.
          if (fillResult.filled.length === 0) {
            ledger.push({
              at: new Date().toISOString(),
              stepId: step.id,
              action: 'fillForm',
              ok: false,
              detail: 'empty fill: no fields filled',
            });
            return finishFormOutcome('empty fill: no fields filled', step.id);
          }
          // T-G-5: fillForm has no in-step submit; apply multipage+submit uses fillFormFlow.
          const verifiedCount = fillResult.receipt.filter((e) => e.verified).length;
          if (opts.writeFieldMap && shouldPersistSiteFieldMap({ verifiedCount })) {
            writeFieldMapById(root, fieldMap!);
            ledger.push({
              at: new Date().toISOString(),
              stepId: step.id,
              action: 'fillForm',
              ok: true,
              detail: `persisted FieldMap ${mapId} after verified fill (write-field-map)`,
            });
          }
          ledger.push({
            at: new Date().toISOString(),
            stepId: step.id,
            action: 'fillForm',
            ok: true,
            detail: fillResult.filled.join(','),
          });
          stepId = nextSequential(capability, step.id);
          continue;
        }

        if (step.action === 'fillFormFlow') {
          // Policy already gated via assertActionAllowed(step.action) above.
          if (atsFamily === 'unknown') await refreshAtsFamily();
          const profile = opts.profile ?? {};
          const mode: FillFormMode = opts.mode ?? 'deterministic';
          const mapId = step.fieldMapRef;
          const maxPages = step.maxPages ?? 6;
          const profileKeys = flattenProfileKeys(profile);
          const pagesFilled: string[] = [];
          const allReceiptEntries: FillReceipt['entries'] = [];
          const allFilledKeys: string[] = [];
          const allSkippedOptional: string[] = [];
          /** T-G-5: hold site map until verified fill (+ submitConfirmed if submit attempted). */
          let pendingSiteMap: FieldMap | null = null;
          let pendingSeedWasMissing = false;
          const flushPendingSiteMap = (reason: string): void => {
            if (!pendingSiteMap) return;
            const verifiedCount = allReceiptEntries.filter((e) => e.verified).length;
            if (
              !shouldPersistSiteFieldMap({
                verifiedCount,
                allowSubmit: opts.allowSubmit,
                submitAttempted,
                submitConfirmed,
              })
            ) {
              ledger.push({
                at: new Date().toISOString(),
                stepId: step.id,
                action: 'fillFormFlow',
                ok: true,
                detail: `skipped site FieldMap persist (${reason}; verified=${verifiedCount} submitAttempted=${submitAttempted} submitConfirmed=${submitConfirmed})`,
              });
              return;
            }
            if (opts.writeFieldMap) {
              writeFieldMapById(root, pendingSiteMap);
              ledger.push({
                at: new Date().toISOString(),
                stepId: step.id,
                action: 'fillFormFlow',
                ok: true,
                detail: `persisted FieldMap ${mapId} after verified fill (write-field-map)`,
              });
            } else if (pendingSeedWasMissing) {
              writePrivateFieldMapById(root, pendingSiteMap);
              ledger.push({
                at: new Date().toISOString(),
                stepId: step.id,
                action: 'fillFormFlow',
                ok: true,
                detail: `persisted FieldMap ${mapId} after verified fill (.private seed cache)`,
              });
            }
          };
          const craftTimeoutMs = Math.max(
            5_000,
            Math.min(180_000, config.limits.runTimeoutMs - (Date.now() - started)),
          );
          // ponytail: one craft factory per arm — separate budgets (S1); do not share across arms.
          const maybeCraft = makeCraftAnswer({
            config,
            mode,
            profile,
            profileKeys,
            budget: opts.formRepairMax ?? 3,
            timeoutMs: craftTimeoutMs,
          });
          const fillBag = {
            page: page!,
            profile,
            mode,
            config,
            root,
            companyContext: opts.companyContext,
            craftAnswer: maybeCraft,
          };

          // Bridge: honor imported / --field-map-id FieldMap; repair only fills gaps.
          let seedMap: FieldMap | null = null;
          const seedWasMissing = (() => {
            try {
              seedMap = loadFieldMapById(root, mapId);
              return false;
            } catch (e) {
              seedMap = null;
              ledger.push({
                at: new Date().toISOString(),
                stepId: step.id,
                action: 'fillFormFlow',
                ok: false,
                detail: `seed FieldMap ${mapId} missing (${(e as Error).message}) — bootstrapping from DOM`,
              });
              return true;
            }
          })();
          const rawBanner = seedMap?.successBanner?.trim() || '';
          // Ignore short banners (hostile/accidental early match); keep built-in defaults.
          const successBanner = rawBanner.length >= 12 ? rawBanner : '';
          /** Per-surface gallery for apply evidence (always-on in fillFormFlow). */
          const pageGallery: string[] = [];

          for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
            let observed = await observeControls(page);
            if (!observed.length) {
              // Overview / JD: open Application before treating as SSO/advance.
              const openedForm = await openApplyFormSurface(page, config.policy.allowedHosts ?? []);
              if (openedForm === 'blocked') {
                ledger.push({
                  at: new Date().toISOString(),
                  stepId: step.id,
                  action: 'fillFormFlow',
                  ok: false,
                  detail: `page ${pageIdx}: Apply navigation left allowedHosts`,
                });
                writeScreenshotManifest(evidenceDir, pageGallery);
                return finish({
                  ok: false,
                  status: 'HARD_FAILURE',
                  code: null,
                  message: 'Apply navigation left allowed host',
                  outputs: {},
                  error: { reason: 'host_escape', stepId: step.id },
                });
              }
              if (openedForm === 'opened') {
                ledger.push({
                  at: new Date().toISOString(),
                  stepId: step.id,
                  action: 'fillFormFlow',
                  ok: true,
                  detail: `page ${pageIdx}: opened apply form surface`,
                });
                await captureEvidenceShot(page, evidenceDir, '00-after-open-form.png', pageGallery);
                observed = await observeControls(page);
              }
            }
            if (!observed.length) {
              // SSO chooser / review: no inputs — advance (Sign in with email / Finish) then re-observe
              const advancedEmpty = await clickFormAdvance(page);
              await page.waitForTimeout(500);
              if (!advancedEmpty) break;
              observed = await observeControls(page);
              if (!observed.length) break;
            }
            // Page-filter imported seed (perf); repair still adds gaps for uncovered controls.
            const pageSeed = seedMap ? filterFieldMapToControls(seedMap, observed) : null;
            if (seedMap && pageSeed && pageSeed.fields.length < seedMap.fields.length) {
              ledger.push({
                at: new Date().toISOString(),
                stepId: step.id,
                action: 'fillFormFlow',
                ok: true,
                detail: `page ${pageIdx} seed filtered ${seedMap.fields.length}→${pageSeed.fields.length} fields`,
              });
            } else if (seedMap && pageSeed && pageSeed.fields.length === seedMap.fields.length && observed.length) {
              ledger.push({
                at: new Date().toISOString(),
                stepId: step.id,
                action: 'fillFormFlow',
                ok: true,
                detail: `page ${pageIdx} seed filter kept all ${seedMap.fields.length} (match or fail-open)`,
              });
            }
            let repair;
            try {
              repair = await repairFieldMap({
                page,
                fieldMap: pageSeed,
                mapId: `${mapId}-p${pageIdx}`,
                config,
                profileKeys,
                reason: `fillFormFlow page ${pageIdx}`,
                // Multipage happy path: LLM on page 0 only; later pages heuristics unless stuck/retry.
                allowLlm: pageIdx === 0,
                root,
                atsFamily,
              });
            } catch (e) {
              ledger.push({
                at: new Date().toISOString(),
                stepId: step.id,
                action: 'fillFormFlow',
                ok: false,
                detail: `page ${pageIdx}: repair failed (${observed.length} controls): ${(e as Error).message}`,
              });
              writeScreenshotManifest(evidenceDir, pageGallery);
              flushPendingSiteMap('early fail repair');
              throw e;
            }
            llmCalls += repair.llmCalls;
            writeProposedFieldMap(evidenceDir, repair.map);
            // Persist after fill success (below); don't cache a map that never filled.

            await captureEvidenceShot(
              page,
              evidenceDir,
              `page-${pageIdx}-before-fill.png`,
              pageGallery,
            );

            let fillResult = await fillNow(fillBag, repair.map, { skipInvisibleRequired: true });
            llmCalls += fillResult.llmCalls;
            // Dormant stuck loop (allows LLM even on page>0); stop on success, budget, or no progress.
            const flowRepairMax = Math.min(5, Math.max(1, opts.formRepairMax ?? 3));
            let flowRepairs = 0;
            let lastDetail = fillResult.ok ? '' : fillResult.detail;
            let workingMap = repair.map;
            while (!fillResult.ok && flowRepairs < flowRepairMax) {
              flowRepairs += 1;
              try {
                const stuckRepair = await repairFieldMap({
                  page: page!,
                  fieldMap: workingMap,
                  mapId: `${mapId}-p${pageIdx}-stuck${flowRepairs}`,
                  config,
                  profileKeys,
                  reason: `fillFormFlow stuck page ${pageIdx}: ${fillResult.detail}`,
                  allowLlm: true,
                  root,
                  atsFamily,
                });
                llmCalls += stuckRepair.llmCalls;
                workingMap = stuckRepair.map;
                writeProposedFieldMap(evidenceDir, stuckRepair.map);
                ledger.push({
                  at: new Date().toISOString(),
                  stepId: step.id,
                  action: 'field_map_repair',
                  ok: true,
                  detail: `stuck page ${pageIdx} #${flowRepairs}: ${stuckRepair.note}`,
                });
                fillResult = await fillNow(fillBag, stuckRepair.map, { skipInvisibleRequired: true });
                llmCalls += fillResult.llmCalls;
                if (!fillResult.ok && fillResult.detail === lastDetail) break;
                lastDetail = fillResult.ok ? '' : fillResult.detail;
              } catch {
                break;
              }
            }
            if (!fillResult.ok) {
              persistFillReceipt(
                evidenceDir,
                page,
                {
                  entries: [...allReceiptEntries, ...fillResult.receipt],
                  filledKeys: allFilledKeys,
                  unverifiedRequired: fillResult.receipt.filter((e) => !e.verified).map((e) => e.key),
                  failDetail: fillResult.detail,
                  skippedOptional: [...allSkippedOptional, ...fillResult.skippedOptional],
              },
              );
              ledger.push({
                at: new Date().toISOString(),
                stepId: step.id,
                action: 'fillFormFlow',
                ok: false,
                detail: `page ${pageIdx}: ${fillResult.detail}`,
              });
              writeScreenshotManifest(evidenceDir, pageGallery);
              flushPendingSiteMap('early fail page fill');
              return finishFormOutcome(fillResult.detail, step.id);
            }
            await captureEvidenceShot(
              page,
              evidenceDir,
              `page-${pageIdx}-after-fill.png`,
              pageGallery,
            );
            pagesFilled.push(`p${pageIdx}:{${fillResult.filled.join(',')}}`);
            allReceiptEntries.push(...fillResult.receipt);
            allFilledKeys.push(...fillResult.filled.map((k) => `p${pageIdx}:${k}`));
            allSkippedOptional.push(...fillResult.skippedOptional);

            // T-G-5: stage latest map after any page with verified fills.
            {
              const verifiedCount = fillResult.receipt.filter((e) => e.verified).length;
              if (verifiedCount > 0 && (opts.writeFieldMap || seedWasMissing)) {
                pendingSiteMap = { ...workingMap, id: mapId };
                pendingSeedWasMissing = seedWasMissing;
              }
            }

            // Done markers — custom banner exact; built-in defaults as substring regex.
            const defaultDone = page.getByText(/Application draft complete|application received/i).filter({
              visible: true,
            });
            const customDone = successBanner
              ? page.getByText(successBanner, { exact: true }).filter({ visible: true })
              : null;
            if ((await defaultDone.count()) > 0 || (customDone && (await customDone.count()) > 0)) {
              break;
            }
            const submitOnly = page.getByRole('button', { name: /Submit Application|^Submit$/i }).filter({
              visible: true,
            });
            if ((await submitOnly.count()) > 0) {
              if (opts.allowSubmit) {
                // G20: never click Submit while required fills in the receipt are unverified.
                const requiredKeys = (seedMap ?? workingMap).fields
                  .filter((f) => f.required)
                  .map((f) => f.key);
                const blocked = unverifiedRequiredKeys(allReceiptEntries, requiredKeys);
                if (blocked.length) {
                  ledger.push({
                    at: new Date().toISOString(),
                    stepId: step.id,
                    action: 'fillFormFlow',
                    ok: false,
                    detail: `submit blocked: unverified required: ${blocked.join(',')}`,
                  });
                  persistFillReceipt(evidenceDir, page, {
                    entries: allReceiptEntries,
                    filledKeys: allFilledKeys,
                    unverifiedRequired: blocked,
                    failDetail: `submit blocked: unverified required: ${blocked.join(',')}`,
                    skippedOptional: allSkippedOptional,
                  });
                  writeScreenshotManifest(evidenceDir, pageGallery);
                  flushPendingSiteMap('submit blocked unverified required');
                  return finishFormOutcome(
                    `submit blocked: unverified required: ${blocked.join(',')}`,
                    step.id,
                  );
                }
                // G21: refuse a second --submit for same job URL + profile email.
                const jobUrl = resolveUrlFrom(config, 'config.target.entryPath', capability);
                const guardKey = submitGuardKey(jobUrl, (opts.profile ?? {}) as Record<string, unknown>);
                let guard: { ok: true } | { ok: false; detail: string };
                try {
                  guard = checkSubmitGuard(root, guardKey);
                } catch (e) {
                  const detail = (e as Error).message;
                  ledger.push({
                    at: new Date().toISOString(),
                    stepId: step.id,
                    action: 'fillFormFlow',
                    ok: false,
                    detail,
                  });
                  persistFillReceipt(evidenceDir, page, {
                    entries: allReceiptEntries,
                    filledKeys: allFilledKeys,
                    failDetail: detail,
                    skippedOptional: allSkippedOptional,
                  });
                  writeScreenshotManifest(evidenceDir, pageGallery);
                  flushPendingSiteMap('submit ledger corrupt');
                  return finishFormOutcome(detail, step.id);
                }
                if (!guard.ok) {
                  ledger.push({
                    at: new Date().toISOString(),
                    stepId: step.id,
                    action: 'fillFormFlow',
                    ok: false,
                    detail: guard.detail,
                  });
                  persistFillReceipt(evidenceDir, page, {
                    entries: allReceiptEntries,
                    filledKeys: allFilledKeys,
                    failDetail: guard.detail,
                    skippedOptional: allSkippedOptional,
                  });
                  writeScreenshotManifest(evidenceDir, pageGallery);
                  flushPendingSiteMap('submit refused duplicate');
                  // Explicit code — do not sniff page body (leftover banners → UNMAPPED/CLOSED poison).
                  return finish({
                    ok: true,
                    status: 'BUSINESS_OUTCOME',
                    code: 'form.DUPLICATE',
                    message: guard.detail,
                    outputs: {},
                    error: null,
                  });
                }
                // Intent before click — crash between here and confirm still blocks a second fire.
                recordSubmitGuard(root, { key: guardKey, jobUrl });
                submitAttempted = true;
                try {
                  await submitOnly.first().click({ timeout: 8_000 });
                } catch (e) {
                  clearSubmitGuardKey(root, guardKey);
                  submitAttempted = false;
                  const detail = `submit click failed: ${(e as Error).message}`;
                  ledger.push({
                    at: new Date().toISOString(),
                    stepId: step.id,
                    action: 'fillFormFlow',
                    ok: false,
                    detail,
                  });
                  persistFillReceipt(evidenceDir, page, {
                    entries: allReceiptEntries,
                    filledKeys: allFilledKeys,
                    failDetail: detail,
                    skippedOptional: allSkippedOptional,
                  });
                  writeScreenshotManifest(evidenceDir, pageGallery);
                  flushPendingSiteMap('submit click failed');
                  return finishFormOutcome(detail, step.id);
                }
                await page.waitForTimeout(800);
                const defaultSubmit = page
                  .getByText(submitConfirmVisibleRegex(atsFamily))
                  .filter({ visible: true });
                const customSubmit = successBanner
                  ? page.getByText(successBanner, { exact: true }).filter({ visible: true })
                  : null;
                submitConfirmed =
                  (await defaultSubmit.count()) > 0 ||
                  Boolean(customSubmit && (await customSubmit.count()) > 0);
                const bodyText = await page
                  .locator('body')
                  .innerText()
                  .then((t) => t.slice(0, 8000))
                  .catch(() => '');
                const proof = extractSubmitProof(bodyText, atsFamily);
                if (proof.text || proof.reference) submitProof = proof;
                recordSubmitGuard(root, {
                  key: guardKey,
                  jobUrl,
                  submitConfirmed,
                });
                ledger.push({
                  at: new Date().toISOString(),
                  stepId: step.id,
                  action: 'fillFormFlow',
                  ok: submitConfirmed,
                  detail: submitConfirmed
                    ? `submit confirmed (banner)${proof.reference ? ` ref=${proof.reference}` : ''}`
                    : 'submit clicked but confirmation not observed',
                });
              }
              break;
            }

            const advanced = await clickFormAdvance(page);
            if (!advanced) break;
            await page.waitForTimeout(600);

            // Per-page validate: if required errors remain, one repair+retry.
            let errs = await listVisibleRequiredErrors(page);
            if (errs.length) {
              ledger.push({
                at: new Date().toISOString(),
                stepId: step.id,
                action: 'fillFormFlow',
                ok: true,
                detail: `page ${pageIdx} post-advance errors (${errs.length}): ${errs.slice(0, 3).join(' | ')}`,
              });
              try {
                const retryRepair = await repairFieldMap({
                  page,
                  fieldMap: workingMap,
                  mapId: `${mapId}-p${pageIdx}-retry`,
                  config,
                  profileKeys,
                  reason: `fillFormFlow page ${pageIdx} retry`,
                  allowLlm: true,
                  root,
                  atsFamily,
                });
                llmCalls += retryRepair.llmCalls;
                const retryFill = await fillNow(fillBag, retryRepair.map, {
                  skipInvisibleRequired: true,
                });
                llmCalls += retryFill.llmCalls;
                if (retryFill.ok) {
                  pagesFilled.push(`p${pageIdx}-retry:{${retryFill.filled.join(',')}}`);
                  allReceiptEntries.push(...retryFill.receipt);
                  allFilledKeys.push(...retryFill.filled.map((k) => `p${pageIdx}-retry:${k}`));
                  allSkippedOptional.push(...retryFill.skippedOptional);
                  // Stay on this page — outer loop advances once we re-observe next iteration.
                }
              } catch {
                /* keep going; next check may still fail */
              }
              errs = await listVisibleRequiredErrors(page);
              if (errs.length) {
                ledger.push({
                  at: new Date().toISOString(),
                  stepId: step.id,
                  action: 'fillFormFlow',
                  ok: false,
                  detail: `page ${pageIdx} still required: ${errs.slice(0, 5).join(' | ')}`,
                });
                writeScreenshotManifest(evidenceDir, pageGallery);
                flushPendingSiteMap('early fail required after advance');
                return finishFormOutcome(
                  `required after advance: ${errs.slice(0, 5).join(' | ')}`,
                  step.id,
                );
              }
            }

            if ((await defaultDone.count()) > 0 || (customDone && (await customDone.count()) > 0)) {
              break;
            }
          }

          persistFillReceipt(
            evidenceDir,
            page,
            {
              entries: allReceiptEntries,
              filledKeys: allFilledKeys,
              unverifiedRequired: allReceiptEntries.filter((e) => !e.verified).map((e) => e.key),
              failDetail:
                allFilledKeys.length === 0 ? 'empty fill: no fields filled' : undefined,
              skippedOptional: allSkippedOptional,
            },
          );
          writeScreenshotManifest(evidenceDir, pageGallery);

          // Overview false-green: never SUCCESS with zero fills.
          if (allFilledKeys.length === 0) {
            ledger.push({
              at: new Date().toISOString(),
              stepId: step.id,
              action: 'fillFormFlow',
              ok: false,
              detail: 'empty fill: no fields filled',
            });
            return finishFormOutcome('empty fill: no fields filled', step.id);
          }

          flushPendingSiteMap('flow success');

          ledger.push({
            at: new Date().toISOString(),
            stepId: step.id,
            action: 'fillFormFlow',
            ok: true,
            detail: pagesFilled.join(' → '),
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
          let recorder: Awaited<ReturnType<typeof startActionRecorder>> | null = null;
          if (opts.recordActions) {
            try {
              recorder = await startActionRecorder(page);
              console.error('  recording clicks (--record-actions); click the correct control, then resume');
            } catch (e) {
              log('warn', 'action recorder failed to start', { detail: (e as Error).message });
            }
          }
          const resumed = await waitForResume(evidenceDir, config.limits.runTimeoutMs);
          if (recorder) {
            const actions = await recorder.stop();
            writeRecordedActions(evidenceDir, actions);
            const tKey = targetKeyFromStep(capability, step.id);
            if (tKey && actions.length) {
              const teach = applyRecordedToTarget(capability, tKey, actions);
              writeJson(join(evidenceDir, 'hitl', 'teach-apply.json'), {
                targetKey: tKey,
                ...teach,
                humanActionsRecorded: true,
              });
              ledger.push({
                at: new Date().toISOString(),
                stepId: step.id,
                action: 'hitl_teach_apply',
                ok: teach.applied,
                detail: teach.detail,
              });
            }
          }
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
    const missing = capability.outputs.filter((o) => !outputs[o.name]?.length);
    // Gen G14: form flows succeed on page checkpoint even if some declared extracts are empty;
    // worker.gathered.missingOutputs carries the gap. Classic extract-only capabilities stay strict.
    const formFlow = capability.steps.some(
      (s) => s.action === 'fillForm' || s.action === 'fillFormFlow',
    );
    if (success && (missing.length === 0 || formFlow)) {
      await page
        .screenshot({ path: join(evidenceDir, 'screenshots', 'success.png'), fullPage: true })
        .catch(() => undefined);
      return finish({
        ok: true,
        status: 'SUCCESS',
        code: null,
        message:
          missing.length && formFlow
            ? `Capability completed successfully (missing outputs: ${missing.map((m) => m.name).join(',')})`
            : 'Capability completed successfully',
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
        const note = String(body.note ?? '');
        try {
          unlinkSync(resumeFile);
        } catch {
          /* consumed even if unlink fails */
        }
        return { ok: true, note };
      } catch {
        try {
          unlinkSync(resumeFile);
        } catch {
          /* ignore */
        }
        return { ok: true, note: '' };
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, note: '' };
}
