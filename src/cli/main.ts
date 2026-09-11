#!/usr/bin/env node
/**
 * @file Operator CLI entry: discover | replay | escalate | config.
 */
import { Command } from 'commander';
import { join } from 'node:path';
import { flattenForShow, loadConfig, validateConfig, type CliConfigOverrides } from '../config/load.js';
import { setConfigValue } from '../config/set.js';
import { findProjectRoot, repoRelative } from '../config/paths.js';
import { loadCapability, sha256File } from '../artifact/load.js';
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
  .description('Computer-use automation — discover, replay, escalate, config')
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
        const capability = loadCapability(artPath);
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
        log('info', 'replay start', {
          capabilityId: capability.id,
          memberId: params.memberId,
          runId,
        });
        const result = await replayCapability({
          capability,
          config: loaded.config,
          root,
          params,
          runId,
          evidenceDir,
          headed: Boolean(opts.headed || opts.escalate),
          escalateOnPolicy: Boolean(opts.escalate),
        });
        writeJson(join(evidenceDir, 'result.json'), result);
        writeJson(join(evidenceDir, 'manifest.json'), {
          artifactPath: repoRelative(root, artPath),
          artifactSha256: sha256File(artPath),
          params: { memberId: params.memberId },
          llmCalls: 0,
          runId,
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
  .action((opts) => {
    try {
      const root = findProjectRoot();
      const runDir =
        opts.dir ??
        join(root, 'evidence', 'runs', opts.run) ;
      writeResume(runDir, opts.note || 'operator resumed');
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
