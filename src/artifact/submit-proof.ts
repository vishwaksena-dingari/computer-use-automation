/**
 * @file Pure helpers: scrape submit confirmation proof from page text (Adapt / G15+/G19).
 * Baseline patterns are generic; ATS family adapters add extras without core hard-coding.
 */
import type { AtsFamily } from '../surface/detect-ats.js';

/** Proof returned to callers after a submit attempt (may be partial). */
export type SubmitProof = {
  /** Short visible confirmation / thank-you snippet (≤240 chars). */
  text?: string;
  /** Application / confirmation / reference id when labeled on the page. */
  reference?: string;
  /** Regex phrase that established confirmation (debug). */
  matchedPhrase?: string;
};

/** Labeled reference / confirmation / application ids (generic, not ATS-specific). */
const REFERENCE_RES: RegExp[] = [
  /\b(?:application|confirmation|reference|tracking)\s+(?:id|number|no\.?|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9._-]{3,})\b/i,
  /\b(?:application|confirmation|reference|tracking)\s*[:#]\s*([A-Z0-9][A-Z0-9._-]{3,})\b/i,
  /\b(?:conf(?:irmation)?|ref(?:erence)?)\s*[:#]\s*([A-Z0-9][A-Z0-9._-]{3,})\b/i,
];

/** Phrases that indicate the ATS accepted the submission (banner / body). */
const CONFIRM_PHRASE_BASE: RegExp[] = [
  /\bapplication\s+received\b[^.!\n]{0,80}/i,
  /\bthank(?:s|\s+you)\b[^.!\n]{0,60}\b(?:for\s+)?(?:apply(?:ing)?|your\s+application)\b[^.!\n]{0,40}/i,
  /\byour\s+application\s+has\s+been\s+(?:submitted|received|sent)\b[^.!\n]{0,40}/i,
  /\b(?:application|submission)\s+(?:complete|successful|confirmed|received)\b[^.!\n]{0,40}/i,
  /\bwe(?:'| ha)?ve\s+(?:received|got)\b[^.!\n]{0,40}\b(?:your\s+)?(?:application|submission)\b[^.!\n]{0,40}/i,
];

/** Family-specific extras — isolated adapters, not sprinkled through the replay core. */
const CONFIRM_PHRASE_FAMILY: Record<AtsFamily, RegExp[]> = {
  greenhouse: [/\bapplication\s+submitted!?\b/i, /\bthanks?\s+for\s+applying\s+to\b/i],
  ashby: [/\bthank you for (?:your )?application\b/i, /\bapplication submitted\b/i],
  lever: [/\bapplication\s+submitted\b/i, /\bthanks for applying\b/i],
  workday: [/\byou(?:'| ha)?ve submitted your application\b/i, /\bapplication\s+successfully\s+submitted\b/i],
  unknown: [],
};

/** Confirm phrase regexes for a family (base + adapter extras). */
export function confirmPhraseResForFamily(family: AtsFamily = 'unknown'): RegExp[] {
  return [...CONFIRM_PHRASE_BASE, ...CONFIRM_PHRASE_FAMILY[family]];
}

/**
 * Single Playwright-friendly regex for visible thank-you / received banners.
 * Keep this coarse — exact FieldMap.successBanner is still checked separately.
 */
export function submitConfirmVisibleRegex(family: AtsFamily = 'unknown'): RegExp {
  switch (family) {
    case 'greenhouse':
      return /application received|thank you for applying|application submitted|thanks for applying to|submitted/i;
    case 'ashby':
      return /application received|thank you for (?:your )?application|application submitted|thank you for applying|submitted/i;
    case 'lever':
      return /application received|application submitted|thanks for applying|thank you for applying|submitted/i;
    case 'workday':
      return /application received|you(?:'| ha)?ve submitted your application|application successfully submitted|thank you for applying|submitted/i;
    default:
      return /application received|thank you for applying|submitted/i;
  }
}

/**
 * Extract the best confirmation snippet + optional reference id from page text.
 * Does not decide success — caller still requires observed banner / submitConfirmed.
 */
export function extractSubmitProof(pageText: string, family: AtsFamily = 'unknown'): SubmitProof {
  const text = pageText.replace(/\s+/g, ' ').trim();
  const proof: SubmitProof = {};

  for (const re of REFERENCE_RES) {
    const m = text.match(re);
    if (m?.[1]) {
      proof.reference = m[1].slice(0, 64);
      break;
    }
  }

  for (const re of confirmPhraseResForFamily(family)) {
    const m = text.match(re);
    if (m?.[0]) {
      proof.matchedPhrase = m[0].trim().slice(0, 120);
      const idx = m.index ?? text.indexOf(m[0]);
      const start = Math.max(0, idx - 20);
      const end = Math.min(text.length, idx + m[0].length + 80);
      proof.text = text.slice(start, end).trim().slice(0, 240);
      break;
    }
  }

  if (!proof.text && proof.reference) {
    proof.text = `reference ${proof.reference}`;
  }

  return proof;
}

/**
 * Operator-facing submit verification state (distinct from fill harvest).
 * - not_requested: fill-only run
 * - not_attempted: --submit but Submit control never clicked
 * - attempted_unconfirmed: clicked Submit; no banner/proof
 * - verified: confirmation observed
 */
export type SubmitVerifyState =
  | 'not_requested'
  | 'not_attempted'
  | 'attempted_unconfirmed'
  | 'verified';

export function resolveSubmitVerifyState(opts: {
  allowSubmit?: boolean;
  submitAttempted?: boolean;
  submitConfirmed?: boolean;
}): SubmitVerifyState {
  if (!opts.allowSubmit) return 'not_requested';
  if (opts.submitConfirmed) return 'verified';
  if (opts.submitAttempted) return 'attempted_unconfirmed';
  return 'not_attempted';
}

export function selfCheckSubmitProof(): void {
  const p = extractSubmitProof(
    'Thanks for applying. Application received (Co A). Confirmation #: COA-42TEST.',
  );
  if (!p.reference || !/COA-42TEST/i.test(p.reference)) throw new Error('reference extract');
  if (!p.text || !/application received/i.test(p.text)) throw new Error('text extract');
  if (resolveSubmitVerifyState({ allowSubmit: false }) !== 'not_requested') {
    throw new Error('not_requested');
  }
  if (
    resolveSubmitVerifyState({
      allowSubmit: true,
      submitAttempted: true,
      submitConfirmed: false,
    }) !== 'attempted_unconfirmed'
  ) {
    throw new Error('attempted_unconfirmed');
  }
  if (
    resolveSubmitVerifyState({
      allowSubmit: true,
      submitAttempted: true,
      submitConfirmed: true,
    }) !== 'verified'
  ) {
    throw new Error('verified');
  }
  if (
    resolveSubmitVerifyState({ allowSubmit: true, submitAttempted: false }) !== 'not_attempted'
  ) {
    throw new Error('not_attempted');
  }
  const gh = extractSubmitProof('Application submitted!', 'greenhouse');
  if (!gh.matchedPhrase || !/application submitted/i.test(gh.matchedPhrase)) {
    throw new Error('greenhouse adapter phrase');
  }
  if (extractSubmitProof('Application submitted!', 'unknown').matchedPhrase) {
    throw new Error('unknown must not match greenhouse-only phrase');
  }
  if (!submitConfirmVisibleRegex('workday').test("You've submitted your application")) {
    throw new Error('workday visible regex');
  }
  if (confirmPhraseResForFamily('ashby').length <= CONFIRM_PHRASE_BASE.length) {
    throw new Error('ashby must add family extras');
  }
}

if (process.argv[1]?.endsWith('submit-proof.ts') || process.argv[1]?.endsWith('submit-proof.js')) {
  selfCheckSubmitProof();
  console.log('submit-proof self-check ok');
}
