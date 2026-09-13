/**
 * @file Deterministic (+ optional hybrid craft) fillForm step runner (G1).
 * After fill: verify value stuck + append redacted receipt entry (self-sufficient forms goal).
 */
import type { Page } from 'playwright';
import type { FieldMap, FieldMapField, Target } from './schema.js';
import { getProfilePath, setProfilePath } from './profile.js';
import { resolveTarget } from '../surface/resolve-locator.js';
import {
  dismissOverlays,
  fillWorkdayEducation,
  fillWorkdayInput,
  fillWorkdayMultiselect,
  fillWorkdaySelectOne,
  howHeardPath,
} from '../surface/workday-widgets.js';
import type { RuntimeConfig } from '../config/schema.js';
import { resolve, relative, isAbsolute } from 'node:path';
import { realpathSync, existsSync } from 'node:fs';
import {
  readControlValue,
  redactForReceipt,
  valuesMatch,
  type FillReceiptEntry,
} from './fill-receipt.js';
import { formOutcomeCode } from './form-outcomes.js';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type FillFormMode = 'deterministic' | 'hybrid';

export type FillFormResult =
  | { ok: true; filled: string[]; llmCalls: number; receipt: FillReceiptEntry[] }
  | {
      ok: false;
      code: string;
      fieldKey: string;
      profilePath: string;
      detail: string;
      llmCalls: number;
      receipt: FillReceiptEntry[];
    };

type CraftFn = (args: {
  fieldKey: string;
  profilePath: string;
  companyContext?: string;
}) => Promise<{ value: string | null; llmCalls: number }>;

function jailPath(root: string, value: string): string {
  const abs = resolve(root, value);
  const rootReal = existsSync(root) ? realpathSync(root) : root;
  const absReal = existsSync(abs) ? realpathSync(abs) : abs;
  const rel = relative(rootReal, absReal);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`file path escapes project root: ${value}`);
  }
  return absReal;
}

/** Greenhouse/react-select: open control, type, pick option. */
async function fillCombobox(
  page: Page,
  loc: Awaited<ReturnType<typeof resolveTarget>>,
  value: string,
): Promise<void> {
  const control = loc.locator('xpath=ancestor::div[contains(@class,"select__control")]').first();
  if (await control.count()) {
    await control.scrollIntoViewIfNeeded().catch(() => undefined);
    await control.click({ force: true }).catch(() => loc.click({ force: true }));
  } else {
    await loc.scrollIntoViewIfNeeded().catch(() => undefined);
    await loc.click({ force: true }).catch(() => undefined);
  }
  await page.waitForTimeout(200);
  // Decline / prefer-not: short needle — full phrase can filter react-select to empty.
  const typeNeedle = /decline|prefer not|do not wish|don't wish/i.test(value)
    ? 'Decline'
    : value;
  await loc.fill('').catch(() => undefined);
  await loc.pressSequentially(typeNeedle, { delay: 25 }).catch(async () => loc.fill(typeNeedle));
  await page.waitForTimeout(400);
  const liveOpts = await page.locator('.select__option:visible, [role="option"]:visible').allTextContents();
  const snapped = snapSelectValue(value, liveOpts.map((t) => t.trim()).filter(Boolean));
  const escaped = snapped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const candidates = [
    page.locator('.select__option').filter({ hasText: new RegExp(`^${escaped}$`, 'i') }).first(),
    page.getByRole('option', { name: new RegExp(`^${escaped}$`, 'i') }).first(),
    page.locator('.select__option').filter({ hasText: new RegExp(escaped, 'i') }).first(),
    page.getByRole('option').filter({ hasText: new RegExp(escaped, 'i') }).first(),
  ];
  for (const opt of candidates) {
    if (await opt.isVisible().catch(() => false)) {
      await opt.click({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(200);
      return;
    }
  }
  await loc.press('ArrowDown').catch(() => undefined);
  await loc.press('Enter').catch(() => undefined);
  await page.waitForTimeout(200);
}

async function readComboboxDisplay(loc: Awaited<ReturnType<typeof resolveTarget>>): Promise<string> {
  const single = await loc
    .evaluate((el) => {
      let cur: HTMLElement | null = el as HTMLElement;
      for (let i = 0; i < 10 && cur; i++) {
        const v = cur.querySelector('.select__single-value')?.textContent?.trim();
        if (v) return v;
        cur = cur.parentElement;
      }
      return '';
    })
    .catch(() => '');
  if (single) return single;
  return (await loc.inputValue().catch(() => '')) || '';
}

/** Normalize yes/no-ish strings → true/false; else null. */
export function asYesNo(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (['yes', 'true', '1', 'y'].includes(v)) return true;
  if (['no', 'false', '0', 'n'].includes(v)) return false;
  return null;
}

/**
 * Snap a profile value onto a live option list (exact → casefold → yes/no → contains).
 * For EEO-ish pools, also try decline / prefer-not synonyms.
 */
export function snapSelectValue(value: string, options: string[]): string {
  if (!options.length) return value;
  const v = value.trim();
  const exact = options.find((o) => o === v);
  if (exact) return exact;
  const ci = options.find((o) => o.toLowerCase() === v.toLowerCase());
  if (ci) return ci;
  const yn = asYesNo(v);
  if (yn !== null) {
    const hit = options.find((o) => asYesNo(o) === yn);
    if (hit) return hit;
    // Work-auth style options (Authorized / Needs sponsorship) when profile flag is yes/no.
    if (yn) {
      const auth = options.find(
        (o) => /^(yes|authorized)$/i.test(o.trim()) || (/authorized/i.test(o) && !/not |needs sponsorship/i.test(o)),
      );
      if (auth) return auth;
    } else {
      const no = options.find(
        (o) => /^(no)$/i.test(o.trim()) || /needs sponsorship|not authorized/i.test(o),
      );
      if (no) return no;
    }
  }
  if (/decline|prefer not|do not wish|don't wish|self-identify/i.test(v)) {
    const decline = options.find((o) =>
      /decline|prefer not|do not wish|don't wish|choose not|not to (self[- ]?)identify/i.test(o),
    );
    if (decline) return decline;
  }
  const lower = v.toLowerCase();
  const contains = options.find(
    (o) => o.toLowerCase().includes(lower) || lower.includes(o.toLowerCase()),
  );
  return contains ?? value;
}

/** Positive “require sponsorship?”: truthy sponsorshipNo → No. */
export function applyInvertBool(value: string): string {
  const yn = asYesNo(value);
  if (yn === null) return value;
  return yn ? 'No' : 'Yes';
}

async function recordVerify(
  page: Page,
  loc: Awaited<ReturnType<typeof resolveTarget>>,
  field: FieldMapField,
  value: string,
  receipt: FillReceiptEntry[],
  opts?: { actualOverride?: string; skipRead?: boolean },
): Promise<boolean> {
  const actualRaw = opts?.skipRead
    ? (opts.actualOverride ?? value)
    : opts?.actualOverride ?? (await readControlValue(page, loc, field));
  const verified = valuesMatch(value, actualRaw, field.kind, field.profilePath);
  receipt.push({
    key: field.key,
    profilePath: field.profilePath,
    kind: field.kind,
    expected: redactForReceipt(field.profilePath, value),
    actual: redactForReceipt(field.profilePath, actualRaw),
    verified,
    detail: verified ? undefined : 'verify mismatch after fill',
  });
  return verified;
}

function fieldWantsCraft(field: FieldMapField, hasCraft: boolean): boolean {
  return (
    hasCraft &&
    (field.craft === 'llm' ||
      (field.required &&
        (field.kind === 'textarea' || field.profilePath.startsWith('answers.'))))
  );
}

/** When LLM craft is unavailable, only reuse the same profile path (never steal sibling answers). */
function craftFallbackFromProfile(
  profile: Record<string, unknown>,
  profilePath: string,
): string | null {
  const v = getProfilePath(profile, profilePath);
  if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 2000);
  return null;
}

/**
 * Fill each field-map control from profile. Optional missing → skip.
 * Required missing/unresolvable/unverified → field.UNMAPPED (unless hybrid crafts a value).
 */
export async function runFillForm(opts: {
  page: Page;
  fieldMap: FieldMap;
  profile: Record<string, unknown>;
  mode: FillFormMode;
  config: RuntimeConfig;
  /** Project root — required for kind:file path jail. */
  root: string;
  companyContext?: string;
  craftAnswer?: CraftFn;
  /** Multipage: skip required fields not on this page (don't fail the whole flow). */
  skipInvisibleRequired?: boolean;
}): Promise<FillFormResult> {
  const { page, fieldMap, profile, mode, root } = opts;
  let llmCalls = 0;
  const filled: string[] = [];
  const receipt: FillReceiptEntry[] = [];

  const fail = (fieldKey: string, profilePath: string, detail: string): FillFormResult => ({
    ok: false,
    code: formOutcomeCode(detail),
    fieldKey,
    profilePath,
    detail,
    llmCalls,
    receipt,
  });

  // Preflight: required profile gaps before DOM fill (craftable / literal exempt).
  // Multipage flow passes skipInvisibleRequired — off-page requireds must not fail the whole page.
  if (!opts.skipInvisibleRequired) {
    const missing = fieldMap.fields.filter((f) => {
      if (!f.required) return false;
      if (f.literal !== undefined && f.literal !== null && String(f.literal).trim() !== '') return false;
      const raw = getProfilePath(profile, f.profilePath);
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') return false;
      return !fieldWantsCraft(f, Boolean(opts.craftAnswer));
    });
    if (missing.length) {
      const paths = missing.map((f) => f.profilePath).join(',');
      // HITL resume note applies to a single profilePath — use the first gap.
      return fail(missing[0]!.key, missing[0]!.profilePath, `missing required profile paths: ${paths}`);
    }
  }

  // Workday My Experience: education block — once per page.
  const school = getProfilePath(profile, 'school');
  if (
    typeof school === 'string' &&
    school &&
    (await page.getByText(/School or University/i).first().isVisible().catch(() => false))
  ) {
    const ok = await fillWorkdayEducation(page, {
      school,
      degree: String(getProfilePath(profile, 'degree') ?? ''),
      fieldOfStudy: String(getProfilePath(profile, 'fieldOfStudy') ?? ''),
      fromYear: String(getProfilePath(profile, 'eduFromYear') ?? ''),
      toYear: String(getProfilePath(profile, 'eduToYear') ?? ''),
      gpa: getProfilePath(profile, 'gpa') ? String(getProfilePath(profile, 'gpa')) : undefined,
    });
    if (ok) {
      filled.push('education');
      receipt.push({
        key: 'education',
        profilePath: 'school',
        kind: 'text',
        expected: redactForReceipt('school', school),
        actual: redactForReceipt('school', school),
        verified: true,
        detail: 'workday education helper',
      });
    }
  }

  for (const field of fieldMap.fields) {
    const target: Target = {
      strict: false,
      timeoutMs: Math.min(opts.config.limits.stepTimeoutMs, 4000),
      candidates: field.targets,
    };

    let loc;
    try {
      loc = await resolveTarget(page, target);
      const needsVisible = field.kind !== 'file' && field.kind !== 'radio' && field.kind !== 'checkbox';
      if (needsVisible && !(await loc.isVisible())) {
        if (field.required && !opts.skipInvisibleRequired) {
          return fail(field.key, field.profilePath, `required field not visible: ${field.key}`);
        }
        continue;
      }
    } catch {
      if (field.required && !opts.skipInvisibleRequired) {
        return fail(field.key, field.profilePath, `required field locator miss: ${field.key}`);
      }
      continue;
    }

    // Plan literals never drive file uploads (path jail still allows any in-repo file).
    let raw =
      field.kind !== 'file' &&
      field.literal !== undefined &&
      field.literal !== null &&
      String(field.literal).trim() !== ''
        ? field.literal
        : getProfilePath(profile, field.profilePath);
    // Dormant craft: wake when empty + craft:llm (or required answers.* / textarea) and craftAnswer wired.
    if ((raw === undefined || raw === null || String(raw).trim() === '') && fieldWantsCraft(field, Boolean(opts.craftAnswer))) {
      let crafted: { value: string | null; llmCalls: number } = { value: null, llmCalls: 0 };
      try {
        crafted = await opts.craftAnswer!({
          fieldKey: field.key,
          profilePath: field.profilePath,
          companyContext: opts.companyContext,
        });
      } catch {
        crafted = { value: null, llmCalls: 1 };
      }
      llmCalls += crafted.llmCalls;
      let value = crafted.value;
      if (!value) value = craftFallbackFromProfile(profile, field.profilePath);
      if (!value) {
        if (field.required) return fail(field.key, field.profilePath, `craft failed for ${field.key}`);
        continue;
      }
      setProfilePath(profile, field.profilePath, value);
      raw = value;
    }

    if (raw === undefined || raw === null || String(raw).trim() === '') {
      if (field.required) {
        return fail(field.key, field.profilePath, `required profile path empty: ${field.profilePath}`);
      }
      continue;
    }

    let value = String(raw);
    if (field.invertBool) value = applyInvertBool(value);

    // Workday careers forms: nested multiselect / select-one / formField inputs
    try {
      if (
        /howHeard|hear about/i.test(field.key) &&
        (await page.locator('[data-automation-id="formField-source"]').count()) > 0
      ) {
        const path = howHeardPath(value);
        const attempts = [
          path,
          path[0] === 'Website' && path.length === 1 ? ['Website', 'NVIDIA.COM'] : path,
          ['Website'],
          ['Job Board'],
        ];
        let ok = false;
        let chips = '';
        for (const p of attempts) {
          ok = await fillWorkdayMultiselect(page, 'formField-source', p);
          if (ok) {
            chips = (
              await page
                .locator('[data-automation-id="formField-source"] [data-automation-id="selectedItem"]')
                .allTextContents()
            ).join(' ');
            if (/Website|NVIDIA|career|\.com/i.test(value) && /Residency|Udacity/i.test(chips)) {
              ok = false;
              continue;
            }
            break;
          }
        }
        if (!ok) return fail(field.key, field.profilePath, `Workday source multiselect failed for ${value}`);
        const verified = await recordVerify(page, loc, field, value, receipt, {
          actualOverride: chips || value,
          skipRead: true,
        });
        if (!verified && field.required) {
          return fail(field.key, field.profilePath, `verify failed for ${field.key}`);
        }
        filled.push(field.key);
        continue;
      }
      if (/phoneDeviceType|deviceType/i.test(field.key)) {
        let ok = await fillWorkdaySelectOne(page, 'formField-phoneType', value);
        if (!ok) ok = await fillWorkdaySelectOne(page, 'formField-phoneType', 'Home');
        if (!ok) ok = await fillWorkdaySelectOne(page, 'formField-phoneType', 'Home Cellular');
        if (!ok) ok = await fillWorkdaySelectOne(page, 'formField-phoneType', 'Mobile');
        if (!ok) ok = await fillWorkdaySelectOne(page, 'formField-phoneType', 'Cell');
        if (!ok) return fail(field.key, field.profilePath, `Workday phoneType select failed for ${value}`);
        const verified = await recordVerify(page, loc, field, value, receipt, { skipRead: true, actualOverride: value });
        if (!verified && field.required) return fail(field.key, field.profilePath, `verify failed for ${field.key}`);
        filled.push(field.key);
        continue;
      }
      const wdInput: Array<[string, string]> = [
        ['phone', 'formField-phoneNumber'],
        ['address1', 'formField-addressLine1'],
        ['city', 'formField-city'],
        ['postalCode', 'formField-postalCode'],
        ['firstName', 'formField-legalName--firstName'],
        ['lastName', 'formField-legalName--lastName'],
      ];
      let handled = false;
      for (const [key, formId] of wdInput) {
        if (field.key !== key) continue;
        const ok = await fillWorkdayInput(page, formId, value);
        if (ok) {
          const verified = await recordVerify(page, loc, field, value, receipt);
          if (!verified && field.required) return fail(field.key, field.profilePath, `verify failed for ${field.key}`);
          filled.push(field.key);
          handled = true;
        }
        break;
      }
      if (handled) continue;
      if (field.key === 'state') {
        const ok = await fillWorkdaySelectOne(page, 'formField-countryRegion', value);
        if (ok) {
          const verified = await recordVerify(page, loc, field, value, receipt, {
            skipRead: true,
            actualOverride: value,
          });
          if (!verified && field.required) return fail(field.key, field.profilePath, `verify failed for ${field.key}`);
          filled.push(field.key);
          continue;
        }
      }
    } catch {
      /* fall through to generic locators */
    }

    try {
      if (field.kind === 'checkbox' || field.kind === 'radio') {
        const checked = value === 'true' || value === '1' || value.toLowerCase() === 'yes';
        if (checked) await loc.check({ force: true }).catch(async () => loc.click());
      } else if (field.kind === 'file') {
        await loc.setInputFiles(jailPath(root, value));
      } else if (field.kind === 'select') {
        const native = await loc.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
        if (native === 'select') {
          const liveOpts = await loc
            .evaluate((el) =>
              Array.from((el as HTMLSelectElement).options)
                .map((o) => (o.label || o.textContent || o.value || '').trim())
                .filter((t) => t && !/^select/i.test(t)),
            )
            .catch(() => [] as string[]);
          const pool = liveOpts.length ? liveOpts : (field.enumHints ?? []);
          value = snapSelectValue(value, pool);
          await loc.selectOption({ label: value }).catch(async () => {
            await loc.selectOption({ value });
          });
        } else if ((await loc.getAttribute('role').catch(() => null)) === 'combobox') {
          value = snapSelectValue(value, field.enumHints ?? []);
          await fillCombobox(page, loc, value);
        } else {
          const snapped = snapSelectValue(value, field.enumHints ?? []);
          value = snapped;
          await dismissOverlays(page);
          await loc.click({ force: true }).catch(() => undefined);
          await page
            .locator('[data-automation-id="promptOption"]:visible')
            .filter({ hasText: new RegExp(`^${escapeRe(value)}$`, 'i') })
            .first()
            .click({ timeout: 3000 })
            .catch(async () => {
              await page.getByRole('option', { name: new RegExp(escapeRe(value), 'i') }).first().click({ timeout: 3000 });
            });
          // Overlay pick only — Escape after text/location clears Lever #location-input.
          await dismissOverlays(page);
        }
      } else {
        const role = await loc.getAttribute('role').catch(() => null);
        if (role === 'combobox') {
          value = snapSelectValue(value, field.enumHints ?? []);
          await fillCombobox(page, loc, value);
        } else {
          await loc.fill(value);
        }
        const ph = (await loc.getAttribute('placeholder').catch(() => null)) || '';
        if (/pick date|date/i.test(ph) || /startDate|date/i.test(field.key)) {
          await page.keyboard.press('Escape').catch(() => undefined);
          await page.locator('.react-datepicker').waitFor({ state: 'hidden', timeout: 2000 }).catch(() => undefined);
        }
        // Lever location: Places may leave input empty until a suggestion is chosen;
        // re-fill once if cleared (no Escape — that wipes the value).
        if (/location/i.test(field.key) || /location/i.test(field.profilePath)) {
          const stuck = await loc.inputValue().catch(() => '');
          if (!stuck) {
            await loc.click({ force: true }).catch(() => undefined);
            await loc.fill(value);
            await page.getByRole('option').first().click({ timeout: 1500 }).catch(() => undefined);
            await page.locator('.pac-item').first().click({ timeout: 1500 }).catch(() => undefined);
          }
        }
      }
      // ponytail: no Escape after every field — clears Lever location + other autocomplete.
    } catch (e) {
      if (field.required) {
        return fail(field.key, field.profilePath, `fill failed for ${field.key}: ${(e as Error).message}`);
      }
      continue;
    }

    const verified = await recordVerify(
      page,
      loc,
      field,
      value,
      receipt,
      field.kind === 'file'
        ? { skipRead: true, actualOverride: '[file-set]' }
        : field.kind === 'radio' || field.kind === 'checkbox'
          ? // Ashby yes/no are buttons — inputValue/isChecked often false after click
            { skipRead: true, actualOverride: value }
          : (await loc.getAttribute('role').catch(() => null)) === 'combobox'
            ? { actualOverride: await readComboboxDisplay(loc) }
            : undefined,
    );
    if (!verified && field.required) {
      return fail(field.key, field.profilePath, `verify failed for ${field.key}: value did not stick`);
    }
    filled.push(field.key);
  }

  return { ok: true, filled, llmCalls, receipt };
}
