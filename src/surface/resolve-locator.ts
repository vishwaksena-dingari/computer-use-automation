/**
 * @file Ranked Playwright locator resolution (role/name → text → css).
 */
import type { Locator, Page } from 'playwright';
import type { LocatorCandidate, Target } from '../artifact/schema.js';

function byRank(candidates: LocatorCandidate[]): LocatorCandidate[] {
  return [...candidates].sort((a, b) => a.rank - b.rank);
}

/**
 * Build a Playwright locator for one candidate (may match 0..n).
 */
export function candidateLocator(page: Page, c: LocatorCandidate): Locator {
  switch (c.kind) {
    case 'role':
      return page.getByRole((c.role ?? 'button') as Parameters<Page['getByRole']>[0], {
        name: c.name,
        exact: c.exact ?? false,
      });
    case 'label':
      return page.getByLabel(c.text ?? c.name ?? '', { exact: c.exact ?? false });
    case 'placeholder':
      return page.getByPlaceholder(c.text ?? '', { exact: c.exact ?? false });
    case 'altText':
      return page.getByAltText(c.text ?? '', { exact: c.exact ?? false });
    case 'title':
      return page.getByTitle(c.text ?? '', { exact: c.exact ?? false });
    case 'text':
      return page.getByText(c.text ?? '', { exact: c.exact ?? false });
    case 'testId':
      return page.getByTestId(c.text ?? c.name ?? '');
    case 'css':
      return page.locator(c.selector ?? 'impossible-missing-selector');
    default:
      return page.locator('impossible-unknown-kind');
  }
}

/**
 * Resolve first unique visible locator within timeoutMs. Throws on miss.
 */
export async function resolveTarget(page: Page, target: Target): Promise<Locator> {
  const deadline = Date.now() + target.timeoutMs;
  let lastErr = 'no candidates';
  for (const c of byRank(target.candidates)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const loc = candidateLocator(page, c);
    try {
      if (target.strict) {
        await loc.first().waitFor({ state: 'visible', timeout: Math.min(remaining, 2000) });
        const count = await loc.count();
        if (count !== 1) {
          lastErr = `kind=${c.kind} matched ${count}`;
          continue;
        }
        return loc;
      }
      await loc.first().waitFor({ state: 'visible', timeout: Math.min(remaining, 2000) });
      return loc.first();
    } catch (e) {
      lastErr = `${c.kind}: ${(e as Error).message}`;
    }
  }
  // one re-resolve pass (docs/replay-outcomes)
  for (const c of byRank(target.candidates)) {
    const loc = candidateLocator(page, c);
    try {
      const count = await loc.count();
      if (target.strict && count === 1 && (await loc.isVisible())) return loc;
      if (!target.strict && count >= 1 && (await loc.first().isVisible())) return loc.first();
    } catch {
      /* continue */
    }
  }
  throw new Error(`locator_miss: ${lastErr}`);
}
