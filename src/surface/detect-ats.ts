/**
 * @file Detect ATS family from URL (and optional page text) so shells/adapters can specialize.
 * Detect ATS family from URL / page markers so fills can specialize.
 */
export type AtsFamily = 'ashby' | 'lever' | 'greenhouse' | 'workday' | 'unknown';

/**
 * Classify careers URL into an ATS family.
 * Prefer host markers; fall back to body text hints when URL is a corporate careers proxy.
 */
export function detectAtsFamily(url: string, bodyText = ''): AtsFamily {
  const u = url.toLowerCase();
  // about:blank / empty — wait for post-navigate sniff (callers pass page.url() after load).
  if (!u || u === 'about:blank' || u === 'blank') {
    const b = bodyText.toLowerCase().slice(0, 8000);
    if (b) {
      if (/data-automation-id=["']formfield-/i.test(bodyText) || /myworkdayjobs|workday, inc/i.test(b))
        return 'workday';
      if (/ashby|data-testid=["'][^"']*ashby/i.test(b)) return 'ashby';
      if (/lever-application|posting-requirements|jobs\.lever/i.test(b)) return 'lever';
      if (/greenhouse|grnhse|application--form/i.test(b)) return 'greenhouse';
    }
    return 'unknown';
  }
  if (/ashbyhq\.com|jobs\.ashbyhq\.com|ashby\.co/.test(u)) return 'ashby';
  if (/jobs\.lever\.co|lever\.co\/|hire\.lever/.test(u)) return 'lever';
  if (/greenhouse\.io|boards\.greenhouse|grnh\.se/.test(u)) return 'greenhouse';
  if (/myworkdayjobs\.com|wd\d+\.myworkdayjobs|workdayjobs/.test(u)) return 'workday';

  const b = bodyText.toLowerCase().slice(0, 8000);
  if (/data-automation-id=["']formfield-/i.test(bodyText) || /myworkdayjobs|workday, inc/i.test(b))
    return 'workday';
  if (/ashby|data-testid=["'][^"']*ashby/i.test(b)) return 'ashby';
  if (/lever-application|posting-requirements|jobs\.lever/i.test(b)) return 'lever';
  if (/greenhouse|grnhse|application--form/i.test(b)) return 'greenhouse';
  return 'unknown';
}

/** Tiny self-check — fails if host detection regresses. */
export function selfCheckDetectAts(): void {
  const cases: Array<[string, AtsFamily]> = [
    ['https://jobs.ashbyhq.com/sciemo/abc', 'ashby'],
    ['https://jobs.lever.co/100ms/xyz', 'lever'],
    ['https://boards.greenhouse.io/figma/jobs/1', 'greenhouse'],
    [
      'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/x',
      'workday',
    ],
    ['https://abbott.wd5.myworkdayjobs.com/abbottcareers/job/y', 'workday'],
    ['https://example.com/careers', 'unknown'],
    ['about:blank', 'unknown'],
  ];
  for (const [url, want] of cases) {
    const got = detectAtsFamily(url);
    if (got !== want) throw new Error(`detectAtsFamily(${url})=${got} want ${want}`);
  }
  if (detectAtsFamily('about:blank', 'Powered by Ashby') !== 'ashby') {
    throw new Error('about:blank + body should detect ashby');
  }
}

if (process.argv[1]?.endsWith('detect-ats.ts') || process.argv[1]?.endsWith('detect-ats.js')) {
  selfCheckDetectAts();
  console.log('detect-ats self-check ok');
}
