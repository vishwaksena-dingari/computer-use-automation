/**
 * @file Shared a11y/control observation for discover + hybrid field-map repair.
 * ***REMOVED***

 *
 * Browser body is a Function string so tsx/esbuild `__name` helpers never leak into
 * Playwright's page.evaluate serialization (breaks Ashby and other CSP-ish pages).
 */
import type { Page } from 'playwright';

export type ControlHint = {
  tag: string;
  role?: string | null;
  name?: string | null;
  label?: string | null;
  type?: string | null;
  inputName?: string | null;
  placeholder?: string | null;
  dataField?: string | null;
  text?: string | null;
  required?: boolean;
  id?: string | null;
  /** Nearby question / legend text (Ashby yes-no / radio groups). */
  question?: string | null;
  /** radio | checkbox | file | text | select | textarea | yesno | combobox | other */
  widget?: string | null;
  value?: string | null;
  /** Live selectable labels (select options, radio group, Yes/No). */
  options?: string[];
};

const MAX_CONTROLS = 120;

/** Browser-side observer — keep as Function so Playwright serializes without __name. */
const observeInBrowser = new Function(
  'max',
  `"use strict";
  const out = [];
  const seen = new Set();

  const nearestQuestion = (el) => {
    let cur = el;
    for (let i = 0; i < 8 && cur; i++) {
      const prev = cur.previousElementSibling;
      if (prev) {
        const t = (prev.innerText || prev.textContent || '').trim().replace(/\\s+/g, ' ');
        if (t.length >= 8 && t.length <= 200) return t.slice(0, 160);
      }
      const labeled = cur.closest('[class*="field"],[class*="question"],fieldset,section');
      if (labeled && labeled !== cur) {
        const head = labeled.querySelector('label,h1,h2,h3,h4,legend,p');
        const t = (head && head.textContent ? head.textContent : '').trim().replace(/\\s+/g, ' ');
        if (t.length >= 4 && t.length <= 200) return t.slice(0, 160);
      }
      cur = cur.parentElement;
    }
    return null;
  };

  const labelFor = (html) => {
    const id = html.id;
    if (id) {
      const lab = document.querySelector('label[for="' + CSS.escape(id) + '"]');
      const t = lab && lab.textContent ? lab.textContent.trim() : '';
      if (t) return t.replace(/\\s+/g, ' ').slice(0, 120);
    }
    const wrap = html.closest('label');
    if (wrap) {
      const t = (wrap.textContent || '').trim().replace(/\\s+/g, ' ');
      if (t) return t.slice(0, 120);
    }
    const aria = html.getAttribute('aria-label');
    if (aria) return aria.slice(0, 120);
    return null;
  };

  const push = (html, widget) => {
    if (seen.has(html) || out.length >= max) return;
    if (html.closest('[hidden]')) return;
    seen.add(html);
    const id = html.id || null;
    const label = labelFor(html);
    const required =
      html.hasAttribute('required') ||
      html.getAttribute('aria-required') === 'true' ||
      (label ? /\\*/.test(label) : false) ||
      html.getAttribute('aria-invalid') === 'true';
    const input = html;
    let options;
    if (widget === 'select' && html.tagName === 'SELECT') {
      options = Array.from(html.options)
        .map((o) => (o.label || o.textContent || o.value || '').trim())
        .filter((t) => t && !/^select/i.test(t));
    } else if (widget === 'radio' && input.name) {
      options = Array.from(
        document.querySelectorAll('input[type="radio"][name="' + CSS.escape(input.name) + '"]'),
      )
        .map((r) => (labelFor(r) || r.value || '').trim())
        .filter(Boolean);
    }
    out.push({
      tag: html.tagName.toLowerCase(),
      role: html.getAttribute('role'),
      name: html.getAttribute('aria-label') || html.getAttribute('name'),
      label,
      type: html.getAttribute('type'),
      inputName: html.getAttribute('name'),
      placeholder: html.getAttribute('placeholder'),
      dataField: html.getAttribute('data-field') || html.getAttribute('data-automation-id'),
      text: (html.innerText || html.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80) || null,
      required,
      id,
      question: nearestQuestion(html),
      widget,
      value: input.value || html.getAttribute('value'),
      options: options && options.length ? options.slice(0, 40) : undefined,
    });
  };

  for (const el of Array.from(
    document.querySelectorAll(
      'input, select, textarea, [role="combobox"], [role="listbox"], [role="spinbutton"], [contenteditable="true"]',
    ),
  )) {
    const html = el;
    const type = (html.getAttribute('type') || '').toLowerCase();
    if (type === 'hidden' && html.getAttribute('name') !== 'g-recaptcha-response') continue;
    if (html.id && html.id.startsWith('g-recaptcha')) continue;
    if (html.classList.contains('g-recaptcha-response')) continue;
    let widget = 'other';
    if (html.tagName === 'SELECT') widget = 'select';
    else if (html.tagName === 'TEXTAREA') widget = 'textarea';
    else if (type === 'file') widget = 'file';
    else if (type === 'radio') widget = 'radio';
    else if (type === 'checkbox') widget = 'checkbox';
    else if (html.getAttribute('role') === 'combobox') widget = 'combobox';
    else if (html.getAttribute('role') === 'listbox') widget = 'select';
    else if (html.getAttribute('role') === 'spinbutton') widget = 'text';
    else if (html.getAttribute('contenteditable') === 'true') widget = 'textarea';
    else if (type === 'submit' || type === 'button') continue;
    else if (type === 'tel' || type === 'email') widget = 'text';
    else if (type === 'number' || html.getAttribute('inputmode') === 'numeric') widget = 'text';
    else widget = 'text';
    push(html, widget);
  }

  for (const btn of Array.from(document.querySelectorAll('button'))) {
    if (out.length >= max) break;
    const t = (btn.textContent || '').trim();
    if (!/^Select One$/i.test(t) && !/select one/i.test(btn.getAttribute('aria-label') || '')) continue;
    if (btn.closest('[hidden]')) continue;
    push(btn, 'select');
  }

  for (const box of Array.from(document.querySelectorAll('.ashby-application-form-input-yesno'))) {
    if (out.length >= max) break;
    const q = nearestQuestion(box);
    const btns = Array.from(box.querySelectorAll('button')).map((b) => (b.textContent || '').trim());
    if (!btns.includes('Yes') && !btns.includes('No')) continue;
    const idx = Array.from(document.querySelectorAll('.ashby-application-form-input-yesno')).indexOf(box);
    out.push({
      tag: 'div',
      role: 'group',
      name: 'yesno-' + idx,
      label: q,
      type: 'yesno',
      inputName: (box.querySelector('input') && box.querySelector('input').getAttribute('name')) || null,
      placeholder: null,
      dataField: null,
      text: btns.join('/'),
      required: true,
      id: null,
      question: q,
      widget: 'yesno',
      value: String(idx),
      options: btns.filter(Boolean),
    });
  }

  return out;
`,
) as (max: number) => ControlHint[];

/**
 * Snapshot interactive controls for LLM / heuristic field-map emit.
 */
export async function observeControls(page: Page): Promise<ControlHint[]> {
  return page.evaluate(observeInBrowser, MAX_CONTROLS);
}
