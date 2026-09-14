/**
 * @file Hybrid field-map repair / invent from a11y observation (G1f–G1h).
 * Heuristic-first (Ashby-class widgets); optional one LLM call to patch gaps.
 */
import type { Page } from 'playwright';
import {
  FieldMapFieldSchema,
  FieldMapSchema,
  type FieldMap,
  type FieldMapField,
  type LocatorCandidate,
} from './schema.js';
import type { RuntimeConfig } from '../config/schema.js';
import { observeControls, type ControlHint } from '../surface/observe-controls.js';
import { enrichControlsFromGreenhouseApi } from '../surface/greenhouse-boards.js';
import type { AtsFamily } from '../surface/detect-ats.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isOpaqueProfilePath } from './profile.js';
import { resolveUnderRoot } from '../config/paths.js';
import { callOllamaJson } from '../llm/call-model.js';

const SYSTEM = `You repair application form field-maps. Reply with JSON only:
{"fields":[{"key":"...","required":true,"profilePath":"...","kind":"text|textarea|select|checkbox|radio|file","targets":[{"kind":"label"|"css"|"role"|"placeholder",...}],"craft":"llm"?}]}
Rules:
- profilePath MUST be one of profileKeys (or answers.* / flags.*) — never raw DOM ids.
- Resume/CV upload → kind file, profilePath resumePath.
- Yes/No radios → kind radio targeting the specific option (role+name or css).
- Skip g-recaptcha and submit buttons.
- Prefer label/role/placeholder; css #id or [id$=stableSuffix] as fallback.`;

export type RepairFieldMapResult = {
  map: FieldMap;
  llmCalls: number;
  note: string;
  extrasConsidered: number;
};

/**
 * Sibling green map + redacted receipt shapes for repair few-shot (docs/golden-forms.md).
 * Hold-out: skip when repairing the same mapId (generalization).
 */
const FEWSHOT: Partial<Record<AtsFamily, { mapId: string; mapRel: string; receiptRel?: string }>> = {
  ashby: {
    mapId: 'ashby-sciemo-auto',
    mapRel: 'capabilities/field-maps/ashby-sciemo-auto.json',
    receiptRel: 'evidence/g1-ashby-sciemo-det0/fill-receipt.json',
  },
  lever: {
    mapId: 'lever-100ms-auto',
    mapRel: 'capabilities/field-maps/lever-100ms-auto.json',
    receiptRel: 'evidence/g1-lever-100ms-det0/fill-receipt.json',
  },
  greenhouse: {
    mapId: 'greenhouse-figma-auto',
    mapRel: 'capabilities/field-maps/greenhouse-figma-auto.json',
  },
  workday: {
    mapId: 'workday-shaped-auto',
    mapRel: 'capabilities/field-maps/workday-shaped-auto.json',
    receiptRel: 'evidence/g1-workday-shaped-autonomy-reprove/fill-receipt.json',
  },
  // unknown: no sibling — prefer empty few-shot over baking demo-co-a into every unknown repair
};

/** Load few-shot sibling map fields + receipt skeleton (no PII values). */
export function loadRepairFewShot(
  root: string,
  family: AtsFamily,
  excludeMapId: string,
): { siblingFields?: unknown[]; siblingReceiptKeys?: unknown[] } {
  const spec = FEWSHOT[family];
  if (!spec) return {};
  // Hold-out: don't few-shot the map we're repairing.
  if (excludeMapId === spec.mapId || excludeMapId.startsWith(`${spec.mapId}-`)) return {};
  const out: { siblingFields?: unknown[]; siblingReceiptKeys?: unknown[] } = {};
  const mapPath = resolve(root, spec.mapRel);
  if (existsSync(mapPath)) {
    try {
      const raw = JSON.parse(readFileSync(mapPath, 'utf8')) as { fields?: unknown[] };
      out.siblingFields = (Array.isArray(raw.fields) ? raw.fields : [])
        .slice(0, 40)
        .map((f) => {
          const o = f as Record<string, unknown>;
          return {
            key: o.key,
            profilePath: o.profilePath,
            kind: o.kind,
            required: o.required,
            craft: o.craft,
          };
        });
    } catch {
      /* ignore */
    }
  }
  if (spec.receiptRel) {
    const rPath = resolve(root, spec.receiptRel);
    if (existsSync(rPath)) {
      try {
        const raw = JSON.parse(readFileSync(rPath, 'utf8')) as {
          entries?: Array<Record<string, unknown>>;
        };
        out.siblingReceiptKeys = (raw.entries ?? []).slice(0, 40).map((e) => ({
          key: e.key,
          profilePath: e.profilePath,
          kind: e.kind,
          verified: e.verified,
        }));
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

/** Controls that look fillable and are not already covered by the map. */
export function findExtraControls(
  controls: ControlHint[],
  fieldMap: FieldMap | null,
): ControlHint[] {
  const fillable = controls.filter((c) => {
    if (c.widget === 'yesno') return true;
    if (c.tag === 'button') return false;
    if (c.type === 'submit' || c.type === 'button' || c.type === 'hidden') return false;
    if (c.id?.includes('g-recaptcha') || c.inputName === 'g-recaptcha-response') return false;
    return (
      c.tag === 'input' ||
      c.tag === 'select' ||
      c.tag === 'textarea' ||
      c.widget === 'combobox'
    );
  });
  if (!fieldMap) return fillable;
  return fillable.filter((c) => !controlCoveredByMap(c, fieldMap));
}

function controlCoveredByMap(c: ControlHint, map: FieldMap): boolean {
  return map.fields.some((f) => fieldCoversControl(f, c));
}

/** True when a FieldMap row targets this observed control. */
function fieldCoversControl(f: FieldMapField, c: ControlHint): boolean {
  const label = (c.label || '').toLowerCase();
  const question = (c.question || '').toLowerCase();
  const name = (c.name || c.inputName || '').toLowerCase();
  const id = (c.id || '').toLowerCase();
  for (const t of f.targets) {
    if (t.kind === 'label' && t.name) {
      const ln = t.name.toLowerCase();
      if (label && ln === label) return true;
      if (question && (question.includes(ln) || ln.includes(question))) return true;
    }
    if (t.kind === 'css' && t.selector) {
      const sel = t.selector;
      if (id && (sel === `#${c.id}` || sel.replace(/^#/, '') === id)) return true;
      if (name && (sel.includes(`name='${name}'`) || sel.includes(`name="${name}"`))) return true;
    }
    if (name && f.key.toLowerCase() === name) return true;
    if (f.kind === 'file' && c.widget === 'file') return true;
    if (f.profilePath === 'resumePath' && c.widget === 'file') return true;
    if (f.profilePath === 'location' && c.widget === 'combobox') return true;
  }
  return false;
}

/**
 * Keep only FieldMap rows that match visible controls (Bridge multipage perf).
 * If nothing matches, return the original map so repair can still bootstrap.
 */
export function filterFieldMapToControls(map: FieldMap, controls: ControlHint[]): FieldMap {
  if (!controls.length) return map;
  const fields = map.fields.filter((f) => {
    // Never drop plan literals — label drift would wipe answers; fill skips invisible.
    if (f.literal !== undefined && f.literal !== null && String(f.literal).trim() !== '') return true;
    return controls.some((c) => fieldCoversControl(f, c));
  });
  if (!fields.length) return map;
  return { ...map, fields, updatedAt: new Date().toISOString() };
}

/**
 * Merge field rows by key.
 * - `add` (default for heuristics): keep existing keys — imported maps must not be wiped.
 * - `replace`: patch wins (stuck/LLM repair).
 */
export function mergeFieldMap(
  base: FieldMap | null,
  patchFields: FieldMapField[],
  id: string,
  opts?: { mode?: 'add' | 'replace' },
): FieldMap {
  const mode = opts?.mode ?? 'add';
  const byKey = new Map<string, FieldMapField>();
  if (base) for (const f of base.fields) byKey.set(f.key, f);
  for (const f of patchFields) {
    if (mode === 'replace' || !byKey.has(f.key)) {
      const prev = byKey.get(f.key);
      // Keep imported plan answers when LLM repair omits literal — never on kind:file.
      if (
        mode === 'replace' &&
        prev &&
        prev.literal !== undefined &&
        f.literal === undefined &&
        f.kind !== 'file'
      ) {
        byKey.set(f.key, { ...f, literal: prev.literal });
      } else if (f.kind === 'file') {
        const { literal: _drop, ...rest } = f;
        byKey.set(f.key, { ...rest, profilePath: 'resumePath' });
      } else {
        byKey.set(f.key, f);
      }
    }
  }
  const fields = [...byKey.values()];
  return FieldMapSchema.parse({
    schemaVersion: 1,
    id: base?.id ?? id,
    platform: base?.platform,
    companyKey: base?.companyKey,
    successBanner: base?.successBanner,
    fields,
    updatedAt: new Date().toISOString(),
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

function normalizeField(raw: unknown): FieldMapField | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  const targetsRaw = Array.isArray(f.targets) ? f.targets : [];
  const targets: LocatorCandidate[] = [];
  for (let i = 0; i < targetsRaw.length; i++) {
    const t = targetsRaw[i];
    if (!t || typeof t !== 'object') continue;
    const c = t as Record<string, unknown>;
    const kind = String(c.kind ?? 'css').toLowerCase();
    if (kind === 'label' && c.name) {
      targets.push({ kind: 'label', rank: i + 1, name: String(c.name) });
    } else if (kind === 'placeholder' && (c.name || c.text)) {
      targets.push({ kind: 'placeholder', rank: i + 1, name: String(c.name ?? c.text) });
    } else if (kind === 'css' && (c.selector || c.css)) {
      targets.push({ kind: 'css', rank: i + 1, selector: String(c.selector ?? c.css) });
    } else if (kind === 'role' && c.role) {
      targets.push({
        kind: 'role',
        rank: i + 1,
        role: String(c.role),
        name: c.name ? String(c.name) : undefined,
        exact: typeof c.exact === 'boolean' ? c.exact : undefined,
      });
    }
  }
  if (!targets.length) return null;
  const kindRaw = String(f.kind ?? 'text');
  const kinds = ['text', 'textarea', 'select', 'checkbox', 'radio', 'file'] as const;
  const kind = (kinds as readonly string[]).includes(kindRaw)
    ? (kindRaw as FieldMapField['kind'])
    : 'text';
  const parsed = FieldMapFieldSchema.safeParse({
    key: String(f.key ?? ''),
    required: Boolean(f.required),
    profilePath: String(f.profilePath ?? f.key ?? ''),
    kind,
    targets,
    enumHints: Array.isArray(f.enumHints) ? f.enumHints.map(String) : undefined,
    invertBool: f.invertBool === true ? true : undefined,
    craft: f.craft === 'llm' ? 'llm' : f.craft === 'none' ? 'none' : undefined,
    literal:
      typeof f.literal === 'string' || typeof f.literal === 'number' || typeof f.literal === 'boolean'
        ? f.literal
        : undefined,
  });
  return parsed.success ? parsed.data : null;
}

/** “without requiring sponsorship” vs “do you require sponsorship?” */
export function isNegatedSponsorshipQuestion(text: string): boolean {
  return /without\s+(requiring\s+)?sponsorship|not\s+require\s+sponsorship|no\s+sponsorship\s+required/i.test(
    text,
  );
}

/**
 * Whether repair should skip the LLM call.
 * `allowLlm: false` = routine multipage later pages (explicit; never parse reason strings).
 * Also skip when heuristics already cover all required extras.
 */
export function shouldSkipRepairLlm(opts: {
  allowLlm?: boolean;
  uncoveredRequiredCount: number;
}): boolean {
  if (opts.allowLlm === false) return true;
  return opts.uncoveredRequiredCount === 0;
}

/**
 * Observe page + heuristics (primary) + optional one LLM call to patch field-map.
 */
export async function repairFieldMap(opts: {
  page: Page;
  fieldMap: FieldMap | null;
  mapId: string;
  config: RuntimeConfig;
  profileKeys: string[];
  reason?: string;
  /**
   * When false, skip LLM (routine fillFormFlow pages after the first).
   * Stuck/retry/bootstrap leave true or omit. Default true — never infer from reason text.
   */
  allowLlm?: boolean;
  /** Project root — loads golden sibling few-shot when set. */
  root?: string;
  atsFamily?: AtsFamily;
}): Promise<RepairFieldMapResult> {
  let controls = await observeControls(opts.page);
  try {
    controls = await enrichControlsFromGreenhouseApi(opts.page.url(), controls);
  } catch {
    /* boards-api optional */
  }
  const requiredExtras = findExtraControls(controls, opts.fieldMap).filter((c) => Boolean(c.required));

  const heuristicFields = buildHeuristicFields(controls, opts.profileKeys);
  // Prefer seed/import: heuristics only fill gaps (Bridge: honor imported FieldMaps).
  let map = mergeFieldMap(opts.fieldMap, heuristicFields, opts.mapId, { mode: 'add' });

  const fewShot =
    opts.root && opts.atsFamily
      ? loadRepairFewShot(opts.root, opts.atsFamily, opts.mapId)
      : {};

  const user = JSON.stringify({
    reason: opts.reason ?? (opts.fieldMap ? 'repair' : 'bootstrap'),
    profileKeys: opts.profileKeys,
    existingMap: map,
    controls: controls.slice(0, 80),
    uncoveredControls: findExtraControls(controls, map).slice(0, 40),
    ...fewShot,
    hint: 'Only add/fix gaps. profilePath must be in profileKeys. Resume=file/resumePath. Prefer siblingFields patterns when present.',
  });

  let llmCalls = 0;
  // Multipage: caller sets allowLlm=false on later pages; stuck/retry pass true.
  // Also skip when heuristics already cover required extras (avoid 180s timeout on wrong model).
  const uncoveredRequired = findExtraControls(controls, map).filter((c) => c.required);
  const skipLlm = shouldSkipRepairLlm({
    allowLlm: opts.allowLlm,
    uncoveredRequiredCount: uncoveredRequired.length,
  });
  if (!skipLlm) {
    const reply = await callOllamaJson(opts.config, SYSTEM, user);
    if (reply.ok) {
      llmCalls = 1;
      try {
        const parsed = extractJsonObject(reply.text) as { fields?: unknown[] };
        const llmFields: FieldMapField[] = [];
        for (const r of Array.isArray(parsed.fields) ? parsed.fields : []) {
          const n = normalizeField(r);
          if (!n) continue;
          if (isOpaqueProfilePath(n.profilePath, opts.profileKeys)) continue;
          llmFields.push(n);
        }
        if (llmFields.length) map = mergeFieldMap(map, llmFields, opts.mapId, { mode: 'replace' });
      } catch {
        /* keep heuristics */
      }
    }
  }

  map = overlayHeuristicsFromControls(controls, map, opts.profileKeys);
  map = dropShadowedFields(map, controls, opts.profileKeys);
  map = await ensureWorkdayCareerFields(opts.page, map, opts.profileKeys);
  if (!map.fields.length) throw new Error('field-map repair produced no fields');
  return {
    map,
    llmCalls,
    note: opts.fieldMap ? 'repaired' : 'bootstrapped',
    extrasConsidered: requiredExtras.length,
  };
}

function fieldHasLiteral(f: FieldMap['fields'][number]): boolean {
  return f.literal !== undefined && f.literal !== null && String(f.literal).trim() !== '';
}

/**
 * Drop stale map rows that steal another field's DOM node (e.g. sponsorship → #workAuth on Co C).
 * Heuristic owner of #id / name wins. Plan literals may win over *optional* owners (survey),
 * but never over required heuristic owners (hostile/stale plan). Then non-literal optional rivals
 * sharing a kept literal's CSS selectors are dropped (G12a). Required:true map rows are never
 * dropped in that pass (T-B-27); when they share a selector with a plan literal, the literal
 * is dropped instead so fill last-wins cannot overwrite the required profile value (T-B-27b).
 * ponytail: only css targets participate in ownership — label/role collisions are not detected;
 * upgrade: build owner map from resolved locators if that bites.
 */
export function dropShadowedFields(
  map: FieldMap,
  controls: ControlHint[],
  profileKeys: string[],
): FieldMap {
  const ownerBySelector = new Map<string, string>();
  const ownerRequired = new Map<string, boolean>();
  for (const c of controls) {
    const h = heuristicFieldFromControl(c, profileKeys);
    if (!h) continue;
    const mark = (sel: string) => {
      ownerBySelector.set(sel, h.key);
      ownerRequired.set(sel, Boolean(h.required));
    };
    if (c.id) mark(`#${c.id}`);
    if (c.inputName) {
      mark(`input[name='${c.inputName}']`);
      mark(`select[name='${c.inputName}']`);
      mark(`textarea[name='${c.inputName}']`);
    }
  }
  let fields = map.fields.filter((f) => {
    for (const t of f.targets) {
      if (t.kind !== 'css' || !t.selector) continue;
      const owner = ownerBySelector.get(t.selector);
      if (!owner || owner === f.key) continue;
      if (fieldHasLiteral(f)) {
        // Required control: drop hostile/stale literal. Optional survey: literal may win.
        if (ownerRequired.get(t.selector)) return false;
        continue;
      }
      return false;
    }
    return true;
  });
  // Drop non-literal fields whose CSS selectors collide with a kept literal field.
  const literalSelectors = new Set<string>();
  for (const f of fields) {
    if (!fieldHasLiteral(f)) continue;
    for (const t of f.targets) {
      if (t.kind === 'css' && t.selector) literalSelectors.add(t.selector);
    }
  }
  if (literalSelectors.size) {
    fields = fields.filter((f) => {
      if (fieldHasLiteral(f)) return true;
      // T-B-27: never drop required:true map rows in pass 2 (requiredness may be undetected on owner).
      if (f.required) return true;
      for (const t of f.targets) {
        if (t.kind === 'css' && t.selector && literalSelectors.has(t.selector)) return false;
      }
      return true;
    });
  }
  // T-B-27b: required non-literal beats colliding plan literal (avoids last-wins overwrite).
  // Keep required literals (answered required select) — only drop optional colliding literals.
  const requiredSelectors = new Set<string>();
  for (const f of fields) {
    if (fieldHasLiteral(f) || !f.required) continue;
    for (const t of f.targets) {
      if (t.kind === 'css' && t.selector) requiredSelectors.add(t.selector);
    }
  }
  if (requiredSelectors.size) {
    fields = fields.filter((f) => {
      if (!fieldHasLiteral(f)) return true;
      if (f.required) return true;
      for (const t of f.targets) {
        if (t.kind === 'css' && t.selector && requiredSelectors.has(t.selector)) return false;
      }
      return true;
    });
  }
  return fields.length === map.fields.length ? map : mergeFieldMap({ ...map, fields }, [], map.id);
}

/**
 * Workday My Information widgets often are not plain <input>s (multiselect / select-one).
 * Inject stable formField-* bindings when those nodes exist on the page.
 */
async function ensureWorkdayCareerFields(
  page: Page,
  map: FieldMap,
  profileKeys: string[],
): Promise<FieldMap> {
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('[data-automation-id^="formField-"]')].map((el) =>
      el.getAttribute('data-automation-id'),
    ),
  );
  if (!ids.length) return map;
  const have = new Set(map.fields.map((f) => f.key));
  const extra: FieldMapField[] = [];
  const add = (key: string, profilePath: string, kind: FieldMapField['kind'], formField: string) => {
    if (have.has(key)) return;
    if (profileKeys.length && isOpaqueProfilePath(profilePath, profileKeys)) return;
    have.add(key);
    extra.push({
      key,
      required: true,
      profilePath,
      kind,
      targets: [{ kind: 'css', rank: 1, selector: `[data-automation-id='${formField}']` }],
    });
  };
  if (ids.includes('formField-source')) add('howHeard', 'howHeard', 'text', 'formField-source');
  if (ids.includes('formField-phoneType'))
    add('phoneDeviceType', 'phoneDeviceType', 'select', 'formField-phoneType');
  if (ids.includes('formField-phoneNumber')) add('phone', 'phone', 'text', 'formField-phoneNumber');
  if (ids.includes('formField-countryRegion')) add('state', 'state', 'select', 'formField-countryRegion');
  if (ids.includes('formField-addressLine1')) add('address1', 'address1', 'text', 'formField-addressLine1');
  if (ids.includes('formField-city')) add('city', 'city', 'text', 'formField-city');
  if (ids.includes('formField-postalCode')) add('postalCode', 'postalCode', 'text', 'formField-postalCode');
  if (ids.includes('formField-legalName--firstName'))
    add('firstName', 'firstName', 'text', 'formField-legalName--firstName');
  if (ids.includes('formField-legalName--lastName'))
    add('lastName', 'lastName', 'text', 'formField-legalName--lastName');
  if (ids.includes('formField-candidateIsPreviousWorker') && !have.has('previouslyEmployed')) {
    extra.push({
      key: 'previouslyEmployed',
      required: true,
      profilePath: pickPath(profileKeys, ['flags.previouslyEmployedNo'], 'flags.previouslyEmployedNo'),
      kind: 'radio',
      targets: [{ kind: 'role', rank: 1, role: 'radio', name: 'No' }],
    });
  }
  return extra.length ? mergeFieldMap(map, extra, map.id) : map;
}

/** Refresh/add fields from live controls; collapse duplicate keys (same profilePath OK for verify password). */
export function overlayHeuristicsFromControls(
  controls: ControlHint[],
  map: FieldMap,
  profileKeys: string[] = [],
): FieldMap {
  const more = buildHeuristicFields(controls, profileKeys);
  let next = more.length ? mergeFieldMap(map, more, map.id) : map;
  const seen = new Set<string>();
  const deduped: FieldMapField[] = [];
  for (const f of next.fields) {
    if (seen.has(f.key)) continue;
    if (profileKeys.length && isOpaqueProfilePath(f.profilePath, profileKeys)) continue;
    seen.add(f.key);
    deduped.push(f);
  }
  return mergeFieldMap({ ...next, fields: deduped }, [], next.id);
}

function buildHeuristicFields(controls: ControlHint[], profileKeys: string[]): FieldMapField[] {
  const fields: FieldMapField[] = [];
  const radioGroups = new Map<string, ControlHint[]>();

  for (const c of controls) {
    if (c.widget === 'radio' && c.inputName) {
      const list = radioGroups.get(c.inputName) || [];
      list.push(c);
      radioGroups.set(c.inputName, list);
      continue;
    }
    const h = heuristicFieldFromControl(c, profileKeys);
    if (h) fields.push(h);
  }

  for (const [, opts] of radioGroups) {
    const h = heuristicRadioGroup(opts, profileKeys);
    if (h) fields.push(h);
  }

  return fields;
}

function blob(c: ControlHint): string {
  return [c.label, c.question, c.name, c.placeholder, c.id, c.inputName, c.text]
    .filter(Boolean)
    .join(' ');
}

/** Identity-ish text only — excludes nearby question (Ashby/Workday pollution). */
function coreBlob(c: ControlHint): string {
  return [c.label, c.name, c.placeholder, c.id, c.inputName, c.type, c.text].filter(Boolean).join(' ');
}

function pickPath(keys: string[], candidates: string[], fallback: string): string {
  for (const c of candidates) {
    if (!keys.length || keys.includes(c) || c.startsWith('flags.') || c.startsWith('answers.'))
      return c;
  }
  return fallback;
}

function heuristicRadioGroup(opts: ControlHint[], profileKeys: string[]): FieldMapField | null {
  if (!opts.length) return null;
  const sample = opts[0];
  const b = blob(sample) + ' ' + opts.map((o) => o.label || o.text || '').join(' ');

  if (/communicationConsent|text message|consent to receiving/i.test(b)) {
    const no = opts.find((o) => /notGiven|do not consent/i.test(`${o.value} ${o.label} ${o.text}`));
    if (!no) return null;
    const targets: LocatorCandidate[] = [];
    const nm = (no.label || no.text || '').slice(0, 80);
    if (nm) targets.push({ kind: 'role', rank: 1, role: 'radio', name: nm });
    if (no.value && no.inputName)
      targets.push({
        kind: 'css',
        rank: 2,
        selector: `input[name='${no.inputName}'][value='${no.value}']`,
      });
    return {
      key: 'smsConsent',
      required: true,
      profilePath: pickPath(profileKeys, ['flags.smsConsentNo'], 'flags.smsConsentNo'),
      kind: 'radio',
      targets,
    };
  }

  // Workday: previously employed?
  if (/previously worked|former employee|employee or contractor/i.test(b)) {
    const no = opts.find((o) => /^(No)$/i.test((o.label || o.text || '').trim()));
    if (!no) return null;
    const targets: LocatorCandidate[] = [];
    const nm = (no.label || no.text || 'No').slice(0, 80);
    targets.push({ kind: 'role', rank: 1, role: 'radio', name: nm });
    if (no.id) targets.push({ kind: 'css', rank: 2, selector: `#${no.id}` });
    return {
      key: 'previouslyEmployed',
      required: true,
      profilePath: pickPath(profileKeys, ['flags.previouslyEmployedNo'], 'flags.previouslyEmployedNo'),
      kind: 'radio',
      targets,
    };
  }

  if (
    /monthly|NYC|in-person|travel/i.test(b) &&
    opts.some((o) => /^(Yes|No)$/i.test(o.label || o.text || ''))
  ) {
    const yes = opts.find((o) => /^(Yes)$/i.test((o.label || o.text || '').trim()));
    if (!yes) return null;
    const targets: LocatorCandidate[] = [];
    if (yes.id?.includes('-labeled-radio-')) {
      const suffix = yes.id.replace(/^.*?(_[0-9a-f-]{30,}-labeled-radio-\d+)$/i, '$1');
      if (suffix.startsWith('_'))
        targets.push({ kind: 'css', rank: 1, selector: `input[id$='${suffix}']` });
    }
    if (yes.id) targets.push({ kind: 'css', rank: targets.length + 1, selector: `#${yes.id}` });
    return {
      key: 'monthlyTravel',
      required: true,
      profilePath: pickPath(profileKeys, ['flags.monthlyTravelYes'], 'flags.monthlyTravelYes'),
      kind: 'radio',
      targets,
    };
  }

  if (/visa|sponsorhip|sponsorship not required|F-1 OPT|H-1B/i.test(b)) {
    const none = opts.find((o) => /not required/i.test(o.label || o.text || ''));
    if (!none) return null;
    const targets: LocatorCandidate[] = [
      {
        kind: 'role',
        rank: 1,
        role: 'radio',
        name: none.label || none.text || 'Visa Sponsorhip Not Required',
      },
    ];
    if (none.id?.includes('-labeled-radio-')) {
      const suffix = none.id.replace(/^.*?(_[0-9a-f-]{30,}-labeled-radio-\d+)$/i, '$1');
      if (suffix.startsWith('_'))
        targets.push({ kind: 'css', rank: 2, selector: `input[id$='${suffix}']` });
    }
    return {
      key: 'visaType',
      required: true,
      profilePath: pickPath(profileKeys, ['flags.visaNotRequired'], 'flags.visaNotRequired'),
      kind: 'radio',
      targets,
    };
  }

  return null;
}

function heuristicFieldFromControl(c: ControlHint, profileKeys: string[]): FieldMapField | null {
  if (c.widget === 'yesno') return heuristicYesNo(c, profileKeys);
  if (c.tag === 'button' || c.type === 'submit') return null;
  if (c.id?.includes('g-recaptcha') || c.inputName === 'g-recaptcha-response') return null;
  if (!(c.tag === 'input' || c.tag === 'select' || c.tag === 'textarea' || c.widget === 'combobox'))
    return null;
  if (c.widget === 'radio') return null;

  const b = blob(c);
  const core = coreBlob(c);
  const targets: LocatorCandidate[] = [];
  const label = (c.label || '')
    .replace(/\s*[＊✱*]\s*$/u, '')
    .replace(/[＊✱*]/gu, '')
    .trim()
    .slice(0, 80);

  if (c.widget === 'file' || c.type === 'file') {
    if (!/resume|cv|curriculum|upload/i.test(core + ' ' + b) && c.id !== '_systemfield_resume' && c.inputName !== 'resume')
      return null;
    if (label && label.length < 60) targets.push({ kind: 'label', rank: 1, name: label.split(/\s{2,}/)[0] || 'Resume' });
    if (c.id) targets.push({ kind: 'css', rank: targets.length + 1, selector: `#${c.id}` });
    else if (c.inputName)
      targets.push({
        kind: 'css',
        rank: targets.length + 1,
        selector: `input[type='file'][name='${c.inputName}']`,
      });
    else targets.push({ kind: 'css', rank: targets.length + 1, selector: "input[type='file']" });
    return {
      key: 'resume',
      required: true,
      profilePath: pickPath(profileKeys, ['resumePath'], 'resumePath'),
      kind: 'file',
      targets,
    };
  }

  // Honeypot / bot traps
  if (
    c.inputName === 'website' ||
    /beecatcher|for robots only|robots only/i.test(b) ||
    c.dataField === 'beecatcher'
  )
    return null;

  if (c.widget === 'checkbox' || c.type === 'checkbox') {
    if (!/i agree|agree|terms|integrity|candidate account|createAccountCheckbox/i.test(core + ' ' + b + ' ' + (c.dataField || '')))
      return null;
    if (c.dataField) targets.push({ kind: 'css', rank: 1, selector: `[data-automation-id='${c.dataField}']` });
    if (c.id) targets.push({ kind: 'css', rank: targets.length + 1, selector: `#${c.id}` });
    if (label) targets.push({ kind: 'label', rank: targets.length + 1, name: label });
    if (!targets.length) return null;
    return {
      key: 'agreeTerms',
      required: true,
      profilePath: pickPath(profileKeys, ['flags.agreeTerms'], 'flags.agreeTerms'),
      kind: 'checkbox',
      targets,
    };
  }

  let profilePath: string | null = null;
  let kind: FieldMapField['kind'] = 'text';
  let key = 'field';
  let required = Boolean(c.required);
  let craft: 'llm' | undefined;
  let invertBool: boolean | undefined;

  if (
    /email/i.test(core) ||
    c.type === 'email' ||
    c.inputName === 'email' ||
    c.inputName === '_systemfield_email' ||
    c.id === '_systemfield_email' ||
    c.dataField === 'email'
  ) {
    profilePath = 'email';
    key = 'email';
    required = true;
  } else if (
    (profileKeys.includes('password') || profileKeys.includes('passwordConfirm')) &&
    (c.type === 'password' || /password/i.test(core) || c.dataField === 'password' || c.dataField === 'verifyPassword')
  ) {
    profilePath = 'password';
    key =
      /confirm|verify|re-?enter|repeat/i.test(core) || c.dataField === 'verifyPassword'
        ? 'passwordConfirm'
        : 'password';
    required = true;
  } else if (/legal\s*first|first\s*name/i.test(core) || /firstName/i.test(c.id || '')) {
    profilePath = 'firstName';
    key = 'firstName';
    required = true;
  } else if (/legal\s*last|last\s*name/i.test(core) || /lastName/i.test(c.id || '')) {
    profilePath = 'lastName';
    key = 'lastName';
    required = true;
  } else if (/how did you hear|source\s*type|hear about us/i.test(core + ' ' + b) || c.dataField === 'formField-source') {
    profilePath = 'howHeard';
    key = 'howHeard';
    required = true;
    kind = 'text';
  } else if (/phone\s*device\s*type|device\s*type/i.test(core)) {
    profilePath = 'phoneDeviceType';
    key = 'phoneDeviceType';
    required = true;
    kind = 'select';
  } else if (/country\s*phone\s*code|phone\s*code|phone\s*extension/i.test(core)) {
    return null; // leave Workday defaults
  } else if (
    /phone\s*number|^phone\b/i.test(core) ||
    c.type === 'tel' ||
    c.inputName === 'phone'
  ) {
    profilePath = 'phone';
    key = 'phone';
    required = true;
  } else if (/address\s*line\s*1|^address$/i.test(core)) {
    profilePath = 'address1';
    key = 'address1';
    required = Boolean(c.required);
  } else if (/^city$/i.test(label || '') || /^city\b/i.test(core)) {
    profilePath = 'city';
    key = 'city';
    required = Boolean(c.required);
  } else if (/^state$/i.test(label || '') || /state\/province|province/i.test(core)) {
    profilePath = 'state';
    key = 'state';
    required = Boolean(c.required);
    kind = c.tag === 'select' || c.widget === 'select' || c.widget === 'combobox' ? 'select' : 'text';
  } else if (/postal|zip\s*code/i.test(core)) {
    profilePath = 'postalCode';
    key = 'postalCode';
    required = Boolean(c.required);
  } else if (
    /^(country|country\/region)\b/i.test(core) &&
    !/phone|authorized|sponsorship/i.test(`${b} ${c.question || ''}`)
  ) {
    profilePath = 'country';
    key = 'country';
    required = true;
    kind = c.tag === 'select' || c.widget === 'combobox' || c.widget === 'select' ? 'select' : 'text';
  } else if (/country/i.test(core) && /phone/i.test(`${c.question || ''} ${c.label || ''}`)) {
    // Greenhouse phone dial-code "Country" combobox — leave default.
    return null;
  } else if (/school or university|^school$|institution|university|college/i.test(core)) {
    profilePath = pickPath(profileKeys, ['school'], 'school');
    key = 'school';
    required = Boolean(c.required) || /✱|\*/.test(c.label || '');
  } else if (/^degree$/i.test(label || '') || (/degree/i.test(core) && !/field|study/i.test(core))) {
    profilePath = pickPath(profileKeys, ['degree'], 'degree');
    key = 'degree';
    required = Boolean(c.required) || /✱|\*/.test(c.label || '');
    kind = c.tag === 'select' || c.widget === 'combobox' ? 'select' : 'text';
  } else if (/field of study|major|area of study/i.test(core)) {
    profilePath = pickPath(profileKeys, ['fieldOfStudy'], 'fieldOfStudy');
    key = 'fieldOfStudy';
    required = Boolean(c.required) || /✱|\*/.test(c.label || '');
    kind = 'text';
  } else if (/overall result|\bgpa\b|grade point/i.test(core)) {
    profilePath = pickPath(profileKeys, ['gpa'], 'gpa');
    key = 'gpa';
    required = false;
  } else if (/^from\b|start year|attendance.*from/i.test(core) && /year|yyyy|date/i.test(b + ' ' + (c.placeholder || ''))) {
    profilePath = pickPath(profileKeys, ['eduFromYear'], 'eduFromYear');
    key = 'eduFromYear';
    required = Boolean(c.required);
  } else if (/^to\b|end year|expected|graduation year/i.test(core) && /year|yyyy|date|expected/i.test(b + ' ' + (c.placeholder || ''))) {
    profilePath = pickPath(profileKeys, ['eduToYear'], 'eduToYear');
    key = 'eduToYear';
    required = Boolean(c.required);
  } else if (/linkedin/i.test(core)) {
    profilePath = 'linkedin';
    key = 'linkedin';
    required = /✱|\*/.test(c.label || '') || Boolean(c.required);
  } else if (/github|portfolio|kaggle|stackoverflow/i.test(core) || (/website/i.test(core) && c.inputName !== 'website')) {
    profilePath = 'portfolio';
    key = 'portfolio';
    required = false;
  } else if (
    c.inputName === 'name' ||
    c.inputName === 'legalName' ||
    c.inputName === '_systemfield_name' ||
    c.id === 'legalName' ||
    /full\s*name|legal\s*name|^name$|_systemfield_name/i.test(core) ||
    c.id === '_systemfield_name'
  ) {
    profilePath = 'fullName';
    key = 'fullName';
    required = true;
  } else if (
    /current company|\borg\b/i.test(core) ||
    c.inputName === 'org'
  ) {
    profilePath = 'company';
    key = 'company';
    required = Boolean(c.required) || /✱|\*/.test(c.label || '');
  } else if (
    // Greenhouse / Ashby yes-no style comboboxes (not free-text location)
    (c.widget === 'combobox' || c.widget === 'select' || c.tag === 'select') &&
    /authorized to work|legally authorized|work authorization|require sponsorship|without.*sponsorship|need sponsorship/i.test(
      b,
    )
  ) {
    const opts = (c.options || []).filter((o) => o && !/^select/i.test(o));
    const onlyYesNo = opts.length > 0 && opts.every((o) => /^(yes|no)$/i.test(o.trim()));
    const authStyle = opts.some((o) => /authorized|needs sponsorship/i.test(o));
    if (c.tag === 'select' && authStyle && !onlyYesNo) {
      // Mock / ATS selects with Authorized vs Needs sponsorship — use string workAuth.
      profilePath = 'workAuth';
      key = 'workAuth';
      kind = 'select';
      required = true;
    } else if (isNegatedSponsorshipQuestion(b) || /require sponsorship|need sponsorship/i.test(b)) {
      profilePath = 'flags.sponsorshipNo';
      key = `sponsorship-${(c.id || core).slice(0, 24)}`;
      invertBool = !isNegatedSponsorshipQuestion(b);
      kind = c.tag === 'select' ? 'select' : 'text';
      required = true;
    } else {
      profilePath = 'flags.workAuthYes';
      key = `workAuth-${(c.id || core).slice(0, 24)}`;
      kind = c.tag === 'select' ? 'select' : 'text';
      required = true;
    }
  } else if (
    (c.widget === 'combobox' || c.tag === 'select') &&
    /yes\s*\/\s*no|experience in|do you have|are you|will you|have you/i.test(b) &&
    !/location|country|city/i.test(core)
  ) {
    // Required custom Y/N — prefer decline-safe flags; craftable essays stay elsewhere.
    profilePath = pickPath(profileKeys, ['flags.workAuthYes', 'answers.additional'], 'flags.workAuthYes');
    key = `custom-${(c.id || core).slice(0, 32)}`;
    kind = 'text';
    required = Boolean(c.required) || /✱|\*/.test(c.label || '');
  } else if (
    (c.tag === 'select' || c.widget === 'combobox' || c.widget === 'select') &&
    /gender|sex\b|race|ethnicity|veteran|disability|lgbt|hispanic|demographic|\beeo\b|equal opportunity|self-identify|pronoun/i.test(
      b,
    )
  ) {
    profilePath = pickPath(profileKeys, ['flags.eeoDecline'], 'flags.eeoDecline');
    key = `eeo-${(c.id || core).slice(0, 28)}`;
    kind = c.tag === 'select' ? 'select' : 'text';
    required = Boolean(c.required) || /✱|\*/.test(c.label || '');
  } else if (
    /start typing/i.test(c.placeholder || '') ||
    c.inputName === 'location' ||
    /current location|^location|city\)/i.test(core) ||
    (c.widget === 'combobox' && /location|city/i.test(core))
  ) {
    profilePath = 'location';
    key = 'location';
    required = Boolean(c.required) || /✱|\*/.test(c.label || '');
  } else if (/pick date|available to start|start date/i.test(b)) {
    profilePath = 'startDate';
    key = 'startDate';
    required = true;
  } else if (c.tag === 'textarea' || c.widget === 'textarea') {
    if (/additional|anything else|love to share|why/i.test(b)) {
      const isWhy = /why/i.test(b);
      profilePath = isWhy ? 'answers.whyCompany' : 'answers.additional';
      // Align with import-plan keys (whyCompany) so seed literals are not shadow-dropped.
      key = isWhy ? 'whyCompany' : 'additional';
      kind = 'textarea';
      required = false;
      craft = isWhy ? 'llm' : undefined;
    } else return null;
  } else if (c.tag === 'select') {
    if (!/auth|sponsor|authorized to work|country/i.test(b)) return null;
    if (/country/i.test(core)) {
      profilePath = 'country';
      kind = 'select';
      key = 'country';
    } else if (
      c.inputName === 'workAuth' ||
      c.id === 'workAuth' ||
      /work auth|authorized to work/i.test(label || core)
    ) {
      // Option text often includes "Needs sponsorship" — don't let that steal workAuth.
      profilePath = 'workAuth';
      kind = 'select';
      key = 'workAuth';
    } else if (/sponsor/i.test(label || '')) {
      profilePath = 'flags.sponsorshipNo';
      kind = 'select';
      key = 'sponsorship';
    } else {
      profilePath = 'workAuth';
      kind = 'select';
      key = 'workAuth';
    }
  } else {
    return null;
  }

  if (
    invertBool === undefined &&
    (kind === 'select' || kind === 'text') &&
    profilePath === 'flags.sponsorshipNo' &&
    !isNegatedSponsorshipQuestion(b) &&
    /sponsor/i.test(b)
  ) {
    invertBool = true;
  }
  const enumHints =
    c.options?.length && (kind === 'select' || kind === 'text') ? c.options.slice(0, 40) : undefined;

  // Stable Workday automation ids beat ephemeral #input-N
  if (c.dataField && !['beecatcher'].includes(c.dataField))
    targets.push({ kind: 'css', rank: 1, selector: `[data-automation-id='${c.dataField}']` });
  if (c.id && !/^input-\d+$/i.test(c.id)) targets.push({ kind: 'css', rank: targets.length + 1, selector: `#${c.id}` });
  if (label && label.length < 60 && !/attach resume|analyzing|success/i.test(label))
    targets.push({ kind: 'label', rank: targets.length + 1, name: label });
  if (c.placeholder && (profilePath === 'location' || profilePath === 'startDate'))
    targets.push({ kind: 'placeholder', rank: targets.length + 1, name: c.placeholder });
  if (c.inputName && !c.inputName.includes('['))
    targets.push({
      kind: 'css',
      rank: targets.length + 1,
      selector: `${c.tag}[name='${c.inputName}']`,
    });
  else if (c.inputName?.startsWith('urls['))
    targets.push({
      kind: 'css',
      rank: targets.length + 1,
      selector: `input[name="${c.inputName}"]`,
    });
  if (!targets.length && c.id)
    targets.push({ kind: 'css', rank: 1, selector: `#${c.id}` });
  if (!targets.length && c.placeholder)
    targets.push({ kind: 'placeholder', rank: 1, name: c.placeholder });
  if (!targets.length) return null;

  return {
    key,
    required,
    profilePath: pickPath(profileKeys, [profilePath], profilePath),
    kind,
    targets,
    craft,
    enumHints,
    invertBool,
  };
}

function heuristicYesNo(c: ControlHint, profileKeys: string[]): FieldMapField | null {
  const q = `${c.question || ''} ${c.label || ''}`;
  const idx = Number(c.value || '0');
  let profilePath: string;
  let wantYes: boolean;
  let key: string;
  if (isNegatedSponsorshipQuestion(q)) {
    // Truthy sponsorshipNo → Yes (“authorized without requiring sponsorship”)
    profilePath = 'flags.sponsorshipNo';
    wantYes = true;
    key = 'sponsorship';
  } else if (/legally authorized|authorized to work/i.test(q)) {
    profilePath = 'flags.workAuthYes';
    wantYes = true;
    key = 'workAuth';
  } else if (/require sponsorship|future require sponsorship|need sponsorship/i.test(q)) {
    profilePath = 'flags.sponsorshipNo';
    wantYes = false;
    key = 'sponsorship';
  } else if (idx === 0) {
    profilePath = 'flags.workAuthYes';
    wantYes = true;
    key = 'workAuth';
  } else if (idx === 1) {
    profilePath = 'flags.sponsorshipNo';
    wantYes = false;
    key = 'sponsorship';
  } else {
    return null;
  }
  const btn = wantYes ? 'Yes' : 'No';
  return {
    key,
    required: true,
    profilePath: pickPath(profileKeys, [profilePath], profilePath),
    kind: 'radio',
    targets: [
      {
        kind: 'css',
        rank: 1,
        selector: `div.ashby-application-form-input-yesno >> nth=${idx} >> button:has-text("${btn}")`,
      },
    ],
    enumHints: c.options?.length ? c.options.slice(0, 40) : ['Yes', 'No'],
  };
}

/** Persist field-map under capabilities/field-maps/ (jail). Opt-in --write-field-map only. */
export function writeFieldMapById(root: string, map: FieldMap): string {
  if (!/^[A-Za-z0-9._-]+$/.test(map.id)) {
    throw new Error(`invalid field-map id: ${map.id}`);
  }
  mkdirSync(resolveUnderRoot(root, 'capabilities/field-maps', { realpath: true }), {
    recursive: true,
  });
  const path = resolveUnderRoot(root, `capabilities/field-maps/${map.id}.json`, { realpath: true });
  writeFileSync(path, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  return path;
}

/**
 * Persist bootstrap seed under gitignored `.private/field-maps/` (G12a / D7 — never auto-write tracked).
 */
export function writePrivateFieldMapById(root: string, map: FieldMap): string {
  if (!/^[A-Za-z0-9._-]+$/.test(map.id)) {
    throw new Error(`invalid field-map id: ${map.id}`);
  }
  mkdirSync(resolveUnderRoot(root, '.private/field-maps', { realpath: true }), { recursive: true });
  const path = resolveUnderRoot(root, `.private/field-maps/${map.id}.json`, { realpath: true });
  writeFileSync(path, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  return path;
}

/**
 * G16 / T-G-5: only persist site FieldMaps after at least one verified fill.
 * Evidence `field-map-proposed*.json` stays uncapped (debug). Submit-intent runs
 * should also wait for `submitConfirmed` when a submit was attempted.
 */
export function shouldPersistSiteFieldMap(opts: {
  verifiedCount: number;
  allowSubmit?: boolean;
  submitAttempted?: boolean;
  submitConfirmed?: boolean;
}): boolean {
  if (opts.verifiedCount < 1) return false;
  if (opts.allowSubmit && opts.submitAttempted && !opts.submitConfirmed) return false;
  return true;
}

export function selfCheckShouldSkipRepairLlm(): void {
  if (!shouldSkipRepairLlm({ allowLlm: false, uncoveredRequiredCount: 3 })) {
    throw new Error('allowLlm false must skip');
  }
  if (shouldSkipRepairLlm({ allowLlm: true, uncoveredRequiredCount: 3 })) {
    throw new Error('allowLlm true with gaps must not skip');
  }
  if (shouldSkipRepairLlm({ uncoveredRequiredCount: 2 })) {
    throw new Error('default allowLlm with gaps must not skip');
  }
  if (!shouldSkipRepairLlm({ allowLlm: true, uncoveredRequiredCount: 0 })) {
    throw new Error('zero uncovered required must skip');
  }
  // Reason strings must not matter — only the explicit flag.
  if (shouldSkipRepairLlm({ allowLlm: true, uncoveredRequiredCount: 1 })) {
    throw new Error('explicit allow must win over any historical reason sniff');
  }
}

export function selfCheckShouldPersistSiteFieldMap(): void {
  if (shouldPersistSiteFieldMap({ verifiedCount: 0 })) throw new Error('no verify → no persist');
  if (!shouldPersistSiteFieldMap({ verifiedCount: 1 })) throw new Error('verify → persist');
  if (
    shouldPersistSiteFieldMap({
      verifiedCount: 2,
      allowSubmit: true,
      submitAttempted: true,
      submitConfirmed: false,
    })
  ) {
    throw new Error('submit attempted without confirm → no persist');
  }
  if (
    !shouldPersistSiteFieldMap({
      verifiedCount: 2,
      allowSubmit: true,
      submitAttempted: true,
      submitConfirmed: true,
    })
  ) {
    throw new Error('submit confirmed → persist');
  }
  if (
    !shouldPersistSiteFieldMap({
      verifiedCount: 1,
      allowSubmit: true,
      submitAttempted: false,
      submitConfirmed: false,
    })
  ) {
    throw new Error('fill-only with allowSubmit unused → persist');
  }
}

/** Write proposed map into an evidence run dir (latest + id-tagged copy). */
export function writeProposedFieldMap(evidenceDir: string, map: FieldMap): string {
  const safeId = map.id.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'map';
  const tagged = join(evidenceDir, `field-map-proposed-${safeId}.json`);
  const latest = join(evidenceDir, 'field-map-proposed.json');
  const body = `${JSON.stringify(map, null, 2)}\n`;
  writeFileSync(tagged, body, 'utf8');
  writeFileSync(latest, body, 'utf8');
  return latest;
}

/** Self-check: few-shot loads ashby sibling and holds out sciemo mapId. */
export function selfCheckRepairFewShot(root = process.cwd()): void {
  const pack = loadRepairFewShot(root, 'ashby', 'prove-ashby-other');
  if (!pack.siblingFields?.length) throw new Error('few-shot ashby siblingFields empty');
  const hold = loadRepairFewShot(root, 'ashby', 'ashby-sciemo-auto');
  if (hold.siblingFields?.length) throw new Error('few-shot hold-out failed');
  const unk = loadRepairFewShot(root, 'unknown', 'any');
  if (unk.siblingFields?.length || unk.siblingReceiptKeys?.length) {
    throw new Error('unknown family must not load demo few-shot');
  }
}

/** Self-check: page filter keeps on-page fields only. */
export function selfCheckFilterFieldMapToControls(): void {
  const map: FieldMap = {
    schemaVersion: 1,
    id: 'filter-self-check',
    updatedAt: new Date().toISOString(),
    fields: [
      {
        key: 'email',
        required: true,
        profilePath: 'email',
        kind: 'text',
        targets: [{ kind: 'label', rank: 1, name: 'Email' }],
      },
      {
        key: 'offpage',
        required: true,
        profilePath: 'answers.offpage',
        kind: 'text',
        targets: [{ kind: 'label', rank: 1, name: 'Off page only' }],
      },
    ],
  };
  const controls: ControlHint[] = [
    { tag: 'input', label: 'Email', type: 'email', inputName: 'email', widget: 'text' },
  ];
  const filtered = filterFieldMapToControls(map, controls);
  if (filtered.fields.length !== 1 || filtered.fields[0]?.key !== 'email') {
    throw new Error(`filterFieldMapToControls expected [email], got ${filtered.fields.map((f) => f.key).join(',')}`);
  }
  const empty = filterFieldMapToControls(map, []);
  if (empty.fields.length !== 2) throw new Error('empty controls must keep full map');
  const drifted = filterFieldMapToControls(
    {
      ...map,
      fields: [
        ...map.fields,
        {
          key: 'planOnly',
          required: true,
          profilePath: '_plan.planOnly',
          kind: 'text',
          literal: 'KeepMe',
          targets: [{ kind: 'label', rank: 1, name: 'Does Not Match Any Control' }],
        },
      ],
    },
    controls,
  );
  if (!drifted.fields.some((f) => f.key === 'planOnly' && f.literal === 'KeepMe')) {
    throw new Error('filter must retain fields with literal under label drift');
  }
  const zeroMatch = filterFieldMapToControls(map, [
    { tag: 'input', label: 'Totally Other', type: 'text', inputName: 'other', widget: 'text' },
  ]);
  if (zeroMatch.fields.length !== 2) throw new Error('zero matches must fail-open to full map');
}

/** Self-check: replace merge keeps prior literal when LLM omits it. */
export function selfCheckMergeLiteralPreserve(): void {
  const base: FieldMap = {
    schemaVersion: 1,
    id: 'lit-merge',
    successBanner: 'Application received',
    updatedAt: new Date().toISOString(),
    fields: [
      {
        key: 'why',
        required: true,
        profilePath: '_plan.why',
        kind: 'textarea',
        literal: 'Because Bridge',
        targets: [{ kind: 'label', rank: 1, name: 'Why' }],
      },
    ],
  };
  const patched = mergeFieldMap(
    base,
    [
      {
        key: 'why',
        required: true,
        profilePath: '_plan.why',
        kind: 'textarea',
        targets: [{ kind: 'css', rank: 1, selector: "textarea[name='why']" }],
      },
    ],
    'lit-merge',
    { mode: 'replace' },
  );
  if (patched.fields[0]?.literal !== 'Because Bridge') throw new Error('replace must keep prior literal');
  if (patched.successBanner !== 'Application received') throw new Error('merge must keep successBanner');
}

/** Self-check: plan whyCompany literal survives heuristic additional shadowing. */
export function selfCheckDropShadowedKeepsLiteral(): void {
  const map: FieldMap = {
    schemaVersion: 1,
    id: 'shadow-lit',
    updatedAt: new Date().toISOString(),
    fields: [
      {
        key: 'whyCompany',
        required: false,
        profilePath: '_plan.whyCompany',
        kind: 'textarea',
        literal: 'Because Bridge works.',
        targets: [
          { kind: 'css', rank: 1, selector: "textarea[name='whyCompany']" },
          { kind: 'label', rank: 2, name: 'Why this company?' },
        ],
      },
      {
        key: 'additional',
        required: false,
        profilePath: 'answers.additional',
        kind: 'textarea',
        targets: [{ kind: 'css', rank: 1, selector: "textarea[name='whyCompany']" }],
      },
    ],
  };
  const controls: ControlHint[] = [
    {
      tag: 'textarea',
      label: 'Why this company?',
      inputName: 'whyCompany',
      id: 'whyCompany',
      widget: 'textarea',
    },
  ];
  const kept = dropShadowedFields(map, controls, ['answers.whyCompany', 'answers.additional']);
  const why = kept.fields.find((f) => f.key === 'whyCompany');
  if (!why || why.literal !== 'Because Bridge works.') {
    throw new Error('dropShadowedFields must keep plan whyCompany literal');
  }
  if (kept.fields.some((f) => f.key === 'additional')) {
    throw new Error('dropShadowedFields must drop non-literal rival on same selector');
  }
}

/** Self-check: plan literal must not steal a required heuristic owner. */
export function selfCheckDropShadowedBlocksHostileLiteral(): void {
  const map: FieldMap = {
    schemaVersion: 1,
    id: 'shadow-hostile',
    updatedAt: new Date().toISOString(),
    fields: [
      {
        key: 'evil',
        required: false,
        profilePath: '_plan.evil',
        kind: 'text',
        literal: 'Yes',
        targets: [{ kind: 'css', rank: 1, selector: '#workAuth' }],
      },
      {
        key: 'workAuth',
        required: true,
        profilePath: 'workAuth',
        kind: 'select',
        targets: [{ kind: 'css', rank: 1, selector: '#workAuth' }],
      },
    ],
  };
  const controls: ControlHint[] = [
    {
      tag: 'select',
      label: 'Work authorization',
      id: 'workAuth',
      inputName: 'workAuth',
      widget: 'select',
      required: true,
      options: ['Authorized', 'Needs sponsorship'],
    },
  ];
  const kept = dropShadowedFields(map, controls, ['workAuth']);
  if (kept.fields.some((f) => f.key === 'evil')) throw new Error('hostile literal must drop');
  if (!kept.fields.some((f) => f.key === 'workAuth')) throw new Error('required owner must remain');
}

/** Self-check: T-B-27/27b — keep required; drop colliding literal; still drop optional non-literal. */
export function selfCheckDropShadowedKeepsRequiredPass2(): void {
  const map: FieldMap = {
    schemaVersion: 1,
    id: 'shadow-req',
    updatedAt: new Date().toISOString(),
    fields: [
      {
        key: 'surveyExtra',
        required: false,
        profilePath: '_plan.surveyExtra',
        kind: 'text',
        literal: 'N/A',
        targets: [{ kind: 'css', rank: 1, selector: '#city' }],
      },
      {
        key: 'city',
        required: true,
        profilePath: 'city',
        kind: 'text',
        targets: [{ kind: 'css', rank: 1, selector: '#city' }],
      },
    ],
  };
  // No control owner for #city → ownerRequired unset; required city wins; literal drops.
  const kept = dropShadowedFields(map, [], ['city']);
  if (!kept.fields.some((f) => f.key === 'city')) {
    throw new Error('pass-2 must keep required:true even when literal shadows selector');
  }
  if (kept.fields.some((f) => f.key === 'surveyExtra')) {
    throw new Error('T-B-27b must drop plan literal colliding with required field');
  }
  // Negative: optional non-literal still drops when optional literal owns the selector.
  const optionalOnly: FieldMap = {
    schemaVersion: 1,
    id: 'shadow-opt',
    updatedAt: new Date().toISOString(),
    fields: [
      {
        key: 'surveyExtra',
        required: false,
        profilePath: '_plan.surveyExtra',
        kind: 'text',
        literal: 'N/A',
        targets: [{ kind: 'css', rank: 1, selector: '#notes' }],
      },
      {
        key: 'notes',
        required: false,
        profilePath: 'notes',
        kind: 'text',
        targets: [{ kind: 'css', rank: 1, selector: '#notes' }],
      },
    ],
  };
  const optKept = dropShadowedFields(optionalOnly, [], ['notes']);
  if (!optKept.fields.some((f) => f.key === 'surveyExtra')) {
    throw new Error('optional literal must remain when no required rival');
  }
  if (optKept.fields.some((f) => f.key === 'notes')) {
    throw new Error('optional non-literal must still drop under literal selector');
  }
}

/** Self-check: replace merge must not re-attach literal onto kind:file. */
export function selfCheckMergeFileDropsLiteral(): void {
  const base: FieldMap = {
    schemaVersion: 1,
    id: 'file-lit',
    updatedAt: new Date().toISOString(),
    fields: [
      {
        key: 'resume',
        required: true,
        profilePath: '_plan.resume',
        kind: 'text',
        literal: 'resume.pdf',
        targets: [{ kind: 'label', rank: 1, name: 'Resume' }],
      },
    ],
  };
  const patched = mergeFieldMap(
    base,
    [
      {
        key: 'resume',
        required: true,
        profilePath: 'resumePath',
        kind: 'file',
        targets: [{ kind: 'css', rank: 1, selector: "input[type='file']" }],
      },
    ],
    'file-lit',
    { mode: 'replace' },
  );
  const f = patched.fields[0];
  if (!f || f.kind !== 'file' || f.literal !== undefined || f.profilePath !== 'resumePath') {
    throw new Error('merge must strip literal and force resumePath on file');
  }
}

if (process.argv[1]?.endsWith('repair-field-map.ts') || process.argv[1]?.endsWith('repair-field-map.js')) {
  selfCheckRepairFewShot();
  selfCheckFilterFieldMapToControls();
  selfCheckMergeLiteralPreserve();
  selfCheckDropShadowedKeepsLiteral();
  selfCheckDropShadowedBlocksHostileLiteral();
  selfCheckDropShadowedKeepsRequiredPass2();
  selfCheckMergeFileDropsLiteral();
  selfCheckShouldPersistSiteFieldMap();
  selfCheckShouldSkipRepairLlm();
  console.log('repair-field-map few-shot self-check ok');
}
