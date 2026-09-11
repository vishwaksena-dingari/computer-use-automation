#!/usr/bin/env node
/**
 * @file Operator CLI entry: discover | replay | escalate | config (show/validate/set).
 */
import { Command } from 'commander';
import { flattenForShow, loadConfig, validateConfig, type CliConfigOverrides } from '../config/load.js';
import { setConfigValue } from '../config/set.js';

function cliFromOpts(opts: Record<string, unknown>): CliConfigOverrides {
  return {
    provider: opts.provider as CliConfigOverrides['provider'],
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
    .option('--headed', 'headed browser on escalate')
    .option('--max-steps <n>', 'max replay/discover steps')
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
    .description('LLM discovery → capability artifact (S5)')
    .option('--goal <text>', 'natural-language goal')
    .action(() => {
      console.error('not implemented: discover (sprint S5)');
      process.exitCode = 1;
    }),
);

addGlobalConfigFlags(
  program
    .command('replay')
    .description('Deterministic replay of a capability artifact (S4)')
    .argument('[artifact]', 'path to capability JSON')
    .action(() => {
      console.error('not implemented: replay (sprint S4)');
      process.exitCode = 1;
    }),
);

addGlobalConfigFlags(
  program
    .command('escalate')
    .description('Same-session HITL pause/resume (S6)')
    .argument('[action]', 'pause | resume', 'pause')
    .action(() => {
      console.error('not implemented: escalate (sprint S6)');
      process.exitCode = 1;
    }),
);

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
        console.log(`ok  config=${loaded.configPath}`);
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
  .argument('<key>', 'dotted key, e.g. llm.model')
  .argument('<value>', 'scalar or JSON array/object')
  .option('--config <path>', 'path to config.yaml')
  .action((key: string, value: string, opts: { config?: string }) => {
    try {
      const path = setConfigValue(key, value, opts.config);
      console.log(`wrote ${key} → ${path}`);
      console.log('run: cua config show  (env/CLI may still override)');
    } catch (e) {
      console.error((e as Error).message);
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv).catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
