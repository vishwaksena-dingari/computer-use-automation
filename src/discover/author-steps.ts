/**
 * @file G2 — Zod-capped step-graph emit (opt-in --author-steps).
 * LLM may propose steps+targets only; CapabilitySchema still fail-closes.
 */
import { z } from 'zod';
import type { Page } from 'playwright';
import {
  StepSchema,
  TargetSchema,
  CheckpointSchema,
  type Capability,
} from '../artifact/schema.js';
import { parseCapability } from '../artifact/load.js';
import type { RuntimeConfig } from '../config/schema.js';
import { observeControls } from '../surface/observe-controls.js';
import { log } from '../util/log.js';

const EmitStepsSchema = z
  .object({
    steps: z.array(StepSchema).min(1).max(40),
    targets: z.record(TargetSchema),
    checkpoints: z.record(CheckpointSchema).optional(),
    successCheckpoint: z.string().min(1).optional(),
    inputs: z
      .array(
        z.object({
          name: z.string().min(1),
          type: z.enum(['string', 'number', 'boolean']),
          required: z.boolean(),
          sensitive: z.boolean(),
        }),
      )
      .optional(),
    outputs: z
      .array(
        z.object({
          name: z.string().min(1),
          type: z.enum(['string', 'number', 'boolean']),
          sensitive: z.boolean(),
        }),
      )
      .optional(),
    businessOutcomes: z
      .array(z.object({ code: z.string().min(1), description: z.string().min(1) }))
      .optional(),
  })
  .strict();

const SYSTEM_AUTHOR = `Return ONLY JSON with this EXACT shape (example):
{"steps":[{"id":"s1","action":"navigate","urlFrom":"config.target.entryPath"},{"id":"s2","action":"fill","target":{"$ref":"#/targets/memberIdField"},"valueFrom":"inputs.memberId"},{"id":"s3","action":"click","target":{"$ref":"#/targets/searchButton"}},{"id":"s4","action":"wait","timeoutMs":800},{"id":"s5","action":"branch","on":[{"when":{"checkpoint":"notFoundBanner"},"outcome":"member.NOT_FOUND"},{"when":{"checkpoint":"memberDetail"},"next":"s6"}]},{"id":"s6","action":"extract","target":{"$ref":"#/targets/savingsBalanceValue"},"output":"savingsBalance"}],"targets":{"memberIdField":{"strict":true,"timeoutMs":10000,"candidates":[{"kind":"label","rank":1,"name":"Member ID"}]},"searchButton":{"strict":true,"timeoutMs":10000,"candidates":[{"kind":"role","rank":1,"role":"button","name":"Search"}]},"savingsBalanceValue":{"strict":true,"timeoutMs":10000,"candidates":[{"kind":"css","rank":1,"selector":"[data-field='savingsBalance']"}]},"notFoundBanner":{"strict":true,"timeoutMs":5000,"candidates":[{"kind":"role","rank":1,"role":"alert"}]}},"checkpoints":{"memberDetail":{"kind":"visible","target":{"$ref":"#/targets/savingsBalanceValue"}},"notFoundBanner":{"kind":"visible","target":{"$ref":"#/targets/notFoundBanner"}},"success":{"kind":"allOf","refs":["memberDetail"]}},"successCheckpoint":"success","inputs":[{"name":"memberId","type":"string","required":true,"sensitive":false}],"outputs":[{"name":"savingsBalance","type":"string","sensitive":false}],"businessOutcomes":[{"code":"member.NOT_FOUND","description":"No member matches"}]}

Rules: action must be navigate|fill|click|extract|wait|branch|fillForm|fillFormFlow only. For job/apply/ATS/multipage forms PREFER navigate→wait→fillFormFlow (field maps authored dynamically at runtime) — do NOT emit a long fixed click/fill chain per input. Single-page simple forms may use fillForm once. Every $ref target key must exist. Adapt locators to the observation. No markdown.`;

function looksLikeApplyGoal(goal: string): boolean {
  return /apply|application|\bats\b|career|job form|workday|ashby|lever|greenhouse|multipart|multipage/i.test(
    goal,
  );
}

/**
 * Zero-LLM ATS shell: tiny fixed outer steps; per-page field maps stay dynamic via fillFormFlow.
 */
export function authorAtsApplyShell(opts: {
  goal: string;
  mapId?: string;
  family?: string;
}): Capability {
  const family = opts.family && opts.family !== 'unknown' ? opts.family : 'apply';
  const mapId = opts.mapId ?? `auto-${family}`;
  const id = `authored-${family}-apply`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 64);
  return parseCapability({
    schemaVersion: 1,
    id,
    version: '0.1.0',
    surface: 'web',
    name: `ATS apply shell (${family})`,
    description: `Dynamic fillFormFlow shell for: ${opts.goal.slice(0, 120)}`,
    goalTemplate: opts.goal,
    template: 'ats-apply-shell',
    bindings: {},
    inputs: [],
    outputs: [],
    businessOutcomes: [
      { code: 'field.UNMAPPED', description: 'Required form field missing or profile gap' },
    ],
    steps: [
      { id: 's1', action: 'navigate', urlFrom: 'config.target.entryPath' },
      { id: 's2', action: 'wait', timeoutMs: 2500 },
      { id: 's3', action: 'fillFormFlow', fieldMapRef: mapId, maxPages: 8 },
    ],
    targets: {},
    checkpoints: {
      done: { kind: 'url', includes: '/' },
      success: { kind: 'allOf', refs: ['done'] },
    },
    successCheckpoint: 'success',
  });
}

function normalizeAuthoredRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const o = { ...(raw as Record<string, unknown>) };
  if (Array.isArray(o.steps)) {
    o.steps = o.steps.map((s, i) => {
      if (!s || typeof s !== 'object') return s;
      const step = { ...(s as Record<string, unknown>) };
      if (!step.id) step.id = `s${i + 1}`;
      const act = String(step.action ?? step.type ?? '').toLowerCase();
      const actionMap: Record<string, string> = {
        navigate: 'navigate',
        goto: 'navigate',
        open: 'navigate',
        fill: 'fill',
        type: 'fill',
        input: 'fill',
        click: 'click',
        press: 'click',
        extract: 'extract',
        read: 'extract',
        wait: 'wait',
        branch: 'branch',
        fillform: 'fillForm',
        fill_form: 'fillForm',
        fillformflow: 'fillFormFlow',
        fill_form_flow: 'fillFormFlow',
        fill_formflow: 'fillFormFlow',
      };
      if (actionMap[act]) step.action = actionMap[act];
      if (step.url && !step.urlFrom) {
        step.urlFrom = String(step.url).includes('http')
          ? String(step.url)
          : 'config.target.entryPath';
        delete step.url;
      }
      if (typeof step.target === 'string') {
        const key = step.target.replace(/^#\/targets\//, '').replace(/^#/, '');
        step.target = { $ref: `#/targets/${key}` };
      }
      return step;
    });
  }
  if (o.targets && typeof o.targets === 'object') {
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o.targets as Record<string, unknown>)) {
      const key = k.replace(/^#\/targets\//, '').replace(/^#/, '');
      if (!v || typeof v !== 'object') continue;
      const t = v as Record<string, unknown>;
      if (Array.isArray(t.candidates)) {
        next[key] = {
          strict: t.strict ?? true,
          timeoutMs: t.timeoutMs ?? 10000,
          candidates: t.candidates,
        };
      } else {
        const candidates = [];
        if (t.label || t.name)
          candidates.push({
            kind: 'label',
            rank: 1,
            name: String(t.label ?? t.name),
          });
        if (t.css || t.selector)
          candidates.push({
            kind: 'css',
            rank: candidates.length + 1,
            selector: String(t.css ?? t.selector),
          });
        if (t.role)
          candidates.push({
            kind: 'role',
            rank: candidates.length + 1,
            role: String(t.role),
            name: t.text ? String(t.text) : undefined,
          });
        if (!candidates.length && t.text)
          candidates.push({ kind: 'text', rank: 1, text: String(t.text) });
        if (candidates.length) {
          next[key] = { strict: true, timeoutMs: 10000, candidates };
        }
      }
    }
    o.targets = next;
  }
  if (Array.isArray(o.inputs)) {
    o.inputs = o.inputs
      .map((inp) => {
        if (!inp || typeof inp !== 'object') return null;
        const x = inp as Record<string, unknown>;
        const name = String(x.name ?? x.id ?? '');
        if (!name || name === 'submit') return null;
        const type = ['string', 'number', 'boolean'].includes(String(x.type))
          ? String(x.type)
          : 'string';
        return {
          name,
          type,
          required: x.required !== false,
          sensitive: Boolean(x.sensitive),
        };
      })
      .filter(Boolean);
  }
  if (Array.isArray(o.outputs)) {
    o.outputs = o.outputs
      .map((out) => {
        if (!out || typeof out !== 'object') return null;
        const x = out as Record<string, unknown>;
        const name = String(x.name ?? x.id ?? '');
        if (!name) return null;
        return {
          name,
          type: 'string',
          sensitive: Boolean(x.sensitive),
        };
      })
      .filter(Boolean);
  }
  if (Array.isArray(o.businessOutcomes)) {
    o.businessOutcomes = o.businessOutcomes.map((b) => {
      if (typeof b === 'string') return { code: b, description: b };
      return b;
    });
  }
  return o;
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error('LLM reply was not valid JSON');
  }
}

async function callOllamaJson(
  config: RuntimeConfig,
  system: string,
  user: string,
): Promise<{ text: string; ok: boolean }> {
  if (config.llm.provider !== 'ollama') return { text: 'non-ollama', ok: false };
  const url = `${config.llm.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.llm.model,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) return { text: `HTTP ${res.status}`, ok: false };
    const body = (await res.json()) as { message?: { content?: string } };
    return { text: body.message?.content ?? '', ok: true };
  } catch (e) {
    return { text: (e as Error).message, ok: false };
  }
}

function parseEmitSteps(raw: unknown): z.infer<typeof EmitStepsSchema> {
  const normalized = normalizeAuthoredRaw(raw);
  const parsed = EmitStepsSchema.safeParse(normalized);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid authored steps: ${detail}`);
  }
  const max = 40;
  if (parsed.data.steps.length > max) {
    throw new Error(`too many steps: ${parsed.data.steps.length} > ${max}`);
  }
  return parsed.data;
}

/** Build a Capability from authored emit + code defaults. */
export function compileAuthoredCapability(
  goal: string,
  emit: z.infer<typeof EmitStepsSchema>,
): Capability {
  const id = 'authored-capability';
  const firstTarget = Object.keys(emit.targets)[0] ?? 'body';
  const targets = { ...emit.targets };
  if (!targets[firstTarget]) {
    targets[firstTarget] = {
      strict: false,
      timeoutMs: 8000,
      candidates: [{ kind: 'css', rank: 1, selector: 'body' }],
    };
  }
  const checkpoints = { ...(emit.checkpoints ?? {}) };
  if (!emit.successCheckpoint || !checkpoints[emit.successCheckpoint]) {
    checkpoints.done = {
      kind: 'visible' as const,
      target: { $ref: `#/targets/${firstTarget}` },
    };
    checkpoints.success = { kind: 'allOf' as const, refs: ['done'] };
  }
  return parseCapability({
    schemaVersion: 1,
    id,
    version: '0.1.0',
    surface: 'web',
    name: `Authored: ${goal.slice(0, 60)}`,
    description: `G2 authored step-graph for: ${goal}`,
    goalTemplate: goal,
    template: 'authored',
    bindings: {},
    inputs: emit.inputs ?? [
      { name: 'memberId', type: 'string', required: true, sensitive: false },
    ],
    outputs: emit.outputs ?? [
      { name: 'savingsBalance', type: 'string', sensitive: false },
    ],
    businessOutcomes: emit.businessOutcomes ?? [
      { code: 'member.NOT_FOUND', description: 'No member matches the given ID' },
    ],
    steps: emit.steps,
    targets,
    checkpoints,
    successCheckpoint: emit.successCheckpoint && checkpoints[emit.successCheckpoint]
      ? emit.successCheckpoint
      : 'success',
  });
}

export type AuthorStepsResult = {
  capability: Capability;
  llmCalls: number;
  note: string;
  emit: z.infer<typeof EmitStepsSchema>;
};

/**
 * Observe page + one (or two) LLM calls to emit a Zod-capped step graph.
 * Apply/ATS goals short-circuit to a dynamic fillFormFlow shell (0 LLM) when detectable.
 */
export async function authorStepsFromPage(opts: {
  page: Page;
  goal: string;
  config: RuntimeConfig;
}): Promise<AuthorStepsResult> {
  const { page, goal, config } = opts;
  const pageText = (await page.locator('body').innerText()).slice(0, 1800);
  const controls = await observeControls(page);

  if (looksLikeApplyGoal(goal)) {
    const { detectAtsFamily } = await import('../surface/detect-ats.js');
    const family = detectAtsFamily(page.url(), pageText);
    if (
      family !== 'unknown' ||
      /apply|application|required field|resume|how did you hear/i.test(pageText)
    ) {
      const capability = authorAtsApplyShell({ goal, family });
      log('info', 'author-steps ats shell (dynamic fillFormFlow)', { family, llmCalls: 0 });
      return {
        capability,
        llmCalls: 0,
        note: 'ats_apply_shell_heuristic',
        emit: {
          steps: capability.steps,
          targets: capability.targets,
          checkpoints: capability.checkpoints,
          successCheckpoint: capability.successCheckpoint,
          inputs: capability.inputs,
          outputs: capability.outputs,
          businessOutcomes: capability.businessOutcomes,
        },
      };
    }
  }

  const observation = { goal, pageText, controls };
  const user = `Author a minimal web automation step graph for this goal from observation:\n${JSON.stringify(observation)}`;

  let llmCalls = 0;
  const reply = await callOllamaJson(config, SYSTEM_AUTHOR, user);
  if (!reply.ok) throw new Error(`G2 author-steps LLM failed: ${reply.text}`);
  llmCalls = 1;
  let emit: z.infer<typeof EmitStepsSchema>;
  try {
    emit = parseEmitSteps(extractJsonObject(reply.text));
  } catch (e) {
    const err = (e as Error).message;
    log('warn', 'author-steps zod failed; repairing', { detail: err.slice(0, 200) });
    const repair = await callOllamaJson(
      config,
      SYSTEM_AUTHOR,
      `Previous JSON failed validation: ${err}\nObservation:\n${JSON.stringify(observation)}\nEmit corrected JSON only.`,
    );
    llmCalls = 2;
    if (!repair.ok) throw new Error(`G2 author-steps repair failed: ${repair.text}`);
    emit = parseEmitSteps(extractJsonObject(repair.text));
  }

  // Ensure success checkpoint exists
  if (!emit.checkpoints || !emit.successCheckpoint || !emit.checkpoints[emit.successCheckpoint]) {
    const firstTarget = Object.keys(emit.targets)[0];
    if (firstTarget) {
      emit = {
        ...emit,
        checkpoints: {
          ...(emit.checkpoints ?? {}),
          done: { kind: 'visible', target: { $ref: `#/targets/${firstTarget}` } },
          success: { kind: 'allOf', refs: ['done'] },
        },
        successCheckpoint: 'success',
      };
    }
  }

  // Canonicalize common LLM param naming (member_id → memberId)
  emit = {
    ...emit,
    steps: emit.steps.map((step) => {
      if (step.action === 'fill' && 'valueFrom' in step) {
        return {
          ...step,
          valueFrom: String(step.valueFrom)
            .replace(/\binputs\.member_id\b/g, 'inputs.memberId')
            .replace(/\binputs\.memberID\b/g, 'inputs.memberId'),
        };
      }
      return step;
    }),
    inputs: (emit.inputs ?? []).map((inp) =>
      inp.name === 'member_id' || inp.name === 'memberID'
        ? { ...inp, name: 'memberId' }
        : inp,
    ),
  };

  const capability = compileAuthoredCapability(goal, emit);
  return { capability, llmCalls, note: 'authored_steps', emit };
}
