/**
 * @file Detect live form validation / required-field errors after Save and Continue.
 * ***REMOVED***
Uses visible alerts, HTML5 validity, and aria-invalid markers.
 */
import type { Page } from 'playwright';

/**
 * Collect visible required/validation error strings on the current page.
 * Used after advancing a multipage ATS wizard to decide whether to repair+retry.
 */
export async function listVisibleRequiredErrors(page: Page): Promise<string[]> {
  const out: string[] = [];
  const selectors = [
    '[data-automation-id*="error"]:visible',
    '[data-automation-id="errorMessage"]:visible',
    '[aria-invalid="true"]:visible',
    '[role="alert"]:visible',
    '.error:visible',
    '[class*="error"]:visible',
  ];
  for (const sel of selectors) {
    const nodes = page.locator(sel);
    const n = await nodes.count().catch(() => 0);
    for (let i = 0; i < Math.min(n, 20); i++) {
      const t = (await nodes.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      if (t && /required|must have|error|invalid|missing/i.test(t)) out.push(t.slice(0, 160));
    }
  }
  // Native HTML5 validity (native inputs only — custom widgets often skip this)
  const html5 = await page
    .evaluate(() => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll('input, select, textarea')) {
        const node = el as HTMLInputElement;
        if (node.type === 'hidden' || node.disabled) continue;
        // Multipage wizards keep later steps in DOM with [hidden] — don't treat as current-page errors.
        if (node.closest('[hidden]')) continue;
        if (typeof node.checkValidity === 'function' && !node.checkValidity()) {
          const label =
            (node.labels && node.labels[0] && node.labels[0].innerText) ||
            node.name ||
            node.id ||
            'field';
          const msg = node.validationMessage || 'invalid';
          bad.push(`${String(label).replace(/\s+/g, ' ').trim().slice(0, 60)}: ${msg}`.slice(0, 160));
        }
      }
      return bad.slice(0, 15);
    })
    .catch(() => [] as string[]);
  out.push(...html5);
  // Workday banner: "Error-How Did You Hear..."
  const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 6000);
  for (const m of body.matchAll(/Error[-:\s]+([^\n|]{5,120})/gi)) {
    out.push(m[0].replace(/\s+/g, ' ').trim().slice(0, 160));
  }
  for (const m of body.matchAll(/([^\n|]{3,80})\s+is required and must have a value/gi)) {
    out.push(m[0].replace(/\s+/g, ' ').trim().slice(0, 160));
  }
  return [...new Set(out)].slice(0, 25);
}

/** True when the page still shows blocking required-field errors. */
export async function pageHasRequiredErrors(page: Page): Promise<boolean> {
  return (await listVisibleRequiredErrors(page)).length > 0;
}
