/**
 * @file Zod schema + code defaults for RuntimeConfig (config.yaml shape + env secrets).
 */
import { z } from 'zod';

export const LlmProviderSchema = z.enum(['ollama', 'anthropic', 'openai']);

export const FileConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    llm: z.object({
      provider: LlmProviderSchema,
      model: z.string().min(1),
      ollamaBaseUrl: z.string().url(),
    }),
    target: z.object({
      name: z.string().min(1),
      baseUrl: z.string().url(),
      entryPath: z.string().min(1),
    }),
    policy: z.object({
      allowedHosts: z.array(z.string().min(1)).min(1),
      allowedActions: z.array(z.string().min(1)).min(1),
      riskyActions: z.array(z.string().min(1)),
    }),
    limits: z.object({
      maxSteps: z.number().int().positive(),
      stepTimeoutMs: z.number().int().positive(),
      runTimeoutMs: z.number().int().positive(),
    }),
    session: z.object({
      headedOnEscalate: z.boolean(),
      pauseScreenshot: z.boolean(),
      /** Optional Playwright storageState JSON path (login-once across runs). */
      storageStatePath: z.string().min(1).optional(),
    }),
    evidence: z.object({
      dir: z.string().min(1),
      redactSensitiveOutputs: z.boolean(),
      har: z
        .object({
          content: z.enum(['omit', 'embed']).default('omit'),
          mode: z.enum(['full', 'minimal']).default('minimal'),
        })
        .optional(),
    }),
  })
  .strict();

export type FileConfig = z.infer<typeof FileConfigSchema>;

/** Secrets never appear in config.yaml; only env. */
export const SecretsSchema = z.object({
  anthropicApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
});

export type Secrets = z.infer<typeof SecretsSchema>;

export const RuntimeConfigSchema = FileConfigSchema.extend({
  secrets: SecretsSchema,
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export type ConfigLayer = 'cli' | 'env' | 'file' | 'local' | 'default';

/** Partial overlay for gitignored `config.local.yaml` (P1). */
export const LocalOverlaySchema = z
  .object({
    schemaVersion: z.literal(1).optional(),
    llm: FileConfigSchema.shape.llm.partial().optional(),
    target: FileConfigSchema.shape.target.partial().optional(),
    policy: z
      .object({
        allowedHosts: z.array(z.string().min(1)).min(1).optional(),
        allowedActions: z.array(z.string().min(1)).min(1).optional(),
        riskyActions: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
    limits: FileConfigSchema.shape.limits.partial().optional(),
    session: FileConfigSchema.shape.session.partial().optional(),
    evidence: FileConfigSchema.shape.evidence.partial().optional(),
  })
  .strict();

export type LocalOverlay = z.infer<typeof LocalOverlaySchema>;

/** Per-key winning layer for `config show`. */
export type ConfigSources = Record<string, ConfigLayer>;

export const CODE_DEFAULTS: FileConfig = {
  schemaVersion: 1,
  llm: {
    provider: 'ollama',
    model: 'qwen3.5:9b',
    ollamaBaseUrl: 'http://127.0.0.1:11434',
  },
  target: {
    name: 'mock-core',
    baseUrl: 'http://127.0.0.1:4173',
    entryPath: '/member-lookup/',
  },
  policy: {
    allowedHosts: ['127.0.0.1', 'localhost'],
    allowedActions: ['navigate', 'click', 'fill', 'fillForm', 'fillFormFlow', 'extract', 'wait', 'branch'],
    riskyActions: ['submit_irreversible', 'transfer_funds'],
  },
  limits: {
    maxSteps: 40,
    stepTimeoutMs: 15_000,
    runTimeoutMs: 300_000,
  },
  session: {
    headedOnEscalate: true,
    pauseScreenshot: true,
  },
  evidence: {
    dir: 'evidence',
    redactSensitiveOutputs: true,
  },
};

/** Dotted paths `config set` must refuse (secrets / env-only). */
export const SECRET_SET_PATHS = new Set([
  'secrets',
  'secrets.anthropicApiKey',
  'secrets.openaiApiKey',
  'anthropicApiKey',
  'openaiApiKey',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
]);

export function isSecretSetPath(path: string): boolean {
  const p = path.trim();
  if (SECRET_SET_PATHS.has(p)) return true;
  if (/api[_-]?key/i.test(p)) return true;
  return false;
}
