/**
 * @file Applicant profile helpers for fillForm (G1) + vault-shaped normalize (P1).
 */

function readPath(profile: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = profile;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Normalize vault-shaped / alias keys into the apply-profile shape used by FieldMaps.
 * Does not invent values — only renames/aliases.
 */
export function normalizeApplyProfile(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  const alias = (from: string, to: string) => {
    if (out[to] === undefined && out[from] !== undefined) out[to] = out[from];
  };
  alias('name', 'fullName');
  alias('full_name', 'fullName');
  alias('linkedinUrl', 'linkedin');
  alias('linkedin_url', 'linkedin');
  alias('resume', 'resumePath');
  alias('resume_path', 'resumePath');
  alias('phone_number', 'phone');
  alias('mobile', 'phone');
  // Nested location → flat city/state helpers still work via getProfilePath.
  if (!out.location && (out.city || out.region || out.state || out.country)) {
    out.location = {
      city: out.city,
      region: out.region ?? out.state,
      country: out.country,
    };
  }
  if (out.education && !Array.isArray(out.education) && typeof out.education === 'object') {
    out.education = [out.education];
  }
  if (!out.answers || typeof out.answers !== 'object') {
    // leave undefined; FieldMaps use answers.*
  }
  return out;
}

/** Read a dotted path from a plain object (e.g. answers.whyCompany). */
export function getProfilePath(profile: Record<string, unknown>, path: string): unknown {
  const direct = readPath(profile, path);
  if (direct !== undefined && direct !== null && direct !== '') return direct;

  // Greenhouse / Workday split-name fields when profile only has fullName.
  if (path === 'firstName' || path === 'lastName') {
    const full = readPath(profile, 'fullName');
    if (typeof full === 'string' && full.trim()) {
      const parts = full.trim().split(/\s+/);
      if (path === 'firstName') return parts[0];
      if (parts.length >= 2) return parts.slice(1).join(' ');
    }
  }
  // Structured address: location object or "City, ST" string.
  if (path === 'city' || path === 'state' || path === 'region' || path === 'country') {
    const loc = readPath(profile, 'location');
    if (loc && typeof loc === 'object' && !Array.isArray(loc)) {
      const o = loc as Record<string, unknown>;
      if (path === 'city' && o.city) return o.city;
      if ((path === 'state' || path === 'region') && (o.region ?? o.state)) return o.region ?? o.state;
      if (path === 'country' && o.country) return o.country;
    }
    if (typeof loc === 'string' && loc.trim()) {
      const bits = loc.split(',').map((s) => s.trim()).filter(Boolean);
      if (path === 'city') return bits[0] || loc.trim();
      if (path === 'state' || path === 'region') {
        if (bits.length >= 2) {
          return bits[1]!.replace(/\d+/g, '').trim() || bits[1];
        }
      }
    }
  }
  // Yes/no flags from legacy string workAuth / sponsorship fields.
  if (path === 'flags.workAuthYes') {
    const w = readPath(profile, 'workAuth');
    if (typeof w === 'string' && w.trim()) {
      if (/not authorized|ineligible|cannot work/i.test(w)) return 'no';
      if (/authorized|citizen|yes|needs sponsorship|require(s)? sponsorship/i.test(w)) return 'yes';
    }
  }
  if (path === 'flags.sponsorshipNo') {
    const w = readPath(profile, 'workAuth');
    if (typeof w === 'string' && w.trim()) {
      if (/needs sponsorship|require(s)? sponsorship/i.test(w)) return 'no';
      if (/authorized|citizen|yes|no sponsorship|does not need/i.test(w)) return 'yes';
    }
  }
  return direct;
}

/** Set a dotted path (mutates). Used by hybrid craft. */
export function setProfilePath(
  profile: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return;
  if (parts.some((p) => p === '__proto__' || p === 'constructor' || p === 'prototype')) {
    throw new Error(`refusing unsafe profile path: ${path}`);
  }
  let cur: Record<string, unknown> = profile;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    if (next === null || next === undefined || typeof next !== 'object') {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

/** Self-check: legacy workAuth strings + location object + vault aliases. */
export function selfCheckProfileFlags(): void {
  const needs = { workAuth: 'Needs sponsorship' };
  if (getProfilePath(needs, 'flags.workAuthYes') !== 'yes') throw new Error('workAuthYes for sponsorship');
  if (getProfilePath(needs, 'flags.sponsorshipNo') !== 'no') throw new Error('sponsorshipNo for sponsorship');
  const ok = { workAuth: 'Authorized — no sponsorship' };
  if (getProfilePath(ok, 'flags.sponsorshipNo') !== 'yes') throw new Error('sponsorshipNo authorized');
  const loc = normalizeApplyProfile({
    name: 'Pat Example',
    linkedin_url: 'https://linkedin.com/in/pat',
    location: { city: 'Tulsa', region: 'OK', country: 'US' },
  });
  if (loc.fullName !== 'Pat Example') throw new Error('alias fullName');
  if (loc.linkedin !== 'https://linkedin.com/in/pat') throw new Error('alias linkedin');
  if (getProfilePath(loc, 'city') !== 'Tulsa') throw new Error('location.city');
  if (getProfilePath(loc, 'state') !== 'OK') throw new Error('location.region→state');
}

if (process.argv[1]?.endsWith('profile.ts') || process.argv[1]?.endsWith('profile.js')) {
  selfCheckProfileFlags();
  console.log('profile self-check ok');
}
