/**
 * @file Opt-in HITL action recorder (P3 teach) — DOM clicks → locator candidates.
 */
import type { Page } from 'playwright';
import type { Capability, LocatorCandidate } from '../artifact/schema.js';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type RecordedAction = {
  at: string;
  kind: 'click';
  tag: string;
  role: string | null;
  name: string | null;
  text: string | null;
  css: string | null;
};

/**
 * Attach a capturing click listener for the HITL pause window.
 * @returns detach function
 */
export async function startActionRecorder(page: Page): Promise<{
  stop: () => Promise<RecordedAction[]>;
}> {
  const sink: RecordedAction[] = [];
  await page.exposeFunction('__cuaRecordAction', (payload: RecordedAction) => {
    sink.push(payload);
  });
  // Browser-side script as string so tsc doesn't typecheck DOM APIs here.
  await page.evaluate(`(() => {
    const cssPath = (el) => {
      if (!el || el.nodeType !== 1) return null;
      if (el.id) return '#' + CSS.escape(el.id);
      const name = el.getAttribute('name');
      if (name && el.tagName === 'INPUT') return "input[name='" + name + "']";
      const df = el.getAttribute('data-field');
      if (df) return "[data-field='" + df + "']";
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === 1 && parts.length < 5) {
        let part = cur.tagName.toLowerCase();
        const parent = cur.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
          if (siblings.length > 1) {
            part += ':nth-of-type(' + (siblings.indexOf(cur) + 1) + ')';
          }
        }
        parts.unshift(part);
        cur = parent;
        if (cur && cur.tagName === 'BODY') break;
      }
      return parts.length ? parts.join('>') : null;
    };
    document.addEventListener('click', (ev) => {
      const t = ev.target;
      if (!t || t.nodeType !== 1) return;
      const role = t.getAttribute('role');
      const name = t.getAttribute('aria-label') || t.getAttribute('name') || (t.name || null);
      const text = ((t.innerText || t.textContent || '') + '').trim().slice(0, 80) || null;
      window.__cuaRecordAction({
        at: new Date().toISOString(),
        kind: 'click',
        tag: t.tagName.toLowerCase(),
        role,
        name,
        text,
        css: cssPath(t),
      });
    }, true);
  })()`);

  return {
    stop: async () => sink.slice(),
  };
}

/**
 * Persist recorded actions under hitl/actions.json.
 */
export function writeRecordedActions(runDir: string, actions: RecordedAction[]): string {
  const dir = join(runDir, 'hitl');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'actions.json');
  writeFileSync(
    path,
    JSON.stringify({ schemaVersion: 1, recordedAt: new Date().toISOString(), actions }, null, 2) +
      '\n',
  );
  return path;
}

export function readRecordedActions(runDir: string): RecordedAction[] {
  const path = join(runDir, 'hitl', 'actions.json');
  if (!existsSync(path)) return [];
  const body = JSON.parse(readFileSync(path, 'utf8')) as { actions?: RecordedAction[] };
  return Array.isArray(body.actions) ? body.actions : [];
}

/**
 * Turn recorded clicks into ranked locator candidates (css preferred, then role/text).
 */
export function candidatesFromRecorded(actions: RecordedAction[]): LocatorCandidate[] {
  const out: LocatorCandidate[] = [];
  let rank = 1;
  for (const a of actions) {
    if (a.css) {
      out.push({ kind: 'css', rank: rank++, selector: a.css });
    }
    if (a.role && a.name) {
      out.push({ kind: 'role', rank: rank++, role: a.role, name: a.name, exact: true });
    } else if (a.text) {
      out.push({ kind: 'text', rank: rank++, text: a.text, exact: false });
    }
  }
  return out;
}

/**
 * Prepend recorded candidates onto a stuck target (in-memory).
 * @returns whether the target was updated
 */
export function applyRecordedToTarget(
  capability: Capability,
  targetKey: string,
  actions: RecordedAction[],
): { applied: boolean; detail: string } {
  const target = capability.targets[targetKey];
  if (!target) return { applied: false, detail: `unknown target ${targetKey}` };
  const extra = candidatesFromRecorded(actions);
  if (!extra.length) return { applied: false, detail: 'no usable recorded actions' };
  // ponytail: ceiling = naive prepend; upgrade = verify live uniqueness before merge
  const shifted = target.candidates.map((c) => ({ ...c, rank: c.rank + extra.length }));
  capability.targets[targetKey] = {
    ...target,
    candidates: [...extra, ...shifted],
  };
  return { applied: true, detail: `prepended ${extra.length} candidates from ${actions.length} actions` };
}
