#!/usr/bin/env node
/**
 * @file Operator CLI entry: discover | replay | invoke | escalate | config.
 */
import { Command } from 'commander';
import { join } from 'node:path';
import { flattenForShow, loadConfig, validateConfig, type CliConfigOverrides } from '../config/load.js';
import { setConfigValue } from '../config/set.js';
import { findProjectRoot, repoRelative } from '../config/paths.js';
import { loadCapability, sha256File, findCapabilityPathById } from '../artifact/load.js';
import { replayCapability } from '../replay/engine.js';
import { discoverCapability } from '../discover/emit.js';
import { writeResume } from '../session/hitl.js';
import { newRunId, prepareChapter, writeJson, ensureDir } from '../evidence/store.js';
import { configureLog, log } from '../util/log.js';

function cliFromOpts(opts: Record<string, unknown>): CliConfigOverrides {
  return {
    provider: opts.provider as string | undefined,
    model: opts.model as string | undefined,
    ollamaUrl: opts.ollamaUrl as string | undefined,
    baseUrl: opts.baseUrl as string | undefined,
    headed: opts.headed as boolean | undefined,
    configPath: opts.config as string | undefined,
    maxSteps: opts.maxSteps !== undefined ? Number(opts.maxSteps) : undefined,
    stepTimeoutMs: opts.stepTimeoutMs !== undefined ? Number(opts.stepTimeoutMs) : undefined,
    runTimeoutMs: opts.runTimeoutMs !== undefined ? Number(opts.runTimeoutMs) : undefined,
  };
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
    .option('--config <path>', 'path to config.yaml');
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
        const out = opts.out ?? join(root, 'capabilities/lookup-member-savings-balance.json');
        const evidenceDir =
          opts.evidence ?? join(root, loaded.config.evidence.dir, '01-discovery');
        prepareChapter(join(root, loaded.config.evidence.dir), '01-discovery');
        log('info', 'discover start', { goal: opts.goal });
        const result = await discoverCapability({
          config: loaded.config,
          root,
          goal: opts.goal,
          evidenceDir,
          seedPath: seed ?? '',
          outPath: out,
          allowOfflineSeed: Boolean(opts.allowOfflineSeed),
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

        log('info', 'invoke start', { id, memberId: params.memberId, runId });
        const result = await replayCapability({
          capability,
          config: loaded.config,
          root,
          params,
          runId,
          evidenceDir,
          headed: Boolean(opts.headed),
          bindingsOverlay,
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
