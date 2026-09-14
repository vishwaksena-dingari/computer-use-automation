/**
 * @file Post-fill verification + durable fill receipt (redacted) for self-sufficient forms.
 * Goal: know input type → what to put → where → prove it stuck → keep a copy.
 */
import type { Page, Locator } from 'playwright';
import type { FieldMapField } from './schema.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type FillReceiptEntry = {
  key: string;
  profilePath: string;
  kind: FieldMapField['kind'];
  /** Redacted value we intended to write. */
  expected: string;
  /** Redacted value read back from the control (or widget). */
  actual: string;
  verified: boolean;
  detail?: string;
};

/** Machine-readable stop reason for evidence / prove dashboards (null = happy or unclassified). */
export type FillBlocker = 'captcha' | 'closed' | 'widget' | 'missing_required' | 'verify';

export type FillReceipt = {
  schemaVersion: 1;
  at: string;
  pageUrl?: string;
  entries: FillReceiptEntry[];
  filledKeys: string[];
  unverifiedRequired: string[];
  /** Optional FieldMap keys skipped when profile path empty (not a failure). */
  skippedOptional?: string[];
  /** Required profile paths that blocked the run (actionable minimum ask). */
  missingRequiredPaths?: string[];
  /** Set when the fill/flow stopped for a known class of failure. */
  blocker?: FillBlocker | null;
};

/** Keys that are required but present in receipt as unverified (pre-submit gate). */
export function unverifiedRequiredKeys(
  entries: Array<{ key: string; verified: boolean }>,
  requiredKeys: string[],
): string[] {
  const req = new Set(requiredKeys);
  return [
    ...new Set(entries.filter((e) => req.has(e.key) && !e.verified).map((e) => e.key)),
  ];
}

/** Pull required profile paths from a fail detail string. */
export function parseMissingRequiredPaths(detail: string): string[] {
  const multi = /missing required profile paths:\s*(.+)$/i.exec(detail);
  if (multi?.[1]) {
    return multi[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const one = /required profile path empty:\s*(.+)$/i.exec(detail);
  if (one?.[1]) return [one[1].trim()];
  return [];
}

/** Map a human `detail` string into a coarse blocker enum. */
export function classifyFillBlocker(detail: string): FillBlocker | null {
  const d = detail.toLowerCase();
  if (/captcha|recaptcha|hcaptcha|cf-turnstile/.test(d)) return 'captcha';
  if (/no longer accepting|position (is )?closed|job closed|404|not accepting applications/.test(d))
    return 'closed';
  if (/multiselect failed|select failed|combobox|react-select|widget/.test(d)) return 'widget';
  if (/missing required profile|required profile path empty|required field (not visible|locator)|empty fill/.test(d))
    return 'missing_required';
  if (/verify failed|verify mismatch|submit blocked: unverified required/.test(d)) return 'verify';
  return null;
}

/** Build a receipt object (adds `blocker` from optional fail detail). */
export function buildFillReceipt(opts: {
  pageUrl?: string;
  entries: FillReceiptEntry[];
  filledKeys: string[];
  unverifiedRequired: string[];
  failDetail?: string;
  skippedOptional?: string[];
}): FillReceipt {
  const missingRequiredPaths = opts.failDetail
    ? parseMissingRequiredPaths(opts.failDetail)
    : [];
  return {
    schemaVersion: 1,
    at: new Date().toISOString(),
    pageUrl: opts.pageUrl,
    entries: opts.entries,
    filledKeys: opts.filledKeys,
    unverifiedRequired: opts.unverifiedRequired,
    skippedOptional: opts.skippedOptional?.length ? opts.skippedOptional : undefined,
    missingRequiredPaths: missingRequiredPaths.length ? missingRequiredPaths : undefined,
    blocker: opts.failDetail ? classifyFillBlocker(opts.failDetail) : null,
  };
}

/** Redact secrets / PII for evidence receipts (never store raw passwords). */
export function redactForReceipt(profilePath: string, value: string): string {
  if (!value) return '';
  if (/password|secret|token|ssn|cvv/i.test(profilePath)) return '[redacted]';
  if (/email/i.test(profilePath) && value.includes('@')) {
    // Hide domain too — partial local+full domain still identifies a real mailbox.
    return 'a***@example.test';
  }
  if (/phone/i.test(profilePath)) return value.replace(/\d(?=\d{4})/g, '*');
  if (value.length > 96) return `${value.slice(0, 96)}…`;
  return value;
}

/**
 * Read back a control's current value for verify-after-fill.
 * Workday / custom widgets may need formField-scoped fallbacks.
 */
export async function readControlValue(
  page: Page,
  loc: Locator,
  field: FieldMapField,
): Promise<string> {
  if (field.kind === 'checkbox' || field.kind === 'radio') {
    const checked = await loc.isChecked().catch(() => false);
    return checked ? 'yes' : 'no';
  }
  if (field.kind === 'file') {
    // Browser file inputs don't expose path; treat successful setInputFiles as ok upstream.
    return '[file-set]';
  }
  const inputVal = await loc.inputValue().catch(() => '');
  if (inputVal) return inputVal;
  // Selected chip / prompt label inside nearest formField
  const formField = page.locator(`[data-automation-id^="formField-"]`).filter({ has: loc }).first();
  if ((await formField.count()) > 0) {
    const chip = (
      await formField.locator('[data-automation-id="selectedItem"]').allTextContents().catch(() => [] as string[])
    ).join(' ');
    if (chip.trim()) return chip.replace(/\s+/g, ' ').trim();
    const label = await formField
      .locator('[data-automation-id="promptSelectionLabel"]')
      .innerText()
      .catch(() => '');
    if (label.trim() && !/^0\s*item/i.test(label)) return label.replace(/\s+/g, ' ').trim();
  }
  const text = await loc.innerText().catch(() => '');
  return text.replace(/\s+/g, ' ').trim();
}

/** True when actual looks like it contains the expected fill (loose match). */
export function valuesMatch(
  expected: string,
  actual: string,
  kind: FieldMapField['kind'],
  profilePath = '',
): boolean {
  if (kind === 'file') return actual === '[file-set]' || actual.length > 0;
  if (kind === 'checkbox' || kind === 'radio') {
    const wantYes = /^(true|1|yes)$/i.test(expected.trim());
    const gotYes = /^(yes|true|1)$/i.test(actual.trim());
    return wantYes === gotYes;
  }
  const e = expected.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const a = actual.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!e) return true;
  if (!a) return false;
  // Location first — avoid `e.includes(a)` false pass when actual is a short state code ("ny").
  if (/location|city|address/i.test(profilePath)) {
    if (a === e || a.startsWith(e + ',') || a.startsWith(e + ' ')) return true;
    const city = e.split(',')[0]?.trim() ?? '';
    // Ashby-class: "New York, NY" → "New York City, New York, United States"
    if (city.length >= 3 && (a === city || a.startsWith(city + ',') || a.startsWith(city + ' '))) {
      return true;
    }
    return false;
  }
  if (a.includes(e) || e.includes(a)) return true;
  // phone digits
  const ed = e.replace(/\D/g, '');
  const ad = a.replace(/\D/g, '');
  if (ed.length >= 7 && ad.includes(ed)) return true;
  return false;
}

/** Write fill-receipt.json under an evidence dir. */
export function writeFillReceipt(evidenceDir: string, receipt: FillReceipt): string {
  mkdirSync(evidenceDir, { recursive: true });
  const path = join(evidenceDir, 'fill-receipt.json');
  writeFileSync(path, JSON.stringify(receipt, null, 2));
  return path;
}

/** Self-check redact + match helpers. */
export function selfCheckFillReceipt(): void {
  if (redactForReceipt('password', 'secret') !== '[redacted]') throw new Error('password redact');
  if (redactForReceipt('email', 'we@secret-mailbox.invalid') !== 'a***@example.test') {
    throw new Error('email redact must hide domain');
  }
  if (!valuesMatch('4155550100', '415-555-0100', 'text')) throw new Error('phone match');
  if (!valuesMatch('yes', 'yes', 'checkbox')) throw new Error('checkbox match');
  if (valuesMatch('Alex', '', 'text')) throw new Error('empty should fail');
  if (
    !valuesMatch('New York, NY', 'New York City, New York, United States', 'text', 'location')
  ) {
    throw new Error('location autocomplete match');
  }
  if (valuesMatch('Newark, NJ', 'New York City, New York, United States', 'text', 'location')) {
    throw new Error('location must not accept wrong city');
  }
  if (valuesMatch('New York, NY', 'Albany, NY', 'text', 'location')) {
    throw new Error('location must not accept wrong city same state');
  }
  if (classifyFillBlocker('missing required profile paths: phone') !== 'missing_required') {
    throw new Error('blocker missing_required');
  }
  if (classifyFillBlocker('empty fill: no fields filled') !== 'missing_required') {
    throw new Error('blocker empty fill');
  }
  if (classifyFillBlocker('verify failed for location') !== 'verify') {
    throw new Error('blocker verify');
  }
  const paths = parseMissingRequiredPaths('missing required profile paths: phone,linkedin');
  if (paths.join(',') !== 'phone,linkedin') throw new Error('parse missing multi');
  if (parseMissingRequiredPaths('required profile path empty: email')[0] !== 'email') {
    throw new Error('parse missing one');
  }
  const uv = unverifiedRequiredKeys(
    [
      { key: 'email', verified: true },
      { key: 'phone', verified: false },
      { key: 'extra', verified: false },
    ],
    ['email', 'phone'],
  );
  if (uv.join(',') !== 'phone') throw new Error('unverifiedRequiredKeys');
}

if (process.argv[1]?.endsWith('fill-receipt.ts') || process.argv[1]?.endsWith('fill-receipt.js')) {
  selfCheckFillReceipt();
  console.log('fill-receipt self-check ok');
}
