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
import { resolveUploadUnderRoot } from '../config/paths.js';
import {
  readControlValue,
  redactForReceipt,
  valuesMatch,
  type FillReceiptEntry,
} from './fill-receipt.js';
import { formOutcomeCode } from './form-outcomes.js';

/** File fields always read profile.resumePath (T-B-14). */
export function profilePathForField(f: Pick<FieldMapField, 'kind' | 'profilePath'>): string {
  return f.kind === 'file' ? 'resumePath' : f.profilePath;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type FillFormMode = 'deterministic' | 'hybrid';

export type FillFormResult =
  | {
      ok: true;
      filled: string[];
      llmCalls: number;
      receipt: FillReceiptEntry[];
      /** Optional fields skipped because profile path empty (not a failure). */
      skippedOptional: string[];
    }
  | {
      ok: false;
      code: string;
      fieldKey: string;
      profilePath: string;
      detail: string;
      llmCalls: number;
      receipt: FillReceiptEntry[];
      skippedOptional: string[];
    };

type CraftFn = (args: {
  fieldKey: string;
  profilePath: string;
  companyContext?: string;
  questionText?: string;
}) => Promise<{ value: string | null; llmCalls: number }>;

/** Prefer map label/role/placeholder text; cap length (DOM labels are untrusted). */
function questionTextFromTargets(field: FieldMapField): string | undefined {
  for (const t of field.targets) {
    const raw =
      (t.kind === 'label' || t.kind === 'role' || t.kind === 'placeholder' ? t.name : undefined) ||
      t.text ||
      t.name;
    if (typeof raw === 'string' && raw.trim()) {
      const s = raw.replace(/\s+/g, ' ').trim();
      return s.length > 500 ? `${s.slice(0, 500)}…` : s;
    }
  }
  return undefined;
}

/** Cheap DOM fallback when map has only css targets. */
async function questionTextFromLoc(
  loc: Awaited<ReturnType<typeof resolveTarget>>,
): Promise<string | undefined> {
  const aria = await loc.getAttribute('aria-label').catch(() => null);
  if (aria?.trim()) {
    const s = aria.trim();
    return s.length > 500 ? `${s.slice(0, 500)}…` : s;
  }
  const fromDom = await loc
    .evaluate((el) => {
      const html = el as HTMLElement;
      const id = html.id;
      if (id) {
        const lab = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        const t = lab?.textContent?.replace(/\s+/g, ' ').trim();
        if (t) return t.slice(0, 500);
      }
      const parentLab = html.closest('label');
      const pt = parentLab?.textContent?.replace(/\s+/g, ' ').trim();
      if (pt) return pt.slice(0, 500);
      const block = html.closest('fieldset, [class*="field"], [class*="question"], [data-testid]');
      const q = block?.querySelector('label, legend, p, h3, h4, span');
      return q?.textContent?.replace(/\s+/g, ' ').trim()?.slice(0, 500) || '';
    })
    .catch(() => '');
  return fromDom || undefined;
}

function jailPath(root: string, value: string): string {
  return resolveUploadUnderRoot(root, value);
}

/** Greenhouse/react-select: open control, type, pick option. */
async function fillCombobox(
  page: Page,
  loc: Awaited<ReturnType<typeof resolveTarget>>,
  value: string,
  opts: { typeNeedle?: string } = {},
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
  // Location: type city only so Ashby/Places returns options, then snap to full match.
  const typeNeedle =
    opts.typeNeedle ??
    (/decline|prefer not|do not wish|don't wish/i.test(value) ? 'Decline' : value);
  await loc.fill('').catch(() => undefined);
  await loc.pressSequentially(typeNeedle, { delay: 25 }).catch(async () => loc.fill(typeNeedle));
  await page.waitForTimeout(400);
  const liveOpts = await page
    .locator('.select__option:visible, [role="option"]:visible')
    .allTextContents()
    .then((rows) => rows.map((t) => t.trim()).filter(Boolean));
  const isLocation = Boolean(opts.typeNeedle);
  let snapped: string;
  if (isLocation) {
    const locSnap = snapLocationOption(value, liveOpts);
    if (!locSnap) {
      // Fail closed: do not ArrowDown/Enter into a wrong Places hit.
      return;
    }
    snapped = locSnap;
  } else {
    snapped = snapSelectValue(value, liveOpts);
    if (!liveOpts.some((o) => o.toLowerCase() === snapped.toLowerCase()) && typeNeedle !== value) {
      snapped = snapSelectValue(typeNeedle, liveOpts);
    }
  }
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
  if (isLocation) return; // no blind keyboard fallback for location
  await loc.press('ArrowDown').catch(() => undefined);
  await loc.press('Enter').catch(() => undefined);
  await page.waitForTimeout(200);
}

/**
 * Typeahead needle for location widgets: prefer "City, ST" so Places filters well.
 */
export function locationTypeNeedle(value: string): string {
  const t = value.trim();
  if (!t) return t;
  if (/decline|prefer not|do not wish|don't wish/i.test(t)) return 'Decline';
  const parts = t.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
  const city = parts[0] ?? t;
  return city.length >= 2 ? city : t;
}

/** Prefer Ashby/Places options matching city (+ region when present); null if no safe match. */
export function snapLocationOption(value: string, options: string[]): string | null {
  if (!options.length) return null;
  const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
  const city = parts[0] ?? value.trim();
  const region = parts[1];
  if (!city || city.length < 2) return null;
  const cityRe = new RegExp(`(?:^|[,\\s])${escapeRe(city)}(?=$|[,\\s])`, 'i');
  const regionRe = region ? new RegExp(`\\b${escapeRe(region)}\\b`, 'i') : null;
  let best: string | undefined;
  let bestScore = -1;
  for (const o of options) {
    if (!cityRe.test(o)) continue; // require whole-city token — never St. Johns→Johnsbury
    let score = 10;
    if (regionRe && regionRe.test(o)) score += 8;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  if (!best) return null;
  // When region known, prefer a region-bearing option; city-only Acceptable if Places omitted ST.
  if (regionRe) {
    const withRegion = options.filter((o) => cityRe.test(o) && regionRe.test(o));
    if (withRegion.length) {
      return withRegion.sort((a, b) => a.length - b.length)[0] ?? best;
    }
  }
  return best;
}

function isLocationField(field: { key: string; profilePath: string }): boolean {
  return /location/i.test(field.key) || /location/i.test(field.profilePath);
}

/**
 * Prefer `.select__single-value` inside *this* field's `.select__control`
 * (or the element itself if already the control). Never walk ancestors with a
 * bare `querySelector` — sibling phone Country dial-code (`+1`) poisoned GH location VERIFY.
 * Passed into Playwright `evaluate` so self-check and production share one body.
 */
export function pickReactSelectDisplay(el: {
  closest(sel: string): { querySelector(sel: string): { textContent: string | null } | null } | null;
  querySelector(sel: string): { textContent: string | null } | null;
}): string {
  const root = el.closest('.select__control') ?? el;
  const v = root.querySelector('.select__single-value')?.textContent?.trim();
  return v || '';
}

async function readComboboxDisplay(loc: Awaited<ReturnType<typeof resolveTarget>>): Promise<string> {
  const single = await loc.evaluate(pickReactSelectDisplay).catch(() => '');
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
  opts?: {
    actualOverride?: string;
    skipRead?: boolean;
    source?: FillReceiptEntry['source'];
    questionText?: string;
  },
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
    ...(opts?.source ? { source: opts.source } : {}),
    ...(opts?.questionText ? { questionText: opts.questionText.slice(0, 200) } : {}),
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

type WorkdayFillResult =
  | { status: 'filled' }
  | { status: 'fail'; detail: string }
  | { status: 'fallthrough' };

/** Workday-specific widgets; fallthrough leaves generic kind switch. */
async function tryFillWorkdayField(
  page: Page,
  loc: Awaited<ReturnType<typeof resolveTarget>>,
  field: FieldMapField,
  value: string,
  receipt: FillReceiptEntry[],
): Promise<WorkdayFillResult> {
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
      if (!ok) return { status: 'fail', detail: `Workday source multiselect failed for ${value}` };
      const verified = await recordVerify(page, loc, field, value, receipt, {
        actualOverride: chips || value,
        skipRead: true,
      });
      if (!verified && field.required) {
        return { status: 'fail', detail: `verify failed for ${field.key}` };
      }
      return { status: 'filled' };
    }
    if (/phoneDeviceType|deviceType/i.test(field.key)) {
      let ok = await fillWorkdaySelectOne(page, 'formField-phoneType', value);
      if (!ok) ok = await fillWorkdaySelectOne(page, 'formField-phoneType', 'Home');
      if (!ok) ok = await fillWorkdaySelectOne(page, 'formField-phoneType', 'Home Cellular');
      if (!ok) ok = await fillWorkdaySelectOne(page, 'formField-phoneType', 'Mobile');
      if (!ok) ok = await fillWorkdaySelectOne(page, 'formField-phoneType', 'Cell');
      if (!ok) return { status: 'fail', detail: `Workday phoneType select failed for ${value}` };
      const verified = await recordVerify(page, loc, field, value, receipt, {
        skipRead: true,
        actualOverride: value,
      });
      if (!verified && field.required) {
        return { status: 'fail', detail: `verify failed for ${field.key}` };
      }
      return { status: 'filled' };
    }
    const wdInput: Array<[string, string]> = [
      ['phone', 'formField-phoneNumber'],
      ['address1', 'formField-addressLine1'],
      ['city', 'formField-city'],
      ['postalCode', 'formField-postalCode'],
      ['firstName', 'formField-legalName--firstName'],
      ['lastName', 'formField-legalName--lastName'],
    ];
    for (const [key, formId] of wdInput) {
      if (field.key !== key) continue;
      const ok = await fillWorkdayInput(page, formId, value);
      if (ok) {
        const verified = await recordVerify(page, loc, field, value, receipt);
        if (!verified && field.required) {
          return { status: 'fail', detail: `verify failed for ${field.key}` };
        }
        return { status: 'filled' };
      }
      break;
    }
    if (field.key === 'state') {
      const ok = await fillWorkdaySelectOne(page, 'formField-countryRegion', value);
      if (ok) {
        const verified = await recordVerify(page, loc, field, value, receipt, {
          skipRead: true,
          actualOverride: value,
        });
        if (!verified && field.required) {
          return { status: 'fail', detail: `verify failed for ${field.key}` };
        }
        return { status: 'filled' };
      }
    }
  } catch {
    /* fall through */
  }
  return { status: 'fallthrough' };
}

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
  const skippedOptional: string[] = [];

  const fail = (fieldKey: string, profilePath: string, detail: string): FillFormResult => ({
    ok: false,
    code: formOutcomeCode(detail),
    fieldKey,
    profilePath,
    detail,
    llmCalls,
    receipt,
    skippedOptional,
  });

  // Preflight: required profile gaps before DOM fill (craftable / literal exempt).
  // Multipage flow passes skipInvisibleRequired — off-page requireds must not fail the whole page.
  if (!opts.skipInvisibleRequired) {
    const missing = fieldMap.fields.filter((f) => {
      if (!f.required) return false;
      if (f.kind !== 'file' && f.literal !== undefined && f.literal !== null && String(f.literal).trim() !== '') {
        return false;
      }
      const path = profilePathForField(f);
      const raw = getProfilePath(profile, path);
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') return false;
      return !fieldWantsCraft(f, Boolean(opts.craftAnswer));
    });
    if (missing.length) {
      const paths = missing.map((f) => profilePathForField(f)).join(',');
      const firstPath = profilePathForField(missing[0]!);
      return fail(missing[0]!.key, firstPath, `missing required profile paths: ${paths}`);
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

    // Plan literals never drive file uploads; file values always from resumePath.
    const valuePath = profilePathForField(field);
    const hadLiteral =
      field.kind !== 'file' &&
      field.literal !== undefined &&
      field.literal !== null &&
      String(field.literal).trim() !== '';
    let raw = hadLiteral ? field.literal : getProfilePath(profile, valuePath);
    let fillSource: FillReceiptEntry['source'] = hadLiteral
      ? 'literal'
      : raw !== undefined && raw !== null && String(raw).trim() !== ''
        ? 'profile'
        : undefined;
    let craftQuestion: string | undefined;
    // Dormant craft: wake when empty + craft:llm (or required answers.* / textarea) and craftAnswer wired.
    if ((raw === undefined || raw === null || String(raw).trim() === '') && fieldWantsCraft(field, Boolean(opts.craftAnswer))) {
      let crafted: { value: string | null; llmCalls: number } = { value: null, llmCalls: 0 };
      craftQuestion = questionTextFromTargets(field) ?? (await questionTextFromLoc(loc));
      try {
        crafted = await opts.craftAnswer!({
          fieldKey: field.key,
          profilePath: field.profilePath,
          companyContext: opts.companyContext,
          questionText: craftQuestion,
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
      fillSource = crafted.value ? 'craft' : 'profile';
    }

    if (raw === undefined || raw === null || String(raw).trim() === '') {
      if (field.required) {
        return fail(field.key, valuePath, `required profile path empty: ${valuePath}`);
      }
      skippedOptional.push(field.key);
      continue;
    }

    let value = String(raw);
    // Defensive: object leaked past getProfilePath must not fill as "[object Object]".
    if (value === '[object Object]' || (typeof raw === 'object' && raw !== null && !Array.isArray(raw))) {
      if (field.required) {
        return fail(field.key, valuePath, `required profile path not a scalar: ${valuePath}`);
      }
      continue;
    }
    if (field.invertBool) value = applyInvertBool(value);

    const wd = await tryFillWorkdayField(page, loc, field, value, receipt);
    if (wd.status === 'fail') return fail(field.key, field.profilePath, wd.detail);
    if (wd.status === 'filled') {
      filled.push(field.key);
      continue;
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
          await fillCombobox(
            page,
            loc,
            value,
            isLocationField(field) ? { typeNeedle: locationTypeNeedle(value) } : {},
          );
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
          await fillCombobox(
            page,
            loc,
            value,
            isLocationField(field) ? { typeNeedle: locationTypeNeedle(value) } : {},
          );
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
        if (isLocationField(field)) {
          const stuck = await loc.inputValue().catch(() => '');
          if (!stuck) {
            const needle = locationTypeNeedle(value);
            await loc.click({ force: true }).catch(() => undefined);
            await loc.fill(needle);
            await page.waitForTimeout(400);
            const liveOpts = await page
              .getByRole('option')
              .allTextContents()
              .then((rows) => rows.map((t) => t.trim()).filter(Boolean))
              .catch(() => [] as string[]);
            const snapped = snapLocationOption(value, liveOpts);
            if (snapped) {
              await page
                .getByRole('option', { name: new RegExp(escapeRe(snapped), 'i') })
                .first()
                .click({ timeout: 1500 })
                .catch(() => undefined);
            }
            // No .first() / pac-item fallback — wrong city is worse than empty.
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
        ? { skipRead: true, actualOverride: '[file-set]', source: fillSource, questionText: craftQuestion }
        : field.kind === 'radio' || field.kind === 'checkbox'
          ? // Ashby yes/no are buttons — inputValue/isChecked often false after click
            { skipRead: true, actualOverride: value, source: fillSource, questionText: craftQuestion }
          : (await loc.getAttribute('role').catch(() => null)) === 'combobox'
            ? {
                actualOverride: await readComboboxDisplay(loc),
                source: fillSource,
                questionText: craftQuestion,
              }
            : { source: fillSource, questionText: craftQuestion },
    );
    if (!verified && field.required) {
      return fail(field.key, field.profilePath, `verify failed for ${field.key}: value did not stick`);
    }
    filled.push(field.key);
  }

  return { ok: true, filled, llmCalls, receipt, skippedOptional };
}

/** Self-check: scoped react-select read; plain autocomplete falls through (empty). */
export function selfCheckPickReactSelectDisplay(): void {
  const phoneValue = { textContent: '+1' };
  const locValue = { textContent: 'St. Johns, FL' };
  const locControl = {
    querySelector(sel: string) {
      return sel === '.select__single-value' ? locValue : null;
    },
  };
  // Input inside location control; form-wide querySelector would see phone +1 first.
  const locEl = {
    closest(sel: string) {
      return sel === '.select__control' ? locControl : null;
    },
    querySelector(sel: string) {
      return sel === '.select__single-value' ? phoneValue : null;
    },
  };
  const plainAutocomplete = {
    closest(_sel: string) {
      return null;
    },
    querySelector(_sel: string) {
      return null;
    },
  };
  if (pickReactSelectDisplay(locEl) !== 'St. Johns, FL') {
    throw new Error('pickReactSelectDisplay: must prefer own control over sibling +1');
  }
  if (pickReactSelectDisplay(plainAutocomplete) !== '') {
    throw new Error('pickReactSelectDisplay: plain autocomplete must return empty → inputValue');
  }
  const whitespaceOnly = {
    closest(sel: string) {
      return sel === '.select__control'
        ? { querySelector: (_s: string) => ({ textContent: '   ' }) }
        : null;
    },
    querySelector(_sel: string) {
      return null;
    },
  };
  if (pickReactSelectDisplay(whitespaceOnly) !== '') {
    throw new Error('pickReactSelectDisplay: whitespace-only must be empty');
  }
}

if (process.argv[1]?.endsWith('fill-form.ts') || process.argv[1]?.endsWith('fill-form.js')) {
  selfCheckPickReactSelectDisplay();
  console.log('fill-form self-check ok');
}
