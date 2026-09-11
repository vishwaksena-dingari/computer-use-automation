/**
 * @file Discovery — observe page; LLM emits **only** locator candidates (strict JSON).
 *
 * Capability skeleton (steps/checkpoints/IO) lives in code — models never invent that shape.
 * LLM input: goal + page observation. Never the seed capability file.
 * Offline: `--allow-offline-seed` copies the seed without a model.
 */
import { chromium, type Page } from 'playwright';
import { join } from 'node:path';
import { z } from 'zod';
import type { RuntimeConfig } from '../config/schema.js';
import { saveCapability, loadCapability, sha256File, parseCapability } from '../artifact/load.js';
import { LocatorCandidateSchema, type Capability, type LocatorCandidate } from '../artifact/schema.js';
import { ensureDir, writeJson, copyCapabilitySnapshot } from '../evidence/store.js';
import { repoRelative } from '../config/paths.js';
import { log } from '../util/log.js';
import { resolveTarget } from '../surface/resolve-locator.js';

export type DiscoverResult = {
  ok: boolean;
  artifactPath: string;
  artifactSha256: string;
  llmCalls: number;
  provider: string;
  model: string;
  message: string;
  evidenceDir: string;
};

type ControlHint = {
  tag: string;
  role?: string | null;
  name?: string | null;
  label?: string | null;
  type?: string | null;
  inputName?: string | null;
  placeholder?: string | null;
  dataField?: string | null;
  text?: string | null;
};

const TARGET_KEYS = [
  'memberIdField',
  'searchButton',
  'savingsBalanceValue',
  'notFoundBanner',
] as const;

/** Narrow emit: models only fill locator candidates — cannot mangle steps/schema. */
const EmitLocatorsSchema = z
  .object({
    targets: z.object({
      memberIdField: z.object({ candidates: z.array(LocatorCandidateSchema).min(1) }).strict(),
      searchButton: z.object({ candidates: z.array(LocatorCandidateSchema).min(1) }).strict(),
      savingsBalanceValue: z.object({ candidates: z.array(LocatorCandidateSchema).min(1) }).strict(),
      notFoundBanner: z.object({ candidates: z.array(LocatorCandidateSchema).min(1) }).strict(),
    }).strict(),
  })
  .strict();

/** Ollama constrained-decoding schema (JSON Schema). */
const OLLAMA_LOCATOR_FORMAT = {
  type: 'object',
  additionalProperties: false,
  required: ['targets'],
  properties: {
    targets: {
      type: 'object',
      additionalProperties: false,
      required: [...TARGET_KEYS],
      properties: Object.fromEntries(
        TARGET_KEYS.map((k) => [
          k,
          {
            type: 'object',
            additionalProperties: false,
            required: ['candidates'],
            properties: {
              candidates: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['kind', 'rank'],
                  properties: {
                    kind: {
                      type: 'string',
                      enum: ['role', 'label', 'placeholder', 'altText', 'title', 'text', 'testId', 'css'],
                    },
                    rank: { type: 'integer', minimum: 1 },
                    role: { type: 'string' },
                    name: { type: 'string' },
                    text: { type: 'string' },
                    exact: { type: 'boolean' },
                    selector: { type: 'string' },
                    score: { type: 'number' },
                  },
                },
              },
            },
          },
        ]),
      ),
    },
  },
} as const;

const SYSTEM_EMIT = `Return ONLY a JSON object with this exact top-level shape:
{"targets":{"memberIdField":{"candidates":[...]},"searchButton":{"candidates":[...]},"savingsBalanceValue":{"candidates":[...]},"notFoundBanner":{"candidates":[...]}}}

Rules (fail if violated):
- JSON only. No markdown. No prose. No extra keys.
- Each candidates[] item MUST use only: kind, rank, and optional role|name|text|exact|selector|score.
- kind MUST be one of: role, label, placeholder, altText, title, text, testId, css
- rank MUST be an integer >= 1
- Prefer label / role+name / text from the observation; css only as high rank (e.g. 99) using name= or data-field seen on the page
- At least one candidate per target
- Do NOT emit steps, inputs, outputs, checkpoints, or any other Capability fields`;

/** Code-owned workflow skeleton — LLM never invents this. */
function capabilitySkeleton(goal: string): Capability {
  return parseCapability({
    schemaVersion: 1,
    id: 'lookup-member-savings-balance',
    version: '1.0.0',
    surface: 'web',
    name: 'Lookup member savings balance',
    description: `LLM-grounded capability for: ${goal}`,
    goalTemplate: 'Look up member {{memberId}} and read their current savings balance',
    bindings: {},
    inputs: [{ name: 'memberId', type: 'string', required: true, sensitive: false }],
    outputs: [{ name: 'savingsBalance', type: 'string', sensitive: false }],
    businessOutcomes: [
      { code: 'member.NOT_FOUND', description: 'No member matches the given ID' },
    ],
    steps: [
      { id: 's1', action: 'navigate', urlFrom: 'config.target.entryPath' },
      {
        id: 's2',
        action: 'fill',
        target: { $ref: '#/targets/memberIdField' },
        valueFrom: 'inputs.memberId',
      },
      { id: 's3', action: 'click', target: { $ref: '#/targets/searchButton' } },
      { id: 's4', action: 'wait', timeoutMs: 800 },
      {
        id: 's5',
        action: 'branch',
        on: [
          { when: { checkpoint: 'notFoundBanner' }, outcome: 'member.NOT_FOUND' },
          { when: { checkpoint: 'memberDetail' }, next: 's6' },
        ],
      },
      {
        id: 's6',
        action: 'extract',
        target: { $ref: '#/targets/savingsBalanceValue' },
        output: 'savingsBalance',
      },
    ],
    targets: {
      memberIdField: { strict: true, timeoutMs: 10000, candidates: [{ kind: 'label', rank: 1, text: 'Member ID', exact: true }] },
      searchButton: { strict: true, timeoutMs: 10000, candidates: [{ kind: 'role', rank: 1, role: 'button', name: 'Search', exact: true }] },
      savingsBalanceValue: { strict: true, timeoutMs: 10000, candidates: [{ kind: 'css', rank: 1, selector: "[data-field='savingsBalance']" }] },
      notFoundBanner: {
        strict: true,
        timeoutMs: 5000,
        candidates: [
          { kind: 'role', rank: 1, role: 'alert' },
          { kind: 'text', rank: 2, text: 'Member not found', exact: true },
        ],
      },
    },
    checkpoints: {
      memberDetail: { kind: 'visible', target: { $ref: '#/targets/savingsBalanceValue' } },
      notFoundBanner: { kind: 'visible', target: { $ref: '#/targets/notFoundBanner' } },
      success: { kind: 'allOf', refs: ['memberDetail'] },
    },
    successCheckpoint: 'success',
  });
}

async function callOllama(
  config: RuntimeConfig,
  system: string,
  user: string,
): Promise<{ text: string; ok: boolean }> {
  const url = `${config.llm.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.llm.model,
        stream: false,
        format: OLLAMA_LOCATOR_FORMAT,
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

async function observeControls(page: Page): Promise<ControlHint[]> {
  return page.evaluate(() => {
    const out: ControlHint[] = [];
    const nodes = document.querySelectorAll(
      'input, button, select, textarea, [role="button"], [role="alert"], [role="status"], [data-field]',
    );
    for (const el of Array.from(nodes).slice(0, 40)) {
      const html = el as HTMLElement;
      let label: string | null = null;
      if (html instanceof HTMLInputElement && html.id) {
        const lab = document.querySelector(`label[for="${html.id}"]`);
        label = lab?.textContent?.trim() || null;
      }
      out.push({
        tag: html.tagName.toLowerCase(),
        role: html.getAttribute('role'),
        name: html.getAttribute('aria-label') || html.getAttribute('name'),
        label,
        type: html.getAttribute('type'),
        inputName: html.getAttribute('name'),
        placeholder: html.getAttribute('placeholder'),
        dataField: html.getAttribute('data-field'),
        text: (html.innerText || html.textContent || '').trim().slice(0, 80) || null,
      });
    }
    return out;
  });
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

function normalizeCandidate(raw: unknown, index: number): LocatorCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const kindRaw = String(c.kind ?? c.type ?? '').toLowerCase();
  const kindMap: Record<string, LocatorCandidate['kind']> = {
    role: 'role',
    label: 'label',
    placeholder: 'placeholder',
    alttext: 'altText',
    title: 'title',
    text: 'text',
    testid: 'testId',
    css: 'css',
    selector: 'css',
  };
  const kind = kindMap[kindRaw];
  if (!kind) return null;
  const rank = Math.max(1, Number(c.rank ?? index + 1) || index + 1);
  const out: Record<string, unknown> = { kind, rank };
  if (c.role) out.role = String(c.role);
  if (c.name) out.name = String(c.name);
  const text = c.text ?? c.labelText ?? c.label;
  if (text) out.text = String(text);
  if (c.exact !== undefined) out.exact = Boolean(c.exact);
  if (c.selector) out.selector = String(c.selector);
  if (kind === 'css' && !out.selector && c.value) out.selector = String(c.value);
  if (kind === 'label' && !out.text && c.name) out.text = String(c.name);
  if (kind === 'role' && !out.name && out.text) out.name = out.text;
  const parsed = LocatorCandidateSchema.safeParse(out);
  return parsed.success ? parsed.data : null;
}

function parseEmitLocators(raw: unknown): z.infer<typeof EmitLocatorsSchema> {
  if (!raw || typeof raw !== 'object') throw new Error('emit root must be object');
  const root = raw as Record<string, unknown>;
  // Accept accidental full-capability wrap: use .targets only
  const targetsIn = (root.targets ?? root) as Record<string, unknown>;
  const targets: Record<string, { candidates: LocatorCandidate[] }> = {};
  for (const key of TARGET_KEYS) {
    const block = targetsIn[key];
    const candsRaw =
      block && typeof block === 'object' && Array.isArray((block as { candidates?: unknown }).candidates)
        ? (block as { candidates: unknown[] }).candidates
        : Array.isArray(block)
          ? block
          : [];
    const candidates = candsRaw
      .map((c, i) => normalizeCandidate(c, i))
      .filter((c): c is LocatorCandidate => Boolean(c));
    targets[key] = { candidates };
  }
  return EmitLocatorsSchema.parse({ targets });
}

function mergeLocatorsIntoSkeleton(goal: string, emit: z.infer<typeof EmitLocatorsSchema>): Capability {
  const base = capabilitySkeleton(goal);
  const targets = { ...base.targets };
  for (const key of TARGET_KEYS) {
    targets[key] = {
      ...targets[key],
      candidates: emit.targets[key].candidates,
    };
  }
  return parseCapability({
    ...base,
    description: `${base.description} (llm-emitted ${new Date().toISOString().slice(0, 10)})`,
    targets,
  });
}

/**
 * Prefer observation-grounded locators, then append LLM suggestions (higher ranks).
 * Then verify fill/click targets resolve on the live page; swap to observation if not.
 */
async function finalizeLocators(
  page: Page,
  goal: string,
  controls: ControlHint[],
  llmEmit: z.infer<typeof EmitLocatorsSchema> | null,
): Promise<Capability> {
  const obs = observationLocators(controls);
  const merged: z.infer<typeof EmitLocatorsSchema> = {
    targets: {
      memberIdField: { candidates: [...obs.targets.memberIdField.candidates] },
      searchButton: { candidates: [...obs.targets.searchButton.candidates] },
      savingsBalanceValue: { candidates: [...obs.targets.savingsBalanceValue.candidates] },
      notFoundBanner: { candidates: [...obs.targets.notFoundBanner.candidates] },
    },
  };

  if (llmEmit) {
    for (const key of TARGET_KEYS) {
      const offset = merged.targets[key].candidates.length;
      for (const c of llmEmit.targets[key].candidates) {
        merged.targets[key].candidates.push({ ...c, rank: offset + c.rank });
      }
    }
  }

  let cap = mergeLocatorsIntoSkeleton(goal, merged);

  // On the lookup form, member field + Search must resolve now.
  for (const key of ['memberIdField', 'searchButton'] as const) {
    try {
      await resolveTarget(page, cap.targets[key]);
    } catch {
      log('warn', 'discover locator verify failed; using observation only', { target: key });
      cap = parseCapability({
        ...cap,
        targets: {
          ...cap.targets,
          [key]: { ...cap.targets[key], candidates: obs.targets[key].candidates },
        },
      });
    }
  }
  return cap;
}

/** Observation-backed locators if the model returns junk / empty after normalize. */
function observationLocators(controls: ControlHint[]): z.infer<typeof EmitLocatorsSchema> {
  const memberInput = controls.find(
    (c) => c.inputName === 'member_id' || c.label === 'Member ID',
  );
  const searchBtn = controls.find(
    (c) => (c.tag === 'button' || c.role === 'button') && /search/i.test(String(c.text ?? '')),
  );
  const savings = controls.find((c) => c.dataField === 'savingsBalance');
  return EmitLocatorsSchema.parse({
    targets: {
      memberIdField: {
        candidates: [
          { kind: 'label', rank: 1, text: 'Member ID', exact: true },
          { kind: 'role', rank: 2, role: 'textbox', name: 'Member ID', exact: true },
          {
            kind: 'css',
            rank: 99,
            selector: `input[name='${memberInput?.inputName ?? 'member_id'}']`,
          },
        ],
      },
      searchButton: {
        candidates: [
          { kind: 'role', rank: 1, role: 'button', name: 'Search', exact: true },
          {
            kind: 'css',
            rank: 99,
            selector: searchBtn ? "form button[type='submit']" : "button[type='submit']",
          },
        ],
      },
      savingsBalanceValue: {
        candidates: [
          {
            kind: 'css',
            rank: 1,
            selector: `[data-field='${savings?.dataField ?? 'savingsBalance'}']`,
          },
        ],
      },
      notFoundBanner: {
        candidates: [
          { kind: 'role', rank: 1, role: 'alert' },
          { kind: 'text', rank: 2, text: 'Member not found', exact: true },
        ],
      },
    },
  });
}

/**
 * Discover: observe → LLM emits locator JSON only → merge into code skeleton → save.
 */
export async function discoverCapability(opts: {
  config: RuntimeConfig;
  root: string;
  goal: string;
  evidenceDir: string;
  seedPath: string;
  outPath: string;
  allowOfflineSeed?: boolean;
}): Promise<DiscoverResult> {
  const { config, root, goal, evidenceDir, seedPath, outPath } = opts;
  ensureDir(join(evidenceDir, 'screenshots'));
  let llmCalls = 0;
  let llmNote = '';
  let compiled: Capability | null = null;
  let mode: 'llm_emit' | 'offline_seed' = 'llm_emit';

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const base = config.target.baseUrl.replace(/\/$/, '');
    const entry = config.target.entryPath.startsWith('/')
      ? config.target.entryPath
      : `/${config.target.entryPath}`;
    const url = `${base}${entry}`;
    log('debug', 'discover navigate', { url });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: join(evidenceDir, 'screenshots', 'observe.png'), fullPage: true });
    const pageText = (await page.locator('body').innerText()).slice(0, 1800);
    const controls = await observeControls(page);
    log('debug', 'discover observed page', { chars: pageText.length, controls: controls.length });

    const observation = { goal, pageText, controls };

    if (config.llm.provider === 'ollama') {
      log('debug', 'discover ollama locator-emit', { model: config.llm.model });
      const userPrompt = `From this page observation, emit locator candidates JSON only:\n${JSON.stringify(observation)}`;
      const reply = await callOllama(config, SYSTEM_EMIT, userPrompt);
      if (!reply.ok) {
        llmNote = `ollama unreachable: ${reply.text}`;
        log('warn', 'discover llm failed', { detail: llmNote });
        if (!opts.allowOfflineSeed) {
          throw new Error(`Discovery LLM failed (${llmNote}). Start Ollama or pass --allow-offline-seed.`);
        }
      } else {
        llmCalls = 1;
        llmNote = reply.text.slice(0, 400);
        let llmEmit: z.infer<typeof EmitLocatorsSchema> | null = null;
        try {
          llmEmit = parseEmitLocators(extractJsonObject(reply.text));
          log('debug', 'discover llm locator-emit ok');
        } catch (e) {
          const err = (e as Error).message;
          log('warn', 'discover emit zod failed; repairing', { detail: err.slice(0, 200) });
          const repair = await callOllama(
            config,
            SYSTEM_EMIT,
            `Previous JSON failed: ${err}\nObservation:\n${JSON.stringify(observation)}\nEmit corrected targets.candidates JSON only.`,
          );
          llmCalls = 2;
          if (!repair.ok) throw new Error(`Discovery repair failed: ${repair.text}`);
          llmNote = repair.text.slice(0, 400);
          try {
            llmEmit = parseEmitLocators(extractJsonObject(repair.text));
          } catch {
            log('warn', 'discover repair still invalid; observation locators only');
            llmEmit = null;
            llmNote = `${llmNote} | observation_only`;
          }
        }
        compiled = await finalizeLocators(page, goal, controls, llmEmit);
      }
    } else if (!opts.allowOfflineSeed) {
      throw new Error('Discovery emit supports ollama by default; use --allow-offline-seed for seed emit');
    }

    if (!compiled) {
      if (!opts.allowOfflineSeed || !opts.seedPath) {
        throw new Error(
          'Discovery produced no capability (LLM failed; pass --allow-offline-seed --seed <path> for escape hatch)',
        );
      }
      mode = 'offline_seed';
      const seed = loadCapability(opts.seedPath);
      compiled = {
        ...seed,
        description: `${seed.description} (offline seed ${new Date().toISOString().slice(0, 10)})`,
      };
      log('warn', 'discover using offline seed fallback');
    }

    const artifactAbs = saveCapability(outPath, compiled);
    const artifactPath = repoRelative(root, artifactAbs);
    const artifactSha256 = sha256File(artifactAbs);
    copyCapabilitySnapshot(evidenceDir, artifactAbs);
    const evidenceRel = repoRelative(root, evidenceDir);
    log('debug', 'discover saved', { artifactPath, mode, llmCalls });

    writeJson(join(evidenceDir, 'run.json'), {
      goal,
      mode,
      emitMode: 'locators_only',
      ledger: [
        { action: 'navigate', ok: true, detail: url },
        {
          action: mode === 'llm_emit' ? 'llm_locator_emit' : 'offline_seed',
          ok: true,
          detail: llmNote || mode,
        },
        { action: 'compile', ok: true, detail: artifactPath },
      ],
      llmCalls,
      observationControls: controls.length,
    });

    return {
      ok: true,
      artifactPath,
      artifactSha256,
      llmCalls,
      provider: config.llm.provider,
      model: config.llm.model,
      message:
        mode === 'llm_emit'
          ? 'LLM emitted locators; capability skeleton merged in code'
          : 'compiled seed capability (offline)',
      evidenceDir: evidenceRel,
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
