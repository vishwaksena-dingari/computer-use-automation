/**
 * @file One-item apply claim (Cluster 2 / letter C) — career-data queue item → `cua apply` args.
 * Replaces Python `ui_assist_playwright.py --item` once deletion criterion is met.
 */
import { z } from 'zod';

/** Claim JSON a hunt worker writes; paths must later resolve under the cua project root (copy vault first). */
export const ApplyClaimSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    /** Apply form URL (required). */
    url: z.string().url(),
    /** Profile JSON path under the cua repo (after copy-vault-private). */
    profile: z.string().min(1),
    /** Optional upstream plan JSON (playbook `--plan-out` / letter D). */
    planJson: z.string().min(1).optional(),
  /** Optional resume path hint for vault copy (not read by fill — use profile.resumePath after copy). */
  resume: z.string().min(1).optional(),
    ats: z.enum(['auto', 'ashby', 'lever', 'greenhouse', 'workday']).optional(),
    submit: z.boolean().optional(),
    headed: z.boolean().optional(),
    escalate: z.boolean().optional(),
    fieldMapId: z.string().min(1).optional(),
    mode: z.enum(['deterministic', 'hybrid']).optional(),
    /**
     * Absolute path to career-data root (letter B). Not read by fill — only for
     * copy-vault helpers that stage files into `.private/` before apply.
     */
    vaultRoot: z.string().min(1).optional(),
  })
  .strict();

export type ApplyClaim = z.infer<typeof ApplyClaimSchema>;

/** Flags `cua apply` understands after claim merge (CLI flags still win when set). */
export type ApplyClaimResolved = {
  url: string;
  profile: string;
  planJson?: string;
  resume?: string;
  ats: string;
  submit: boolean;
  headed: boolean;
  escalate: boolean;
  fieldMapId?: string;
  mode: 'deterministic' | 'hybrid';
  vaultRoot?: string;
};

/**
 * Parse claim JSON. Throws on invalid shape.
 * Side effect: none.
 */
export function parseApplyClaim(raw: unknown): ApplyClaim {
  const parsed = ApplyClaimSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new Error(`apply claim invalid: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Merge claim with optional CLI overrides.
 * CLI `submit: false` (--no-submit) forces fill-only; `submit: true` forces on; else claim.submit.
 * Side effect: none.
 */
export function resolveApplyClaim(
  claim: ApplyClaim,
  cli: {
    url?: string;
    profile?: string;
    planJson?: string;
    ats?: string;
    /** true = --submit; false = --no-submit; undefined = leave to claim */
    submit?: boolean;
    headed?: boolean;
    escalate?: boolean;
    fieldMapId?: string;
    mode?: string;
  } = {},
): ApplyClaimResolved {
  const submit =
    cli.submit === false ? false : cli.submit === true ? true : Boolean(claim.submit);
  return {
    url: cli.url?.trim() || claim.url,
    profile: cli.profile?.trim() || claim.profile,
    planJson: cli.planJson?.trim() || claim.planJson,
    resume: claim.resume,
    ats: cli.ats && cli.ats !== 'auto' ? cli.ats : claim.ats || cli.ats || 'auto',
    submit,
    headed: cli.headed === true ? true : Boolean(claim.headed),
    escalate: cli.escalate === true ? true : Boolean(claim.escalate),
    fieldMapId: cli.fieldMapId?.trim() || claim.fieldMapId,
    mode: (cli.mode === 'hybrid' || claim.mode === 'hybrid' ? 'hybrid' : 'deterministic') as
      | 'deterministic'
      | 'hybrid',
    vaultRoot: claim.vaultRoot,
  };
}

/**
 * Map career-data ui_assist `--item` shape (url + paths.pdf) + profile path into a claim.
 * Side effect: none.
 */
export function claimFromUiAssistItem(opts: {
  item: { url?: string; apply_url?: string; paths?: { pdf?: string } };
  profile: string;
  planJson?: string;
  vaultRoot?: string;
  submit?: boolean;
}): ApplyClaim {
  const url = opts.item.url || opts.item.apply_url;
  if (!url || typeof url !== 'string') {
    throw new Error('apply claim: item missing url / apply_url');
  }
  return parseApplyClaim({
    schemaVersion: 1,
    url,
    profile: opts.profile,
    planJson: opts.planJson,
    resume: opts.item.paths?.pdf,
    vaultRoot: opts.vaultRoot,
    submit: opts.submit,
  });
}

export function selfCheckApplyClaim(): void {
  const c = parseApplyClaim({
    schemaVersion: 1,
    url: 'https://jobs.ashbyhq.com/x/y',
    profile: '.private/profile.json',
    planJson: '.private/plan.json',
    vaultRoot: '/tmp/career-data',
  });
  const r = resolveApplyClaim(c, { submit: true, ats: 'ashby' });
  if (r.submit !== true || r.ats !== 'ashby') throw new Error('resolveApplyClaim CLI wins');
  const claimAts = resolveApplyClaim(
    parseApplyClaim({
      schemaVersion: 1,
      url: 'https://jobs.ashbyhq.com/x/y',
      profile: '.private/profile.json',
      ats: 'lever',
    }),
    { ats: 'auto' },
  );
  if (claimAts.ats !== 'lever') throw new Error('claim.ats must beat default auto');
  if (r.planJson !== '.private/plan.json') throw new Error('planJson passthrough');
  const forcedOff = resolveApplyClaim(
    parseApplyClaim({
      schemaVersion: 1,
      url: 'https://jobs.ashbyhq.com/x/y',
      profile: '.private/profile.json',
      submit: true,
    }),
    { submit: false },
  );
  if (forcedOff.submit !== false) throw new Error('--no-submit (submit:false) must force fill-only');
  const fromItem = claimFromUiAssistItem({
    item: { url: 'https://job-boards.greenhouse.io/figma/jobs/1', paths: { pdf: '/vault/r.pdf' } },
    profile: '.private/profile.json',
  });
  if (!fromItem.resume?.endsWith('r.pdf')) throw new Error('item paths.pdf → resume');
  let threw = false;
  try {
    parseApplyClaim({ url: 'not-a-url', profile: 'p' });
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('invalid url must throw');
}

if (process.argv[1]?.endsWith('apply-claim.ts') || process.argv[1]?.endsWith('apply-claim.js')) {
  selfCheckApplyClaim();
  console.log('apply-claim self-check ok');
}
