/**
 * @file Load + merge RuntimeConfig: CLI > env > config.local.yaml > config.yaml > code defaults.
 */
import { existsSync, readFileSync } from 'node:fs';
import { config as loadDotenv } from 'dotenv';
import { parse as parseYaml } from 'yaml';
import {
  CODE_DEFAULTS,
  FileConfigSchema,
  LocalOverlaySchema,
  RuntimeConfigSchema,
  type ConfigLayer,
  type ConfigSources,
  type FileConfig,
  type LocalOverlay,
  type RuntimeConfig,
  type Secrets,
} from './schema.js';
import { configLocalYamlPath, configYamlPath, envFilePath, findProjectRoot } from './paths.js';

export type CliConfigOverrides = {
  provider?: string;
  model?: string;
  ollamaUrl?: string;
  baseUrl?: string;
  headed?: boolean;
  configPath?: string;
  /** Playwright storageState JSON (repo-relative). */
  storageStatePath?: string;
  maxSteps?: number;
  stepTimeoutMs?: number;
  runTimeoutMs?: number;
};

export type LoadedConfig = {
  config: RuntimeConfig;
  sources: ConfigSources;
  root: string;
  configPath: string;
};

function deepClone<T>(v: T): T {
  return structuredClone(v);
}

function setSource(sources: ConfigSources, key: string, layer: ConfigLayer): void {
  sources[key] = layer;
}

function markTree(sources: ConfigSources, prefix: string, layer: ConfigLayer, obj: unknown): void {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    setSource(sources, prefix, layer);
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      markTree(sources, path, layer, v);
    } else {
      setSource(sources, path, layer);
    }
  }
}

function applyFileLayer(
  base: FileConfig,
  sources: ConfigSources,
  file: FileConfig,
): FileConfig {
  const next = deepClone(base);
  next.schemaVersion = file.schemaVersion;
  setSource(sources, 'schemaVersion', 'file');

  next.llm = { ...next.llm, ...file.llm };
  markTree(sources, 'llm', 'file', file.llm);

  next.target = { ...next.target, ...file.target };
  markTree(sources, 'target', 'file', file.target);

  // Lists replace entirely from the winning layer (never concat).
  next.policy = {
    allowedHosts: file.policy.allowedHosts,
    allowedActions: file.policy.allowedActions,
    riskyActions: file.policy.riskyActions,
  };
  markTree(sources, 'policy', 'file', file.policy);

  next.limits = { ...next.limits, ...file.limits };
  markTree(sources, 'limits', 'file', file.limits);

  next.session = { ...next.session, ...file.session };
  markTree(sources, 'session', 'file', file.session);

  next.evidence = { ...next.evidence, ...file.evidence };
  markTree(sources, 'evidence', 'file', file.evidence);

  return next;
}

/**
 * Merge gitignored config.local.yaml over committed config.yaml.
 * List fields replace when present; scalars deep-merge.
 */
function applyLocalOverlay(
  base: FileConfig,
  sources: ConfigSources,
  local: LocalOverlay,
): FileConfig {
  const next = deepClone(base);
  if (local.llm) {
    next.llm = { ...next.llm, ...local.llm };
    markTree(sources, 'llm', 'local', local.llm);
  }
  if (local.target) {
    next.target = { ...next.target, ...local.target };
    markTree(sources, 'target', 'local', local.target);
  }
  if (local.policy) {
    if (local.policy.allowedHosts) {
      next.policy.allowedHosts = local.policy.allowedHosts;
      setSource(sources, 'policy.allowedHosts', 'local');
    }
    if (local.policy.allowedActions) {
      next.policy.allowedActions = local.policy.allowedActions;
      setSource(sources, 'policy.allowedActions', 'local');
    }
    if (local.policy.riskyActions) {
      next.policy.riskyActions = local.policy.riskyActions;
      setSource(sources, 'policy.riskyActions', 'local');
    }
  }
  if (local.limits) {
    next.limits = { ...next.limits, ...local.limits };
    markTree(sources, 'limits', 'local', local.limits);
  }
  if (local.session) {
    next.session = { ...next.session, ...local.session };
    markTree(sources, 'session', 'local', local.session);
  }
  if (local.evidence) {
    next.evidence = { ...next.evidence, ...local.evidence };
    markTree(sources, 'evidence', 'local', local.evidence);
  }
  return next;
}

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') return undefined;
  return v.trim();
}

function applyEnvLayer(file: FileConfig, sources: ConfigSources): { file: FileConfig; secrets: Secrets } {
  const next = deepClone(file);
  const secrets: Secrets = {};

  const provider = readEnv('LLM_PROVIDER');
  if (provider === 'ollama' || provider === 'anthropic' || provider === 'openai') {
    next.llm.provider = provider;
    setSource(sources, 'llm.provider', 'env');
  }

  const model = readEnv('LLM_MODEL');
  if (model) {
    next.llm.model = model;
    setSource(sources, 'llm.model', 'env');
  }

  const ollama = readEnv('OLLAMA_BASE_URL');
  if (ollama) {
    next.llm.ollamaBaseUrl = ollama;
    setSource(sources, 'llm.ollamaBaseUrl', 'env');
  }

  const maxSteps = readEnv('MAX_STEPS');
  if (maxSteps !== undefined) {
    const n = Number(maxSteps);
    if (!(Number.isInteger(n) && n > 0)) {
      throw new Error(`Invalid MAX_STEPS=${maxSteps} (need positive integer)`);
    }
    next.limits.maxSteps = n;
    setSource(sources, 'limits.maxSteps', 'env');
  }

  const stepTimeout = readEnv('STEP_TIMEOUT_MS');
  if (stepTimeout !== undefined) {
    const n = Number(stepTimeout);
    if (!(Number.isInteger(n) && n > 0)) {
      throw new Error(`Invalid STEP_TIMEOUT_MS=${stepTimeout} (need positive integer)`);
    }
    next.limits.stepTimeoutMs = n;
    setSource(sources, 'limits.stepTimeoutMs', 'env');
  }

  const runTimeout = readEnv('RUN_TIMEOUT_MS');
  if (runTimeout !== undefined) {
    const n = Number(runTimeout);
    if (!(Number.isInteger(n) && n > 0)) {
      throw new Error(`Invalid RUN_TIMEOUT_MS=${runTimeout} (need positive integer)`);
    }
    next.limits.runTimeoutMs = n;
    setSource(sources, 'limits.runTimeoutMs', 'env');
  }

  const anthropic = readEnv('ANTHROPIC_API_KEY');
  if (anthropic) {
    secrets.anthropicApiKey = anthropic;
    setSource(sources, 'secrets.anthropicApiKey', 'env');
  }

  const openai = readEnv('OPENAI_API_KEY');
  if (openai) {
    secrets.openaiApiKey = openai;
    setSource(sources, 'secrets.openaiApiKey', 'env');
  }

  return { file: next, secrets };
}

function applyCliLayer(
  file: FileConfig,
  sources: ConfigSources,
  cli: CliConfigOverrides,
): FileConfig {
  const next = deepClone(file);
  if (cli.provider !== undefined) {
    if (cli.provider === 'ollama' || cli.provider === 'anthropic' || cli.provider === 'openai') {
      next.llm.provider = cli.provider;
      setSource(sources, 'llm.provider', 'cli');
    } else {
      throw new Error(`Invalid --provider ${cli.provider} (use ollama | anthropic | openai)`);
    }
  }
  if (cli.model) {
    next.llm.model = cli.model;
    setSource(sources, 'llm.model', 'cli');
  }
  if (cli.ollamaUrl) {
    next.llm.ollamaBaseUrl = cli.ollamaUrl;
    setSource(sources, 'llm.ollamaBaseUrl', 'cli');
  }
  if (cli.baseUrl) {
    next.target.baseUrl = cli.baseUrl;
    setSource(sources, 'target.baseUrl', 'cli');
    try {
      const host = new URL(cli.baseUrl).hostname;
      if (host && !next.policy.allowedHosts.includes(host)) {
        next.policy.allowedHosts = [...next.policy.allowedHosts, host];
        setSource(sources, 'policy.allowedHosts', 'cli');
      }
    } catch {
      /* validateConfig will catch bad URL */
    }
  }
  if (cli.headed !== undefined) {
    next.session.headedOnEscalate = cli.headed;
    setSource(sources, 'session.headedOnEscalate', 'cli');
  }
  if (cli.maxSteps !== undefined && Number.isInteger(cli.maxSteps) && cli.maxSteps > 0) {
    next.limits.maxSteps = cli.maxSteps;
    setSource(sources, 'limits.maxSteps', 'cli');
  }
  if (cli.stepTimeoutMs !== undefined && Number.isInteger(cli.stepTimeoutMs) && cli.stepTimeoutMs > 0) {
    next.limits.stepTimeoutMs = cli.stepTimeoutMs;
    setSource(sources, 'limits.stepTimeoutMs', 'cli');
  }
  if (cli.runTimeoutMs !== undefined && Number.isInteger(cli.runTimeoutMs) && cli.runTimeoutMs > 0) {
    next.limits.runTimeoutMs = cli.runTimeoutMs;
    setSource(sources, 'limits.runTimeoutMs', 'cli');
  }
  if (cli.storageStatePath) {
    next.session.storageStatePath = cli.storageStatePath;
    setSource(sources, 'session.storageStatePath', 'cli');
  }
  return next;
}

/**
 * Merge layers into RuntimeConfig + per-key source map for `config show`.
 */
export function loadConfig(cli: CliConfigOverrides = {}): LoadedConfig {
  const root = findProjectRoot();
  const yamlPath = configYamlPath(root, cli.configPath);

  loadDotenv({ path: envFilePath(root), quiet: true });

  const sources: ConfigSources = {};
  let fileCfg = deepClone(CODE_DEFAULTS);
  markTree(sources, '', 'default', fileCfg);

  if (existsSync(yamlPath)) {
    const raw = parseYaml(readFileSync(yamlPath, 'utf8'));
    const parsed = FileConfigSchema.safeParse(raw);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      throw new Error(`Invalid config.yaml (${yamlPath}): ${detail}`);
    }
    fileCfg = applyFileLayer(fileCfg, sources, parsed.data);
  }

  // When --config points at a custom yaml, skip sibling local overlay (operator owns that file).
  if (!cli.configPath) {
    const localPath = configLocalYamlPath(root);
    if (existsSync(localPath)) {
      const raw = parseYaml(readFileSync(localPath, 'utf8'));
      const parsed = LocalOverlaySchema.safeParse(raw);
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ');
        throw new Error(`Invalid config.local.yaml (${localPath}): ${detail}`);
      }
      fileCfg = applyLocalOverlay(fileCfg, sources, parsed.data);
    }
  }

  const withEnv = applyEnvLayer(fileCfg, sources);
  const withCli = applyCliLayer(withEnv.file, sources, cli);

  const config: RuntimeConfig = {
    ...withCli,
    secrets: withEnv.secrets,
  };

  return { config, sources, root, configPath: yamlPath };
}

/**
 * Fail closed: re-validate merged shape; cloud providers need keys.
 * Reachability check for Ollama is deferred to discover (S5).
 */
export function validateConfig(loaded: LoadedConfig): string[] {
  const errors: string[] = [];
  const { config } = loaded;

  const shape = RuntimeConfigSchema.safeParse(config);
  if (!shape.success) {
    for (const i of shape.error.issues) {
      errors.push(`${i.path.join('.') || '(root)'}: ${i.message}`);
    }
    return errors;
  }

  if (config.llm.provider === 'anthropic' && !config.secrets.anthropicApiKey) {
    errors.push('llm.provider=anthropic requires ANTHROPIC_API_KEY in .env');
  }
  if (config.llm.provider === 'openai' && !config.secrets.openaiApiKey) {
    errors.push('llm.provider=openai requires OPENAI_API_KEY in .env');
  }

  for (const host of config.policy.allowedHosts) {
    if (!host.trim()) errors.push('policy.allowedHosts contains an empty host');
  }

  return errors;
}

/** Flatten config values for show (secrets redacted). */
export function flattenForShow(config: RuntimeConfig): Record<string, unknown> {
  return {
    schemaVersion: config.schemaVersion,
    'llm.provider': config.llm.provider,
    'llm.model': config.llm.model,
    'llm.ollamaBaseUrl': config.llm.ollamaBaseUrl,
    'target.name': config.target.name,
    'target.baseUrl': config.target.baseUrl,
    'target.entryPath': config.target.entryPath,
    'policy.allowedHosts': config.policy.allowedHosts,
    'policy.allowedActions': config.policy.allowedActions,
    'policy.riskyActions': config.policy.riskyActions,
    'limits.maxSteps': config.limits.maxSteps,
    'limits.stepTimeoutMs': config.limits.stepTimeoutMs,
    'limits.runTimeoutMs': config.limits.runTimeoutMs,
    'session.headedOnEscalate': config.session.headedOnEscalate,
    'session.pauseScreenshot': config.session.pauseScreenshot,
    'session.storageStatePath': config.session.storageStatePath ?? '',
    'evidence.dir': config.evidence.dir,
    'evidence.redactSensitiveOutputs': config.evidence.redactSensitiveOutputs,
    'secrets.anthropicApiKey': config.secrets.anthropicApiKey ? '[set]' : '[unset]',
    'secrets.openaiApiKey': config.secrets.openaiApiKey ? '[set]' : '[unset]',
  };
}
