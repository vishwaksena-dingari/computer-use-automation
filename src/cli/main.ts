#!/usr/bin/env node
/**
 * @file Operator CLI entry: discover | replay | invoke | escalate | config.
 */
import { Command } from 'commander';
import { join, resolve, dirname } from 'node:path';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { flattenForShow, loadConfig, validateConfig, type CliConfigOverrides } from '../config/load.js';
import { setConfigValue } from '../config/set.js';
import { findProjectRoot, repoRelative, resolveUnderRoot } from '../config/paths.js';
import { loadCapability, sha256File, findCapabilityPathById } from '../artifact/load.js';
import { normalizeApplyProfile } from '../artifact/profile.js';
import {
  importPlanToFieldMap,
  writeImportedFieldMap,
} from '../artifact/import-plan.js';
import { authorAtsApplyShell } from '../discover/author-steps.js';
import { detectAtsFamily } from '../surface/detect-ats.js';
import { replayCapability } from '../replay/engine.js';
import { discoverCapability } from '../discover/emit.js';
import { writeResume } from '../session/hitl.js';
import { newRunId, prepareChapter, writeJson, ensureDir } from '../evidence/store.js';
import { configureLog, log } from '../util/log.js';
import { workerSummaryFromReplay } from './worker-exit.js';

function cliFromOpts(opts: Record<string, unknown>): CliConfigOverrides {
  return {
    provider: opts.provider as string | undefined,
    model: opts.model as string | undefined,
    ollamaUrl: opts.ollamaUrl as string | undefined,
    baseUrl: opts.baseUrl as string | undefined,
    headed: opts.headed as boolean | undefined,
    configPath: opts.config as string | undefined,
    storageStatePath: opts.storageState as string | undefined,
    maxSteps: opts.maxSteps !== undefined ? Number(opts.maxSteps) : undefined,
    stepTimeoutMs: opts.stepTimeoutMs !== undefined ? Number(opts.stepTimeoutMs) : undefined,
    runTimeoutMs: opts.runTimeoutMs !== undefined ? Number(opts.runTimeoutMs) : undefined,
  };
}

/** Load applicant profile JSON; path must resolve under project root (realpath). */
function loadProfileJson(root: string, profilePath: string): Record<string, unknown> {
  const abs = resolveUnderRoot(root, profilePath, { realpath: true });
  return normalizeApplyProfile(JSON.parse(readFileSync(abs, 'utf8')) as Record<string, unknown>);
}

/**
 * Overlay ATS login secrets from env (never invent accounts).
 * WORKDAY_EMAIL / WORKDAY_PASSWORD (or ATS_EMAIL / ATS_PASSWORD).
 */
function applyAtsEnvOverrides(profile: Record<string, unknown>): Record<string, unknown> {
  const email = process.env.WORKDAY_EMAIL || process.env.ATS_EMAIL;
  const password = process.env.WORKDAY_PASSWORD || process.env.ATS_PASSWORD;
  if (!email && !password) return profile;
  const next = { ...profile };
  // Only overlay keys the profile already declares — avoids stamping secrets onto apply-only profiles.
  if (email && Object.prototype.hasOwnProperty.call(profile, 'email')) next.email = email;
  if (password && Object.prototype.hasOwnProperty.call(profile, 'password')) next.password = password;
  return next;
}

function parseFillMode(raw: string): 'deterministic' | 'hybrid' {
  if (raw === 'deterministic' || raw === 'hybrid') return raw;
  throw new Error(`--mode must be deterministic|hybrid (got ${raw})`);
}

/** Dormant form repair attempts (1–5). */
function parseFormRepairMax(raw: unknown): number {
  const n = Number(raw ?? 3);
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.floor(n)));
}

function addGlobalConfigFlags(cmd: Command): Command {
  return cmd
    .option('--provider <name>', 'ollama | anthropic | openai')
    .option('--model <id>', 'model id')
    .option('--ollama-url <url>', 'Ollama base URL')
    .option('--base-url <url>', 'target base URL')
    .option('--headed', 'headed browser')
    .option('--verbose', 'debug logs on stderr (or set CUA_LOG=debug)')
    .option('--max-steps <n>', 'max steps')
    .option('--step-timeout-ms <n>', 'per-step timeout ms')
    .option('--run-timeout-ms <n>', 'whole-run timeout ms')
    .option('--config <path>', 'path to config.yaml')
    .option('--storage-state <path>', 'Playwright storageState JSON (repo-relative)');
}

const program = new Command();
program
  .name('cua')
  .description('Computer-use automation — discover, replay, invoke, escalate, config')
  .version('0.1.0');

addGlobalConfigFlags(
  program
    .command('discover')
    .description('LLM discovery → capability artifact')
    .option('--goal <text>', 'natural-language goal', 'Look up member savings balance')
    .option('--out <path>', 'artifact output path')
    .option('--seed <path>', 'OFFLINE ONLY: explicit seed path (never auto-reads .private/)')
    .option('--evidence <dir>', 'evidence chapter dir')
    .option('--allow-offline-seed', 'use --seed file if Ollama unreachable (requires --seed)')
    .option('--author-steps', 'G2: LLM authors Zod-capped steps+targets (default: locators only)')
    .action(async (opts) => {
      try {
        configureLog({ verbose: Boolean(opts.verbose) });
        const loaded = loadConfig(cliFromOpts(opts));
        const errs = validateConfig(loaded);
        if (errs.length) {
          for (const e of errs) console.error(`error: ${e}`);
          process.exitCode = 1;
          return;
        }
        const root = loaded.root;
        if (opts.allowOfflineSeed && !opts.seed) {
          console.error('error: --allow-offline-seed requires explicit --seed <path>');
          process.exitCode = 1;
          return;
        }
        const seed = opts.seed as string | undefined;
        const out =
          opts.out ??
          (opts.authorSteps
            ? join(root, 'capabilities/experiments/authored-capability.json')
            : join(root, 'capabilities/lookup-member-savings-balance.json'));
        const evidenceDir =
          opts.evidence ??
          join(
            root,
            loaded.config.evidence.dir,
            opts.authorSteps ? 'g2-author-steps' : '01-discovery',
          );
        if (opts.authorSteps) {
          ensureDir(join(root, 'capabilities/experiments'));
        } else {
          prepareChapter(join(root, loaded.config.evidence.dir), '01-discovery');
        }
        log('info', 'discover start', { goal: opts.goal, authorSteps: Boolean(opts.authorSteps) });
        const result = await discoverCapability({
          config: loaded.config,
          root,
          goal: opts.goal,
          evidenceDir,
          seedPath: seed ?? '',
          outPath: out,
          allowOfflineSeed: Boolean(opts.allowOfflineSeed),
          authorSteps: Boolean(opts.authorSteps),
        });
        writeJson(join(evidenceDir, 'manifest.json'), {
          goal: opts.goal,
          provider: result.provider,
          model: result.model,
          artifactPath: result.artifactPath,
          artifactSha256: result.artifactSha256,
          llmCalls: result.llmCalls,
        });
        writeJson(join(evidenceDir, 'result.json'), result);
        log('info', 'discover done', {
          ok: result.ok,
          artifactPath: result.artifactPath,
          llmCalls: result.llmCalls,
        });
        console.log(JSON.stringify(result, null, 2));
        if (!result.ok) process.exitCode = 1;
      } catch (e) {
        log('error', (e as Error).message);
        console.error((e as Error).message);
        process.exitCode = 1;
      }
    }),
);

addGlobalConfigFlags(
  program
    .command('replay')
    .description('Deterministic replay of a capability artifact (no LLM)')
    .argument('[artifact]', 'path to capability JSON')
    .option('--member-id <id>', 'memberId input', 'M-10042')
    .option('--param <key=value>', 'extra input', collectParams, {})
    .option('--evidence <dir>', 'evidence directory for this run')
    .option('--chapter <name>', 'evidence chapter name under evidence/')
    .option('--escalate', 'pause same session on stuck/policy for HITL')
    .option('--hitl-locator-patch', 'after HITL resume --note, one LLM patch of stuck target')
    .option('--record-actions', 'P3: record operator clicks during HITL and merge into stuck target')
    .option('--auto-retrain', 'on locator_miss: discover once then retry replay (capped)')
    .option('--auto-retrain-max <n>', 'auto-retrain attempts (1–2)', '1')
    .option('--autonomous-repair', 'P3: loop discover+replay on locator_miss until success or max')
    .option('--autonomous-repair-max <n>', 'autonomous repair attempts (1–5, default 3)', '3')
    .option('--bindings <path>', 'JSON overlay merged into capability.bindings (S8)')
    .option('--goal <text>', 'goal used when --auto-retrain / --autonomous-repair discovers', 'Look up member savings balance')
    .option('--mode <mode>', 'deterministic | hybrid (G1 fillForm)', 'deterministic')
    .option('--profile <path>', 'applicant profile JSON for fillForm (G1)')
    .option('--company-context <text>', 'optional company blurb for hybrid craft')
    .option('--write-field-map', 'persist repaired field-map under capabilities/field-maps/')
    .option('--form-repair-max <n>', 'dormant stuck repair loop (1–5, default 3)', '3')
    .option('--record-har', 'write evidence/<run>/network.har (omit bodies by default)')
    .option('--har-on-failure', 'with --record-har: keep HAR only when the run fails')
    .option('--trace-on-failure', 'write evidence/<run>/trace.zip only when the run fails')
    .option('--har-content <mode>', 'omit | embed', 'omit')
    .option('--submit', 'allow clicking Submit on apply forms (default: fill-only)')
    .action(async (artifact: string | undefined, opts) => {
      try {
        configureLog({ verbose: Boolean(opts.verbose) });
        const loaded = loadConfig(cliFromOpts(opts));
        const errs = validateConfig(loaded);
        if (errs.length) {
          for (const e of errs) console.error(`error: ${e}`);
          process.exitCode = 1;
          return;
        }
        const root = loaded.root;
        const artPath =
          artifact ?? join(root, 'capabilities/lookup-member-savings-balance.json');
        let capability = loadCapability(artPath);
        const params: Record<string, string> = {
          memberId: opts.memberId,
          ...(opts.param as Record<string, string>),
        };
        const runId = newRunId('replay');
        const evidenceDir =
          opts.evidence ??
          (opts.chapter
            ? prepareChapter(join(root, loaded.config.evidence.dir), opts.chapter)
            : join(root, loaded.config.evidence.dir, 'runs', runId));
        ensureEvidence(evidenceDir);

        let bindingsOverlay: Record<string, unknown> | null = null;
        if (opts.bindings) {
          const { readFileSync } = await import('node:fs');
          bindingsOverlay = JSON.parse(readFileSync(opts.bindings, 'utf8')) as Record<
            string,
            unknown
          >;
        }

        let profile: Record<string, unknown> | undefined;
        if (opts.profile) {
          profile = applyAtsEnvOverrides(loadProfileJson(root, opts.profile as string));
        } else {
          profile = applyAtsEnvOverrides({});
          if (!Object.keys(profile).length) profile = undefined;
        }
        const mode = parseFillMode(String(opts.mode ?? 'deterministic'));

        const maxRetrain = opts.autonomousRepair
          ? Math.min(5, Math.max(1, Number(opts.autonomousRepairMax ?? 3) || 3))
          : Math.min(2, Math.max(1, Number(opts.autoRetrainMax ?? 1) || 1));
        const repairEnabled = Boolean(opts.autonomousRepair || opts.autoRetrain);
        let autoRetrainAttempts = 0;

        const runOnce = async () =>
          replayCapability({
            capability,
            config: loaded.config,
            root,
            params,
            runId,
            evidenceDir,
            headed: Boolean(opts.headed || opts.escalate),
            escalateOnPolicy: Boolean(opts.escalate),
            hitlLocatorPatch: Boolean(opts.hitlLocatorPatch),
            recordActions: Boolean(opts.recordActions),
            bindingsOverlay,
            profile,
            mode,
            companyContext: opts.companyContext as string | undefined,
            writeFieldMap: Boolean(opts.writeFieldMap),
            formRepairMax: parseFormRepairMax(opts.formRepairMax),
            recordHarPath: opts.recordHar
              ? join(evidenceDir, 'network.har')
              : undefined,
            recordHarContent:
              opts.harContent === 'embed' ? ('embed' as const) : ('omit' as const),
            harRetainOnFailure: Boolean(opts.harOnFailure),
            traceOnFailure: Boolean(opts.traceOnFailure),
            allowSubmit: Boolean(opts.submit),
          });

        log('info', 'replay start', {
          capabilityId: capability.id,
          memberId: params.memberId,
          runId,
        });
        let result = await runOnce();

        while (
          repairEnabled &&
          !result.ok &&
          result.error?.reason === 'locator_miss' &&
          autoRetrainAttempts < maxRetrain
        ) {
          autoRetrainAttempts += 1;
          log('warn', 'repair after locator_miss', {
            attempt: autoRetrainAttempts,
            max: maxRetrain,
            mode: opts.autonomousRepair ? 'autonomous-repair' : 'auto-retrain',
          });
          const retrainDir = join(evidenceDir, 'auto-retrain', String(autoRetrainAttempts));
          ensureDir(retrainDir);
          const discovered = await discoverCapability({
            config: loaded.config,
            root,
            goal: opts.goal as string,
            evidenceDir: retrainDir,
            seedPath: '',
            outPath: artPath,
            allowOfflineSeed: false,
          });
          writeJson(join(evidenceDir, 'auto-retrain.json'), {
            mode: opts.autonomousRepair ? 'autonomous-repair' : 'auto-retrain',
            attempts: autoRetrainAttempts,
            max: maxRetrain,
            discoverOk: discovered.ok,
            artifactPath: discovered.artifactPath,
            llmCalls: discovered.llmCalls,
          });
          if (!discovered.ok) break;
          capability = loadCapability(artPath);
          result = await runOnce();
        }

        if (autoRetrainAttempts > 0) {
          result = { ...result, autoRetrainAttempts };
        }

        writeJson(join(evidenceDir, 'result.json'), result);
        writeJson(join(evidenceDir, 'manifest.json'), {
          artifactPath: repoRelative(root, artPath),
          artifactSha256: sha256File(artPath),
          params: { memberId: params.memberId },
          llmCalls: result.llmCalls,
          runId,
          autoRetrainAttempts,
          bindings: opts.bindings ? repoRelative(root, opts.bindings) : null,
        });
        log('info', 'replay done', {
          status: result.status,
          code: result.code,
          evidenceDir: result.evidenceDir,
        });
        console.log(JSON.stringify(result, null, 2));
        if (!result.ok) process.exitCode = 1;
      } catch (e) {
        log('error', (e as Error).message);
        console.error((e as Error).message);
        process.exitCode = 1;
      }
    }),
);

addGlobalConfigFlags(
  program
    .command('invoke')
    .description('Calling-agent surface: capability id + typed params → replay result (S9)')
    .argument('<id>', 'capability id (matches capabilities/<id>.json or JSON id)')
    .option('--member-id <id>', 'memberId input', 'M-10042')
    .option('--param <key=value>', 'extra input', collectParams, {})
    .option('--bindings <path>', 'optional bindings overlay JSON')
    .option('--evidence <dir>', 'evidence directory for this run')
    .option('--mode <mode>', 'deterministic | hybrid (G1 fillForm)', 'deterministic')
    .option('--profile <path>', 'applicant profile JSON for fillForm (G1)')
    .option('--company-context <text>', 'optional company blurb for hybrid craft')
    .option('--escalate', 'pause same session on stuck/policy / field.UNMAPPED for HITL')
    .option('--write-field-map', 'persist repaired field-map under capabilities/field-maps/')
    .option('--form-repair-max <n>', 'dormant stuck repair loop (1–5, default 3)', '3')
    .option('--record-har', 'write evidence/<run>/network.har')
    .option('--har-on-failure', 'with --record-har: keep HAR only when the run fails')
    .option('--trace-on-failure', 'write evidence/<run>/trace.zip only when the run fails')
    .option('--har-content <mode>', 'omit | embed', 'omit')
    .option('--submit', 'allow clicking Submit on apply forms (default: fill-only)')
    .action(async (id: string, opts) => {
      try {
        configureLog({ verbose: Boolean(opts.verbose) });
        const loaded = loadConfig(cliFromOpts(opts));
        const errs = validateConfig(loaded);
        if (errs.length) {
          for (const e of errs) console.error(`error: ${e}`);
          process.exitCode = 1;
          return;
        }
        const root = loaded.root;
        const artPath = findCapabilityPathById(root, id);
        const capability = loadCapability(artPath);
        const params: Record<string, string> = {
          memberId: opts.memberId,
          ...(opts.param as Record<string, string>),
        };
        // Validate required inputs exist (thin typed gate)
        for (const input of capability.inputs) {
          if (input.required && (params[input.name] === undefined || params[input.name] === '')) {
            throw new Error(`missing required input: ${input.name}`);
          }
        }
        const runId = newRunId('invoke');
        const evidenceDir =
          opts.evidence ?? join(root, loaded.config.evidence.dir, 'runs', runId);
        ensureEvidence(evidenceDir);

        let bindingsOverlay: Record<string, unknown> | null = null;
        if (opts.bindings) {
          const { readFileSync } = await import('node:fs');
          bindingsOverlay = JSON.parse(readFileSync(opts.bindings, 'utf8')) as Record<
            string,
            unknown
          >;
        }

        let profile: Record<string, unknown> | undefined;
        if (opts.profile) {
          profile = applyAtsEnvOverrides(loadProfileJson(root, opts.profile as string));
        } else {
          profile = applyAtsEnvOverrides({});
          if (!Object.keys(profile).length) profile = undefined;
        }

        log('info', 'invoke start', { id, memberId: params.memberId, runId });
        const result = await replayCapability({
          capability,
          config: loaded.config,
          root,
          params,
          runId,
          evidenceDir,
          headed: Boolean(opts.headed || opts.escalate),
          escalateOnPolicy: Boolean(opts.escalate),
          bindingsOverlay,
          profile,
          mode: parseFillMode(String(opts.mode ?? 'deterministic')),
          companyContext: opts.companyContext as string | undefined,
          writeFieldMap: Boolean(opts.writeFieldMap),
          formRepairMax: parseFormRepairMax(opts.formRepairMax),
          recordHarPath: opts.recordHar ? join(evidenceDir, 'network.har') : undefined,
          recordHarContent: opts.harContent === 'embed' ? 'embed' : 'omit',
          harRetainOnFailure: Boolean(opts.harOnFailure),
          traceOnFailure: Boolean(opts.traceOnFailure),
          allowSubmit: Boolean(opts.submit),
        });

        const agentView = {
          ok: result.ok,
          capabilityId: result.capabilityId,
          capabilityVersion: result.capabilityVersion,
          status: result.status,
          code: result.code,
          outputs: result.outputs,
          message: result.message,
          evidenceDir: result.evidenceDir,
          llmCalls: result.llmCalls,
        };
        writeJson(join(evidenceDir, 'result.json'), result);
        writeJson(join(evidenceDir, 'manifest.json'), {
          mode: 'invoke',
          artifactPath: repoRelative(root, artPath),
          artifactSha256: sha256File(artPath),
          params: { memberId: params.memberId },
          llmCalls: result.llmCalls,
          runId,
        });
        console.log(JSON.stringify(agentView, null, 2));
        if (!result.ok) process.exitCode = 1;
      } catch (e) {
        log('error', (e as Error).message);
        console.error((e as Error).message);
        process.exitCode = 1;
      }
    }),
);

function collectParams(val: string, prev: Record<string, string>): Record<string, string> {
  const i = val.indexOf('=');
  if (i < 0) return prev;
  prev[val.slice(0, i)] = val.slice(i + 1);
  return prev;
}

function ensureEvidence(dir: string): void {
  ensureDir(join(dir, 'screenshots'));
  ensureDir(join(dir, 'hitl'));
}

const escalate = program.command('escalate').description('HITL pause/resume helpers');

addGlobalConfigFlags(
  program
    .command('import-plan')
    .description('Import upstream plan JSON → FieldMap (P2)')
    .requiredOption('--plan-json <path>', 'plan JSON path (under project root)')
    .option('--out <path>', 'field-map output path')
    .option('--id <id>', 'field-map id', 'imported-plan')
    .option('--ats <family>', 'ashby|lever|greenhouse|workday|auto')
    .action((opts) => {
      try {
        const root = findProjectRoot();
        const planPath = resolveUnderRoot(root, opts.planJson as string, { realpath: true });
        const raw = JSON.parse(readFileSync(planPath, 'utf8')) as unknown;
        const platform =
          opts.ats && opts.ats !== 'auto' ? String(opts.ats) : (raw as { ats?: string }).ats;
        const map = importPlanToFieldMap(raw, { id: String(opts.id), platform });
        const out =
          (opts.out as string | undefined) ??
          writeImportedFieldMap(root, map);
        if (opts.out) {
          const outAbs = resolveUnderRoot(root, opts.out as string, { realpath: false });
          mkdirSync(dirname(outAbs), { recursive: true });
          writeFileSync(outAbs, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
        }
        console.log(
          JSON.stringify(
            { ok: true, fieldMapId: map.id, out: repoRelative(root, resolve(root, out)), fields: map.fields.length },
            null,
            2,
          ),
        );
      } catch (e) {
        console.error((e as Error).message);
        process.exitCode = 1;
      }
    }),
);

addGlobalConfigFlags(
  program
    .command('apply')
    .description('Worker apply: navigate URL → fillFormFlow (optional plan import); Submit only with --submit')
    .requiredOption('--url <url>', 'apply form URL')
    .option('--ats <family>', 'auto|ashby|lever|greenhouse|workday', 'auto')
    .option('--profile <path>', 'applicant profile JSON')
    .option('--plan-json <path>', 'optional upstream plan → FieldMap')
    .option('--field-map-id <id>', 'existing field-map id (default: from plan or auto-<ats>)')
    .option('--mode <mode>', 'deterministic | hybrid', 'deterministic')
    .option('--company-context <text>', 'optional company blurb for hybrid craft')
    .option('--escalate', 'pause same session on captcha/policy/stuck')
    .option('--submit', 'click Submit when visible (default off)')
    .option('--evidence <dir>', 'evidence directory')
    .option('--write-field-map', 'persist repaired field-map')
    .option('--form-repair-max <n>', 'dormant stuck repair loop (1–5)', '3')
    .option('--record-har', 'write network.har')
    .option('--har-on-failure', 'keep HAR only on failure')
    .option('--trace-on-failure', 'keep trace.zip only on failure')
    .action(async (opts) => {
      try {
        configureLog({ verbose: Boolean(opts.verbose) });
        const url = String(opts.url);
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(url);
        } catch {
          throw new Error(`invalid --url: ${url}`);
        }
        const loaded = loadConfig({
          ...cliFromOpts(opts),
          baseUrl: parsedUrl.origin,
        });
        // entryPath must include path+search for navigate
        loaded.config.target.entryPath = `${parsedUrl.pathname}${parsedUrl.search}` || '/';
        loaded.config.target.baseUrl = parsedUrl.origin;
        const errs = validateConfig(loaded);
        if (errs.length) {
          for (const e of errs) console.error(`error: ${e}`);
          process.exitCode = 1;
          return;
        }
        const root = loaded.root;
        const family =
          opts.ats && opts.ats !== 'auto'
            ? String(opts.ats)
            : detectAtsFamily(url);
        let mapId = opts.fieldMapId as string | undefined;
        if (opts.planJson) {
          const planPath = resolveUnderRoot(root, opts.planJson as string, { realpath: true });
          const raw = JSON.parse(readFileSync(planPath, 'utf8')) as unknown;
          mapId = mapId ?? `imported-${family}`;
          const map = importPlanToFieldMap(raw, { id: mapId, platform: family });
          writeImportedFieldMap(root, map);
        }
        mapId = mapId ?? `auto-${family}`;
        const capability = authorAtsApplyShell({
          goal: `Apply via ${url}`,
          mapId,
          family,
        });
        const capDir = join(root, 'capabilities', 'experiments');
        mkdirSync(capDir, { recursive: true });
        const capPath = join(capDir, `${capability.id}.json`);
        writeFileSync(capPath, `${JSON.stringify(capability, null, 2)}\n`, 'utf8');

        let profile: Record<string, unknown> | undefined;
        if (opts.profile) {
          profile = applyAtsEnvOverrides(loadProfileJson(root, opts.profile as string));
        }
        const runId = newRunId('apply');
        const evidenceDir =
          opts.evidence ?? join(root, 'evidence', 'private', runId);
        ensureEvidence(evidenceDir);
        ensureDir(join(root, 'evidence', 'private'));

        const result = await replayCapability({
          capability,
          config: loaded.config,
          root,
          params: {},
          runId,
          evidenceDir,
          headed: Boolean(opts.headed || opts.escalate),
          escalateOnPolicy: Boolean(opts.escalate),
          profile,
          mode: parseFillMode(String(opts.mode ?? 'deterministic')),
          companyContext: opts.companyContext as string | undefined,
          writeFieldMap: Boolean(opts.writeFieldMap),
          formRepairMax: parseFormRepairMax(opts.formRepairMax),
          recordHarPath: opts.recordHar ? join(evidenceDir, 'network.har') : undefined,
          harRetainOnFailure: Boolean(opts.harOnFailure),
          traceOnFailure: Boolean(opts.traceOnFailure),
          allowSubmit: Boolean(opts.submit),
        });
        writeJson(join(evidenceDir, 'result.json'), result);
        const summary = workerSummaryFromReplay(result, {
          submitted: Boolean(opts.submit) && result.ok,
          allowSubmit: Boolean(opts.submit),
        });
        writeJson(join(evidenceDir, 'worker.json'), summary);
        console.log(JSON.stringify(summary, null, 2));
        process.exitCode = summary.exitCode;
      } catch (e) {
        log('error', (e as Error).message);
        console.error((e as Error).message);
        process.exitCode = 4;
      }
    }),
);

escalate
  .command('resume')
  .description('Signal resume for a paused run (same evidence run dir)')
  .requiredOption('--run <runId>', 'run id (folder under evidence/runs or full path)')
  .option('--note <text>', 'operator note', '')
  .option('--dir <path>', 'explicit evidence run directory')
  .option('--recorded', 'mark humanActionsRecorded true (P3 teach resume)')
  .action((opts) => {
    try {
      const root = findProjectRoot();
      const runDir =
        opts.dir ??
        join(root, 'evidence', 'runs', opts.run) ;
      writeResume(runDir, opts.note || 'operator resumed', {
        humanActionsRecorded: Boolean(opts.recorded),
      });
      console.log(`resumed ${repoRelative(root, runDir)}`);
    } catch (e) {
      console.error((e as Error).message);
      process.exitCode = 1;
    }
  });

escalate
  .command('status')
  .description('Show intervention.json if present')
  .requiredOption('--run <runId>', 'run id')
  .option('--dir <path>', 'explicit evidence run directory')
  .action(async (opts) => {
    const { readFileSync, existsSync } = await import('node:fs');
    const root = findProjectRoot();
    const runDir = opts.dir ?? join(root, 'evidence', 'runs', opts.run);
    const p = join(runDir, 'hitl', 'intervention.json');
    if (!existsSync(p)) {
      console.log('no intervention');
      return;
    }
    console.log(readFileSync(p, 'utf8'));
  });

const configCmd = program.command('config').description('Runtime config show / validate / set');

addGlobalConfigFlags(
  configCmd
    .command('show')
    .description('Print effective config + winning layer per key')
    .action((opts) => {
      try {
        const loaded = loadConfig(cliFromOpts(opts));
        const flat = flattenForShow(loaded.config);
        for (const [key, value] of Object.entries(flat)) {
          const layer = loaded.sources[key] ?? 'default';
          const rendered = Array.isArray(value) ? JSON.stringify(value) : String(value);
          console.log(`${key}=${rendered}  [${layer}]`);
        }
      } catch (e) {
        console.error((e as Error).message);
        process.exitCode = 1;
      }
    }),
);

addGlobalConfigFlags(
  configCmd
    .command('validate')
    .description('Fail closed on bad schema / missing cloud keys')
    .action((opts) => {
      try {
        const loaded = loadConfig(cliFromOpts(opts));
        const errors = validateConfig(loaded);
        if (errors.length) {
          for (const err of errors) console.error(`error: ${err}`);
          process.exitCode = 1;
          return;
        }
        console.log(`ok  config=${repoRelative(loaded.root, loaded.configPath)}`);
        console.log(`    provider=${loaded.config.llm.provider} model=${loaded.config.llm.model}`);
      } catch (e) {
        console.error((e as Error).message);
        process.exitCode = 1;
      }
    }),
);

configCmd
  .command('set')
  .description('Write a non-secret key into config.yaml')
  .argument('<key>', 'dotted key')
  .argument('<value>', 'scalar or JSON')
  .option('--config <path>', 'path to config.yaml')
  .action((key: string, value: string, opts: { config?: string }) => {
    try {
      const path = setConfigValue(key, value, opts.config);
      const root = findProjectRoot();
      console.log(`wrote ${key} → ${repoRelative(root, path)}`);
    } catch (e) {
      console.error((e as Error).message);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv).catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
