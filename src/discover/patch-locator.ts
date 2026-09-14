/**
 * @file One LLM locator patch from a HITL resume note (P1b) — not a click transcript.
 */
import type { Page } from 'playwright';
import { z } from 'zod';
import {
  LocatorCandidateSchema,
  type Capability,
  type LocatorCandidate,
} from '../artifact/schema.js';
import type { RuntimeConfig } from '../config/schema.js';
import { log } from '../util/log.js';
import { callModel } from '../llm/call-model.js';

const PatchSchema = z
  .object({
    candidates: z.array(LocatorCandidateSchema).min(1),
  })
  .strict();

/**
 * Observe visible controls (same shape as discover) for patch grounding.
 */
async function observeControls(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const out: unknown[] = [];
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
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in model reply');
  return JSON.parse(text.slice(start, end + 1));
}


/**
 * Patch one target's candidates from operator note + live observation.
 * Mutates `capability.targets[targetKey]` in memory only (humanActionsRecorded stays false).
 * @returns whether a patch was applied
 */
export async function patchTargetFromNote(opts: {
  page: Page;
  capability: Capability;
  targetKey: string;
  note: string;
  config: RuntimeConfig;
}): Promise<{ patched: boolean; llmCalls: number; detail: string }> {
  const { page, capability, targetKey, note, config } = opts;
  const target = capability.targets[targetKey];
  if (!target) {
    return { patched: false, llmCalls: 0, detail: `unknown target ${targetKey}` };
  }
  if (!note.trim()) {
    return { patched: false, llmCalls: 0, detail: 'empty resume note' };
  }
  const controls = await observeControls(page);
  const pageText = (await page.locator('body').innerText()).slice(0, 1200);
  const system = `Return ONLY JSON {"candidates":[...]} for ONE UI control.
Each candidate: kind+rank and optional role|name|text|exact|selector|score.
Prefer label/role/text from observation; css last. No markdown.`;
  const user = JSON.stringify({
    targetKey,
    operatorNote: note.slice(0, 400),
    pageText,
    controls,
  });

  log('info', 'hitl locator patch', { targetKey, noteChars: note.length });
  const reply = await callModel(config, system, user, { json: true, ollamaFormat: {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string' },
            rank: { type: 'integer' },
            role: { type: 'string' },
            name: { type: 'string' },
            text: { type: 'string' },
            exact: { type: 'boolean' },
            selector: { type: 'string' },
            score: { type: 'number' },
          },
          required: ['kind', 'rank'],
        },
      },
    },
    required: ['candidates'],
  } });
  if (!reply.ok) {
    return { patched: false, llmCalls: 1, detail: `model failed: ${reply.text}` };
  }
  try {
    const parsed = PatchSchema.parse(extractJsonObject(reply.text));
    const candidates = parsed.candidates as LocatorCandidate[];
    capability.targets[targetKey] = {
      ...target,
      candidates,
    };
    return { patched: true, llmCalls: 1, detail: `patched ${candidates.length} candidates` };
  } catch (e) {
    return {
      patched: false,
      llmCalls: 1,
      detail: `invalid patch JSON: ${(e as Error).message}`,
    };
  }
}

/**
 * Resolve target key for a step that failed with a `$ref`.
 */
export function targetKeyFromStep(
  capability: Capability,
  stepId: string | undefined,
): string | undefined {
  if (!stepId) return undefined;
  const step = capability.steps.find((s) => s.id === stepId);
  if (!step) return undefined;
  if (step.action === 'fill' || step.action === 'click' || step.action === 'extract') {
    return step.target.$ref.replace('#/targets/', '');
  }
  return undefined;
}
