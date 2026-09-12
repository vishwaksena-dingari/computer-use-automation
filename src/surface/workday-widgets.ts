/**
 * @file Workday (and similar ATS) nested select / multiselect helpers.
 * Careers forms often use category → submenu prompts (How Did You Hear?),
 * plus opaque select-one widgets (Phone Device Type, State) that are not <select>.
 */
import type { Page, Locator } from 'playwright';

/** Dismiss open Workday prompt overlays without relying on a specific cancel control. */
export async function dismissOverlays(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(120);
  }
}

function fieldRoot(page: Page, formFieldId: string): Locator {
  const id = formFieldId.startsWith('formField-') ? formFieldId : `formField-${formFieldId}`;
  return page.locator(`[data-automation-id="${id}"]`);
}

/**
 * Open a Workday formField control (multiselect or select-one).
 * Scoped click first; options often render in a document-level portal.
 */
export async function openWorkdayField(page: Page, formFieldId: string): Promise<Locator> {
  await dismissOverlays(page);
  const root = fieldRoot(page, formFieldId);
  await root.scrollIntoViewIfNeeded();
  const openers = [
    root.locator('[data-automation-id="multiSelectContainer"]'),
    root.locator('[data-automation-id="promptIcon"]'),
    root.locator('[data-automation-id="selectOne"]'),
    root.locator('[data-automation-id*="select"]'),
    root.locator('[aria-haspopup="listbox"]'),
    root.locator('button'),
    root.locator('[role="button"]'),
    root.locator('input'),
  ];
  for (const loc of openers) {
    if ((await loc.count()) > 0 && (await loc.first().isVisible().catch(() => false))) {
      await loc.first().click({ force: true });
      await page.waitForTimeout(600);
      if (await hasVisibleOptions(page)) return root;
    }
  }
  const label = await root.locator('label, legend').first().innerText().catch(() => '');
  if (label) {
    await page
      .getByText(label.replace(/\*$/, '').trim(), { exact: false })
      .first()
      .click({ force: true })
      .catch(() => undefined);
    await page.waitForTimeout(500);
  }
  await root.click({ force: true });
  await page.waitForTimeout(600);
  return root;
}

async function hasVisibleOptions(page: Page): Promise<boolean> {
  const n = await page.locator('[data-automation-id="promptOption"]:visible').count();
  if (n > 0) return true;
  return (await page.getByRole('option').count()) > 0;
}

async function clickPromptOption(page: Page, match: RegExp | string): Promise<boolean> {
  if (typeof match === 'string') {
    const byLabel = page
      .locator(
        `[data-automation-id="promptOption"][data-automation-label="${match}"], [data-automation-id="promptLeafNode"][data-automation-label="${match}"]`,
      )
      .first();
    if ((await byLabel.count()) > 0 && (await byLabel.isVisible().catch(() => false))) {
      await byLabel.click({ force: true });
      await page.waitForTimeout(500);
      return true;
    }
  }
  const re = typeof match === 'string' ? new RegExp(`^\\s*${escapeRe(match)}\\s*$`, 'i') : match;
  const row = page
    .locator('[data-automation-id="promptOption"]:visible, [data-automation-id="promptLeafNode"]:visible')
    .filter({ hasText: re })
    .first();
  if ((await row.count()) > 0) {
    const cb = row.locator('input[type="checkbox"]');
    if ((await cb.count()) > 0) {
      await cb.first().check({ force: true }).catch(async () => cb.first().click({ force: true }));
    } else {
      await row.click({ force: true });
    }
    await page.waitForTimeout(500);
    return true;
  }
  const opt = page.getByRole('option', { name: re }).first();
  if ((await opt.count()) > 0) {
    await opt.click({ force: true });
    await page.waitForTimeout(500);
    return true;
  }
  const menu = page
    .locator('[data-automation-id="menuItem"]:visible, [role="menuitem"]:visible')
    .filter({ hasText: re })
    .first();
  if ((await menu.count()) > 0) {
    await menu.click({ force: true });
    await page.waitForTimeout(500);
    return true;
  }
  return false;
}

async function selectionStuck(root: Locator, expected?: string): Promise<boolean> {
  const chips = root.locator('[data-automation-id="selectedItem"]');
  if ((await chips.count()) > 0) {
    if (!expected) return true;
    const texts = (await chips.allTextContents()).join(' ');
    if (new RegExp(escapeRe(expected), 'i').test(texts)) return true;
  }
  const label = (await root.locator('[data-automation-id="promptSelectionLabel"]').innerText().catch(() => '')).trim();
  if (!label || /^0\s*item/i.test(label)) return false;
  if (/\d+\s*item/i.test(label)) return true;
  if (expected && new RegExp(escapeRe(expected), 'i').test(label)) return true;
  return label.length > 0 && !/^select/i.test(label);
}

/** Commit open prompt without Escape (Escape cancels multiselect selections).
 * Trusted mouse click outside the open panel (isTrusted) closes UXI overlays.
 */
async function commitPrompt(page: Page): Promise<void> {
  const done = page.getByRole('button', { name: /^(Done|OK|Apply|Close|Save)$/i }).first();
  if (await done.isVisible().catch(() => false)) {
    await done.click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(300);
    return;
  }
  // CDP mouse click outside the open list — header/locator clicks can miss UXI handlers.
  try {
    const opt = page.locator('[data-automation-id="promptOption"]:visible').first();
    const box = (await opt.boundingBox().catch(() => null)) ?? (await page.locator('body').boundingBox());
    if (box) {
      await page.mouse.click(Math.max(20, box.x - 40), Math.max(20, box.y - 60));
      await page.waitForTimeout(300);
      return;
    }
  } catch {
    /* fall through */
  }
  await page
    .locator('h2, [data-automation-id="pageHeaderTitleText"], [data-automation-id="wizard-stepTitle"]')
    .first()
    .click({ force: true })
    .catch(async () => {
      await page.keyboard.press('Tab');
    });
  await page.waitForTimeout(300);
}

async function clearSelectedChips(root: Locator): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const chip = root.locator('[data-automation-id="selectedItem"]').first();
    if ((await chip.count()) === 0) return;
    const btn = chip.locator('button, [aria-label*="Remove"], [aria-label*="Clear"], [data-automation-id*="delete"]').first();
    if ((await btn.count()) > 0) await btn.click({ force: true }).catch(() => undefined);
    else await chip.click({ force: true }).catch(() => undefined);
    await pageWait(root, 200);
  }
}

async function pageWait(root: Locator, ms: number): Promise<void> {
  await root.page().waitForTimeout(ms);
}

/**
 * Fill Workday nested multiselect: open → walk category path → verify chip.
 * Do not Escape after a successful pick — Escape cancels the pending selection.
 * Website category drills to company-site leaf (NVIDIA.COM), not first leaf.
 */
export async function fillWorkdayMultiselect(
  page: Page,
  formFieldId: string,
  path: string[],
): Promise<boolean> {
  if (!path.length) return false;
  const root = await openWorkdayField(page, formFieldId);
  await clearSelectedChips(root);
  // Re-open after clear
  if (!(await hasVisibleOptions(page))) await openWorkdayField(page, formFieldId);

  for (let i = 0; i < path.length; i++) {
    const part = path[i];
    const isLast = i === path.length - 1;
    let ok = await clickPromptOption(page, part);
    if (!ok) ok = await clickPromptOption(page, new RegExp(escapeRe(part), 'i'));
    if (!ok) {
      const search = page
        .locator('[data-automation-id="searchBox"] input, input[placeholder*="Search"]:visible')
        .first();
      if (await search.isVisible().catch(() => false)) {
        await search.fill(part);
        await page.waitForTimeout(500);
        ok =
          (await clickPromptOption(page, part)) ||
          (await clickPromptOption(page, new RegExp(escapeRe(part), 'i')));
      }
    }
    if (!ok) {
      await dismissOverlays(page);
      return false;
    }
    await page.waitForTimeout(450);

    // After last path segment, if still no chip, pick a careers/company leaf (not Residency/Udacity).
    if (isLast && !(await selectionStuck(root, part))) {
      const leaves = page.locator(
        '[data-automation-id="promptLeafNode"]:visible, [data-automation-id="promptOption"]:visible',
      );
      if ((await leaves.count()) > 0) {
        const host = (() => {
          try {
            return new URL(page.url()).hostname;
          } catch {
            return '';
          }
        })();
        // nvidia.wd5.myworkdayjobs.com → "nvidia"
        const brand = host.split('.')[0]?.replace(/^wd\d+$/i, '') || 'nvidia';
        const preferred: RegExp[] = [
          /nvidia\.com/i,
          new RegExp(escapeRe(brand) + '\\.com', 'i'),
          new RegExp(escapeRe(brand), 'i'),
          /career/i,
          /company\s*website/i,
          /\.com\b/i,
        ];

        const search = page.locator('input[placeholder*="Search"]:visible').first();
        if (await search.isVisible().catch(() => false)) {
          await search.fill(brand.length > 2 ? brand : 'NVIDIA');
          await page.waitForTimeout(500);
        }

        let picked = false;
        for (const pref of preferred) {
          const hit = leaves.filter({ hasText: pref }).filter({ hasNotText: /\(\+\d+\)|Residency|Udacity/i }).first();
          if ((await hit.count()) > 0 && (await hit.isVisible().catch(() => false))) {
            await hit.click({ force: true });
            picked = true;
            await page.waitForTimeout(450);
            break;
          }
        }
        if (!picked) {
          // Explicit label click for NVIDIA.COM
          picked = await clickPromptOption(page, 'NVIDIA.COM');
        }
        if (!picked) {
          const sane = leaves.filter({ hasNotText: /\(\+\d+\)|Residency|Udacity/i }).first();
          if ((await sane.count()) > 0) {
            await sane.click({ force: true });
            picked = true;
            await page.waitForTimeout(450);
          }
        }
        if (!picked) {
          await dismissOverlays(page);
          return false;
        }
      }
    }
  }

  await commitPrompt(page);
  for (let i = 0; i < 6; i++) {
    const chips = (await root.locator('[data-automation-id="selectedItem"]').allTextContents()).join(' ');
    if (/nvidia\.com|career|\.com/i.test(chips) && !/Residency|Udacity/i.test(chips)) return true;
    if (await selectionStuck(root, path[path.length - 1])) return true;
    await page.waitForTimeout(200);
  }
  const chips = (await root.locator('[data-automation-id="selectedItem"]').allTextContents()).join(' ');
  if (/Residency|Udacity/i.test(chips)) return false;
  return selectionStuck(root);
}

/** Fill Workday select-one (Phone Device Type, State/Region). */
export async function fillWorkdaySelectOne(
  page: Page,
  formFieldId: string,
  option: string,
): Promise<boolean> {
  await openWorkdayField(page, formFieldId);
  let ok = await clickPromptOption(page, option);
  if (!ok) ok = await clickPromptOption(page, new RegExp(escapeRe(option), 'i'));
  if (!ok) {
    const search = page.locator('input[placeholder*="Search"]:visible').first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill(option);
      await page.waitForTimeout(400);
      ok =
        (await clickPromptOption(page, option)) ||
        (await clickPromptOption(page, new RegExp(escapeRe(option), 'i')));
    }
  }
  await commitPrompt(page);
  return ok;
}

/** Fill a plain text input inside a Workday formField (e.g. phoneNumber). */
export async function fillWorkdayInput(
  page: Page,
  formFieldId: string,
  value: string,
): Promise<boolean> {
  await dismissOverlays(page);
  const input = fieldRoot(page, formFieldId)
    .locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')
    .first();
  if ((await input.count()) === 0) return false;
  await input.click({ force: true }).catch(() => undefined);
  await input.fill('');
  await input.fill(value);
  const got = await input.inputValue().catch(() => '');
  return got.includes(value) || got.replace(/\D/g, '').includes(value.replace(/\D/g, ''));
}

/**
 * Resolve profile howHeard into a Workday source path.
 * NVIDIA: Website → NVIDIA.COM (not first submenu leaf).
 */
export function howHeardPath(raw: string): string[] {
  const v = raw.trim();
  if (!v) return ['Website', 'NVIDIA.COM'];
  if (/nvidia\.com/i.test(v)) return ['Website', 'NVIDIA.COM'];
  if (/^website$/i.test(v) || /career|company site/i.test(v)) return ['Website', 'NVIDIA.COM'];
  if (/^job board$/i.test(v)) return ['Job Board'];
  if (/linkedin|twitter|facebook|instagram|social/i.test(v)) {
    if (/^social media$/i.test(v)) return ['Social Media'];
    return ['Social Media', v];
  }
  if (/job\s*board|indeed|greenhouse|lever/i.test(v)) return ['Job Board'];
  if (/university|campus|school/i.test(v)) return ['University'];
  if (/event|conference|meetup/i.test(v)) return ['Event/Conference'];
  if (/associat/i.test(v)) return ['Associations'];
  return [v];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Fill one Workday Education block (school, degree, field of study, years).
 */
export async function fillWorkdayEducation(
  page: Page,
  edu: {
    school: string;
    degree: string;
    fieldOfStudy: string;
    fromYear: string;
    toYear: string;
    gpa?: string;
  },
): Promise<boolean> {
  await dismissOverlays(page);

  // School — last visible blank matching education labels
  const schoolOk = await fillLastBlankByLabel(
    page,
    [/school or university/i, /^school$/i, /institution|university|college/i],
    edu.school,
  );

  // Degree — Select One near Degree label (not Field of Study)
  let degreeOk = false;
  const degreeBtn = page
    .locator('button')
    .filter({ hasText: /^Select One$/i })
    .last();
  // Prefer automation ids when present
  for (const sel of [
    "button[data-automation-id='degree']",
    "button[data-automation-id='degreeType']",
    "[data-automation-id='formField-degree'] button",
  ]) {
    const b = page.locator(sel).last();
    if (await b.isVisible().catch(() => false)) {
      await b.click({ force: true });
      await page.waitForTimeout(400);
      degreeOk = await clickPromptOption(page, new RegExp(escapeRe(edu.degree), 'i'));
      if (!degreeOk) {
        // typeahead
        const search = page.locator('input[placeholder*="Search"]:visible').first();
        if (await search.isVisible().catch(() => false)) {
          await search.fill(edu.degree);
          await page.waitForTimeout(400);
          degreeOk = await clickPromptOption(page, new RegExp(escapeRe(edu.degree), 'i'));
        }
      }
      await commitPrompt(page);
      break;
    }
  }
  if (!degreeOk && (await degreeBtn.isVisible().catch(() => false))) {
    // Heuristic: last Select One in Education section
    await degreeBtn.click({ force: true });
    await page.waitForTimeout(400);
    const search = page.locator('input[placeholder*="Search"]:visible').first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill(edu.degree.split(/\s+/)[0] || edu.degree);
      await page.waitForTimeout(400);
    }
    degreeOk = await clickPromptOption(page, new RegExp(escapeRe(edu.degree), 'i'));
    if (!degreeOk) degreeOk = await clickPromptOption(page, new RegExp(escapeRe(edu.degree.split(/\s+/)[0] || edu.degree), 'i'));
    // ponytail: no invented degree click — empty profile must not pick Bachelor/Master.
    await commitPrompt(page);
  }

  // Field of study — search + matching option (never first-alpha blind ArrowDown)
  const fosOk = await fillWorkdaySearchPrompt(page, /field of study|major|area of study/i, edu.fieldOfStudy);

  // Years — YYYY inputs
  const fromOk = await fillLastBlankByLabel(page, [/^from/i], edu.fromYear);
  const toOk = await fillLastBlankByLabel(page, [/^to/i, /expected/i], edu.toYear);
  if (edu.gpa) await fillLastBlankByLabel(page, [/gpa|overall result/i], edu.gpa);

  return Boolean(schoolOk || degreeOk || fosOk || (fromOk && toOk));
}

/** Typeahead Workday prompt bound to a label; click option containing query. */
export async function fillWorkdaySearchPrompt(
  page: Page,
  labelRe: RegExp,
  query: string,
): Promise<boolean> {
  const labels = page.locator('label');
  const n = await labels.count();
  let input = null as Locator | null;
  for (let i = 0; i < n; i++) {
    const t = (await labels.nth(i).innerText().catch(() => '')).trim();
    if (!labelRe.test(t)) continue;
    const forId = await labels.nth(i).getAttribute('for');
    if (!forId) continue;
    const el = page.locator(`#${CSS.escape(forId)}`);
    if (await el.isVisible().catch(() => false)) input = el;
  }
  if (!input) return false;
  await input.scrollIntoViewIfNeeded();
  await input.click({ force: true });
  await page.waitForTimeout(500);
  // Expand "All" if two-level menu
  await clickPromptOption(page, /^(all|all fields|show all)\b/i).catch(() => false);
  await input.click({ clickCount: 3 }).catch(() => undefined);
  await input.fill(query);
  await page.waitForTimeout(600);
  let ok = await clickPromptOption(page, new RegExp(escapeRe(query), 'i'));
  if (!ok) {
    // substring match among visible options
    const opts = page.locator('[data-automation-id="promptOption"]:visible');
    const count = await opts.count();
    for (let i = 0; i < count; i++) {
      const txt = (await opts.nth(i).innerText()).replace(/\s+/g, ' ').trim();
      if (txt.toLowerCase().includes(query.toLowerCase())) {
        await opts.nth(i).click({ force: true });
        ok = true;
        break;
      }
    }
  }
  await commitPrompt(page);
  return ok;
}

async function fillLastBlankByLabel(page: Page, labelRes: RegExp[], value: string): Promise<boolean> {
  const labels = page.locator('label');
  const n = await labels.count();
  let target: Locator | null = null;
  for (let i = 0; i < n; i++) {
    const t = (await labels.nth(i).innerText().catch(() => '')).trim();
    if (!labelRes.some((re) => re.test(t))) continue;
    const forId = await labels.nth(i).getAttribute('for');
    if (!forId) continue;
    const el = page.locator(`#${CSS.escape(forId)}`);
    if (!(await el.isVisible().catch(() => false))) continue;
    const tag = await el.evaluate((e) => e.tagName).catch(() => '');
    if (tag === 'INPUT' || tag === 'TEXTAREA') target = el;
  }
  if (!target) {
    // Fallback: getByLabel
    for (const re of labelRes) {
      const loc = page.getByLabel(re).last();
      if (await loc.isVisible().catch(() => false)) {
        target = loc;
        break;
      }
    }
  }
  if (!target) return false;
  await target.click({ force: true }).catch(() => undefined);
  await target.fill('');
  await target.fill(value);
  return true;
}
