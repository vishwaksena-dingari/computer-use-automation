/**
 * @file Hybrid craft-answer factory — one budgeted closure per fill arm (T-F-4 / S1).
 */
import type { RuntimeConfig } from '../config/schema.js';
import { getProfilePath } from './profile.js';
import { callModel } from '../llm/call-model.js';
import type { FillFormMode } from './fill-form.js';

export type CraftFn = (args: {
  fieldKey: string;
  profilePath: string;
  companyContext?: string;
}) => Promise<{ value: string | null; llmCalls: number }>;

/** Redacted profile snippet for craft prompts (no secrets). */
export function buildCraftProfileBlurb(
  profile: Record<string, unknown>,
  profileKeys: string[],
): string {
  const skip = /password|secret|token|ssn|cvv/i;
  const bits: string[] = [];
  for (const k of profileKeys.slice(0, 40)) {
    if (skip.test(k)) continue;
    const v = getProfilePath(profile, k);
    if (v === undefined || v === null || v === '') continue;
    const s = String(v);
    if (s.length > 120) continue;
    bits.push(`${k}=${s}`);
  }
  return bits.join('; ').slice(0, 800);
}

/**
 * Factory: one craft budget per instance (call once per fillForm / fillFormFlow arm).
 * Returns undefined unless mode is hybrid.
 */
export function makeCraftAnswer(opts: {
  config: RuntimeConfig;
  mode: FillFormMode;
  profile: Record<string, unknown>;
  profileKeys: string[];
  /** Cap before hard max 5 (typically formRepairMax). */
  budget: number;
  timeoutMs: number;
}): CraftFn | undefined {
  if (opts.mode !== 'hybrid') return undefined;
  let craftBudget = Math.min(5, Math.max(0, opts.budget));
  const profileBlurb = buildCraftProfileBlurb(opts.profile, opts.profileKeys);
  const { config, timeoutMs } = opts;

  return async ({ fieldKey, profilePath, companyContext }) => {
    if (craftBudget <= 0) return { value: null, llmCalls: 0 };
    craftBudget -= 1;
    const system =
      'You fill job-application questions from the applicant profile. Reply with the answer text only — short, truthful, no preamble.';
    const user = `Field "${fieldKey}" (${profilePath}). Company: ${companyContext ?? 'n/a'}. Profile: ${profileBlurb || 'n/a'}.`;
    const reply = await callModel(config, system, user, {
      json: false,
      timeoutMs,
    });
    if (!reply.ok) return { value: null, llmCalls: 1 };
    const value = (reply.text || '').trim() || null;
    return { value, llmCalls: 1 };
  };
}

export function selfCheckMakeCraftAnswer(): void {
  const cfg = {
    llm: { provider: 'openai' as const, model: 'x', ollamaBaseUrl: 'http://127.0.0.1:11434' },
    secrets: {},
  } as unknown as RuntimeConfig;
  const none = makeCraftAnswer({
    config: cfg,
    mode: 'deterministic',
    profile: {},
    profileKeys: [],
    budget: 3,
    timeoutMs: 1000,
  });
  if (none !== undefined) throw new Error('deterministic must not craft');

  const craft = makeCraftAnswer({
    config: cfg,
    mode: 'hybrid',
    profile: { fullName: 'Alex' },
    profileKeys: ['fullName'],
    budget: 2,
    timeoutMs: 1000,
  });
  if (!craft) throw new Error('hybrid must craft');
}

if (process.argv[1]?.endsWith('craft-answer.ts') || process.argv[1]?.endsWith('craft-answer.js')) {
  selfCheckMakeCraftAnswer();
  console.log('craft-answer self-check ok');
}
