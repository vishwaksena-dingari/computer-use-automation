/**
 * @file Import upstream plan JSON → FieldMap (P2 + Bridge adapters).
 * Planning stays outside this repo. Accepts cua-native + common ATS plan aliases.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import {
  FieldMapSchema,
  PlanJsonSchema,
  type FieldMap,
  type FieldMapField,
  type PlanStep,
} from './schema.js';
import { isOpaqueProfilePath } from './profile.js';

/** FieldMap ids must be path-safe (no traversal). */
export function assertSafeFieldMapId(id: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error(`invalid field-map id: ${id}`);
  }
}

function kindFromType(t: string | undefined): FieldMapField['kind'] {
  const x = (t ?? 'text').toLowerCase();
  if (x.includes('textarea') || x === 'longtext' || x === 'long_text') return 'textarea';
  if (x.includes('select') || x === 'dropdown' || x === 'enum') return 'select';
  if (x.includes('check') || x === 'boolean') return 'checkbox';
  if (x.includes('radio')) return 'radio';
  if (x.includes('file') || x.includes('resume') || x.includes('upload') || x === 'pdf') return 'file';
  if (x === 'email' || x === 'string' || x === 'phone' || x === 'url') return 'text';
  return 'text';
}

/** Normalize one step: path/name, label/title, required/isRequired. */
export function normalizePlanStep(step: PlanStep, index: number): PlanStep & { path: string } {
  const path = String(step.path ?? step.name ?? '').trim();
  if (!path) throw new Error(`plan step ${index} missing path/name`);
  return {
    ...step,
    path,
    label: (step.label ?? step.title)?.toString().trim() || undefined,
    required: step.required ?? step.isRequired,
  };
}

/** Escape a value for use inside a single-quoted CSS attribute selector. */
function cssAttrQuote(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** True if selector is a brittle UUID-ish id (must not be rank 1). */
export function isUuidCssSelector(sel: string): boolean {
  return /^#[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sel.trim());
}

/**
 * Build ranked targets: name= / label first; UUID css only as low-rank fallback.
 */
export function targetsForPlanStep(step: PlanStep & { path: string }): FieldMapField['targets'] {
  const targets: FieldMapField['targets'] = [];
  let rank = 1;
  if (step.label?.trim()) {
    targets.push({ kind: 'label', rank: rank++, name: step.label.trim() });
  }
  const q = cssAttrQuote(step.path);
  const nameSel = `input[name='${q}'], textarea[name='${q}'], select[name='${q}']`;
  targets.push({ kind: 'css', rank: rank++, selector: nameSel });
  if (isUuidCssSelector(`#${step.path}`)) {
    targets.push({ kind: 'css', rank: Math.max(rank, 3), selector: `#${cssAttrQuote(step.path)}` });
  } else if (/^[A-Za-z_][\w-]*$/.test(step.path)) {
    targets.push({ kind: 'css', rank: rank++, selector: `#${step.path}` });
  }
  return targets;
}

function literalFromValue(value: unknown): string | number | boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    if (value.startsWith('profile.')) return undefined;
    if (value.trim() === '') return undefined;
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return undefined;
}

/** Convert plan JSON → FieldMap (Zod fail-closed). */
export function importPlanToFieldMap(
  raw: unknown,
  opts: { id: string; platform?: string; companyKey?: string },
): FieldMap {
  assertSafeFieldMapId(opts.id);
  const parsedPlan = PlanJsonSchema.safeParse(raw ?? {});
  if (!parsedPlan.success) {
    throw new Error(`plan JSON invalid: ${parsedPlan.error.message}`);
  }
  const plan = parsedPlan.data;
  const primary = plan.plan ?? plan.fields ?? [];
  const survey = plan.surveyPlan ?? [];
  const steps = [...primary, ...survey];
  const fields: FieldMapField[] = steps.map((rawStep, i) => {
    const step = normalizePlanStep(rawStep, i);
    const kind = kindFromType(step.type);
    // File uploads must come from profile resumePath — never plan literal paths (exfil).
    const literal = kind === 'file' ? undefined : literalFromValue(step.value);
    let profilePath =
      kind === 'file'
        ? 'resumePath'
        : typeof step.profilePath === 'string' && step.profilePath.trim()
          ? step.profilePath.trim()
          : typeof step.value === 'string' && step.value.startsWith('profile.')
            ? step.value.slice('profile.'.length)
            : literal !== undefined
              ? `_plan.${step.path}`
              : step.path;
    if (kind !== 'file' && isOpaqueProfilePath(profilePath, [])) {
      throw new Error(`plan profilePath not allowed: ${profilePath}`);
    }
    return {
      key: step.path.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 64) || `field_${i}`,
      required: step.required !== false,
      profilePath,
      kind,
      targets: targetsForPlanStep(step),
      ...(literal !== undefined ? { literal } : {}),
    };
  });
  const map = {
    schemaVersion: 1 as const,
    id: opts.id,
    platform: opts.platform ?? plan.ats ?? 'imported',
    companyKey: opts.companyKey,
    successBanner: plan.successBanner?.trim() || undefined,
    updatedAt: new Date().toISOString(),
    fields,
  };
  const parsed = FieldMapSchema.safeParse(map);
  if (!parsed.success) {
    throw new Error(`imported field-map invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Write FieldMap JSON under capabilities/field-maps/. */
export function writeImportedFieldMap(root: string, map: FieldMap): string {
  assertSafeFieldMapId(map.id);
  const dir = resolve(root, 'capabilities', 'field-maps');
  const out = resolve(dir, `${map.id}.json`);
  const rel = relative(dir, out);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`field-map path escapes field-maps/: ${map.id}`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(out, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  return out;
}

/** Self-check: UUID css never rank 1; name/title aliases work. */
export function selfCheckImportPlan(): void {
  const map = importPlanToFieldMap(
    {
      ats: 'ashby',
      successBanner: 'Application submitted',
      plan: [
        { path: 'email', type: 'text', label: 'Email', profilePath: 'email' },
        { path: '99fc1234-5678-90ab-cdef-1234567890ab', type: 'text', profilePath: 'fullName' },
        { name: 'first_name', title: 'First name', type: 'String', isRequired: true, value: 'Alex' },
        { name: "x'], input[type=file], [name='y", title: 'Evil', type: 'text', value: 'nope' },
        { path: 'resume', type: 'pdf', value: '.env', isRequired: true },
      ],
      surveyPlan: [{ path: 'eeo', title: 'EEO', type: 'select', value: 'Decline' }],
    },
    { id: 'import-self-check' },
  );
  const email = map.fields.find((f) => f.key === 'email');
  if (!email || email.targets[0]?.kind !== 'label') throw new Error('label should rank 1');
  const uuidField = map.fields.find((f) => f.key.includes('99fc'));
  const uuidTarget = uuidField?.targets.find((t) => t.kind === 'css' && t.selector?.startsWith('#'));
  if (uuidTarget && (uuidTarget.rank ?? 99) < 3) throw new Error('UUID css must be rank >= 3');
  const first = map.fields.find((f) => f.key === 'first_name');
  if (!first?.literal || first.literal !== 'Alex') throw new Error('name/title/value aliases');
  if (first.targets[0]?.kind !== 'label' || first.targets[0]?.name !== 'First name') {
    throw new Error('title→label');
  }
  if (map.successBanner !== 'Application submitted') throw new Error('successBanner');
  const evil = map.fields.find((f) => (f.targets[0] as { name?: string } | undefined)?.name === 'Evil');
  if (!evil) throw new Error('evil field missing');
  const sel = evil.targets.find((t) => t.kind === 'css' && t.selector?.includes('[name='))?.selector ?? '';
  if (sel.includes("name='x']")) throw new Error(`css injection not escaped: ${sel}`);
  if (!sel.includes("\\'")) throw new Error(`expected escaped quote in selector: ${sel}`);
  const resume = map.fields.find((f) => f.key === 'resume');
  if (!resume || resume.kind !== 'file' || resume.literal !== undefined || resume.profilePath !== 'resumePath') {
    throw new Error('file plan must not carry literal');
  }
  const eeo = map.fields.find((f) => f.key === 'eeo');
  if (!eeo?.literal || eeo.literal !== 'Decline') throw new Error('surveyPlan merge');
  let opaqueThrew = false;
  try {
    importPlanToFieldMap(
      { plan: [{ path: 'q1', type: 'text', profilePath: 'ssn', value: 'x' }] },
      { id: 'opaque-check' },
    );
  } catch {
    opaqueThrew = true;
  }
  if (!opaqueThrew) throw new Error('opaque plan profilePath must throw');
  const fileForced = importPlanToFieldMap(
    { plan: [{ path: 'resume', type: 'file', profilePath: 'email', isRequired: true }] },
    { id: 'file-path-force' },
  );
  const rf = fileForced.fields.find((f) => f.key === 'resume');
  if (!rf || rf.profilePath !== 'resumePath') throw new Error('file import must force resumePath');
}

if (process.argv[1]?.endsWith('import-plan.ts') || process.argv[1]?.endsWith('import-plan.js')) {
  selfCheckImportPlan();
  console.log('import-plan self-check ok');
}
