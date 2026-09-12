/**
 * @file Greenhouse Job Board API introspect — public questions → enumHints for observe/repair.
 * Playwright remains primary; this only boosts select/combobox option labels (no submit).
 */
import type { ControlHint } from './observe-controls.js';

const BOARDS_API = 'https://boards-api.greenhouse.io/v1/boards';

export type GreenhouseQuestion = {
  label: string;
  required: boolean;
  name: string;
  type: string;
  values: string[];
};

/** Parse board token + job id from common Greenhouse hosted / embed URLs. */
export function parseGreenhouseJobUrl(url: string): { token: string; jobId: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    // Anchor labels so evilgreenhouse.io / notgreenhouse.io do not match.
    if (!/(^|\.)greenhouse\.io$/.test(host) && host !== 'grnh.se') return null;

    const embedFor = u.searchParams.get('for');
    const embedToken = u.searchParams.get('token');
    if (embedFor && embedToken && /embed|job_app/i.test(u.pathname)) {
      return { token: embedFor, jobId: embedToken };
    }

    // /{token}/jobs/{id} or /embed/...
    const m = u.pathname.match(/\/([^/]+)\/jobs\/(\d+)/i);
    if (m?.[1] && m[2]) return { token: m[1], jobId: m[2] };
    return null;
  } catch {
    return null;
  }
}

function valueLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string' && v.trim()) out.push(v.trim());
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const lab = String(o.label ?? o.value ?? '').trim();
      if (lab && !/^select/i.test(lab)) out.push(lab);
    }
  }
  return out.slice(0, 60);
}

/** GET boards-api job + questions (no auth). Soft-fail → []. */
export async function fetchGreenhouseQuestions(
  token: string,
  jobId: string,
  opts?: { timeoutMs?: number },
): Promise<GreenhouseQuestion[]> {
  const url = `${BOARDS_API}/${encodeURIComponent(token)}/jobs/${encodeURIComponent(jobId)}?questions=true`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 8_000),
    });
    if (!res.ok) return [];
    const job = (await res.json()) as {
      questions?: Array<{
        label?: string;
        required?: boolean;
        fields?: Array<{ name?: string; type?: string; values?: unknown }>;
      }>;
    };
    const out: GreenhouseQuestion[] = [];
    for (const q of job.questions ?? []) {
      const f = q.fields?.[0] ?? {};
      const values = valueLabels(f.values);
      out.push({
        label: (q.label || '').trim(),
        required: Boolean(q.required),
        name: String(f.name || ''),
        type: String(f.type || ''),
        values,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function normLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Attach boards-api option labels onto controls that lack `options` (react-select / empty select).
 * Match by label / question / name; never overwrite non-empty live options.
 */
export function mergeGreenhouseOptions(
  controls: ControlHint[],
  questions: GreenhouseQuestion[],
): ControlHint[] {
  if (!questions.length) return controls;
  const byLabel = new Map<string, GreenhouseQuestion>();
  for (const q of questions) {
    if (!q.label || !q.values.length) continue;
    byLabel.set(normLabel(q.label), q);
  }

  return controls.map((c) => {
    if (c.options?.length) return c;
    if (c.widget !== 'select' && c.widget !== 'combobox' && c.tag !== 'select') return c;
    const keys = [c.label, c.question, c.name, c.placeholder]
      .filter((x): x is string => Boolean(x && String(x).trim()))
      .map((x) => normLabel(String(x)));
    let hit: GreenhouseQuestion | undefined;
    for (const k of keys) {
      hit = byLabel.get(k);
      if (hit) break;
      // soft contains: API label contained in control label or vice versa
      for (const [lab, q] of byLabel) {
        if (k.includes(lab) || lab.includes(k)) {
          hit = q;
          break;
        }
      }
      if (hit) break;
    }
    if (!hit?.values.length) return c;
    return { ...c, options: hit.values.slice(0, 40) };
  });
}

/** Parse URL → fetch → merge. No-op when not a Greenhouse job URL. */
export async function enrichControlsFromGreenhouseApi(
  pageUrl: string,
  controls: ControlHint[],
): Promise<ControlHint[]> {
  const parsed = parseGreenhouseJobUrl(pageUrl);
  if (!parsed) return controls;
  const questions = await fetchGreenhouseQuestions(parsed.token, parsed.jobId);
  return mergeGreenhouseOptions(controls, questions);
}

/** Self-check parse + merge (no network). */
export function selfCheckGreenhouseBoards(): void {
  const p = parseGreenhouseJobUrl('https://job-boards.greenhouse.io/gumgum/jobs/7811964003');
  if (!p || p.token !== 'gumgum' || p.jobId !== '7811964003') throw new Error('parse job-boards');
  const embed = parseGreenhouseJobUrl(
    'https://boards.greenhouse.io/embed/job_app?for=figma&token=12345',
  );
  if (!embed || embed.token !== 'figma' || embed.jobId !== '12345') throw new Error('parse embed');
  const merged = mergeGreenhouseOptions(
    [
      {
        tag: 'input',
        widget: 'combobox',
        label: 'Country*',
      },
      {
        tag: 'select',
        widget: 'select',
        label: 'Already has',
        options: ['A'],
      },
    ],
    [
      { label: 'Country', required: true, name: 'country', type: 'multi_value_single_select', values: ['United States', 'Canada'] },
      { label: 'Already has', required: false, name: 'x', type: 'multi_value_single_select', values: ['B'] },
    ],
  );
  if (merged[0]?.options?.[0] !== 'United States') throw new Error('merge country');
  if (merged[1]?.options?.[0] !== 'A') throw new Error('must not overwrite live options');
}

if (
  process.argv[1]?.endsWith('greenhouse-boards.ts') ||
  process.argv[1]?.endsWith('greenhouse-boards.js')
) {
  selfCheckGreenhouseBoards();
  console.log('greenhouse-boards self-check ok');
}
