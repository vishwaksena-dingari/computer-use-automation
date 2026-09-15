/**
 * @file Map fill/stuck details → business outcome codes (forms share D3 taxonomy).
 */
import { classifyFillBlocker } from './fill-receipt.js';

/**
 * Prefer specific form codes over a blanket field.UNMAPPED.
 * captcha / closed are page-level business outcomes; verify is a fill-quality outcome.
 */
export function formOutcomeCode(detail: string, fallback = 'field.UNMAPPED'): string {
  const b = classifyFillBlocker(detail);
  if (b === 'captcha') return 'form.CAPTCHA';
  if (b === 'closed') return 'form.CLOSED';
  if (b === 'widget') return 'form.WIDGET';
  if (b === 'verify') return 'field.VERIFY';
  if (b === 'missing_required') return 'field.UNMAPPED';
  return fallback;
}

/** Best-effort page text → outcome when repair exhausted (captcha / closed job). */
export function formOutcomeFromPageText(bodyText: string, detail: string): string {
  const d = detail.toLowerCase();
  // Prefer detail over body — G21 refuse must not be poisoned by leftover "closed" copy.
  if (/submit refused|already recorded for this job/.test(d)) return 'form.DUPLICATE';
  const t = `${bodyText}\n${detail}`.toLowerCase();
  if (/captcha|recaptcha|hcaptcha|cf-turnstile|verify you are human/.test(t)) return 'form.CAPTCHA';
  if (/no longer accepting|position (is )?closed|job (has been )?closed|not accepting applications/.test(t))
    return 'form.CLOSED';
  return formOutcomeCode(detail);
}

export function selfCheckFormOutcomes(): void {
  if (formOutcomeCode('verify failed for email') !== 'field.VERIFY') throw new Error('verify');
  if (formOutcomeCode('g-recaptcha required') !== 'form.CAPTCHA') throw new Error('captcha');
  if (formOutcomeFromPageText('This position is closed', 'stuck') !== 'form.CLOSED') throw new Error('closed');
  if (
    formOutcomeFromPageText('Application received', 'submit refused: already recorded for this job+profile') !==
    'form.DUPLICATE'
  ) {
    throw new Error('duplicate submit');
  }
}

if (process.argv[1]?.endsWith('form-outcomes.ts') || process.argv[1]?.endsWith('form-outcomes.js')) {
  selfCheckFormOutcomes();
  console.log('form-outcomes self-check ok');
}
