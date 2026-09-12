/**
 * @file Applicant profile helpers for fillForm (G1).
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
  // Structured address from a single location string ("City, ST" or free text).
  if (path === 'city' || path === 'state') {
    const loc = readPath(profile, 'location');
    if (typeof loc === 'string' && loc.trim()) {
      const bits = loc.split(',').map((s) => s.trim()).filter(Boolean);
      if (path === 'city') return bits[0] || loc.trim();
      if (bits.length >= 2) {
        // "NY" or "NY 10001" → state token
        return bits[1]!.replace(/\d+/g, '').trim() || bits[1];
      }
    }
  }
  // Yes/no flags from legacy string workAuth / sponsorship fields.
  if (path === 'flags.workAuthYes') {
    const w = readPath(profile, 'workAuth');
    if (typeof w === 'string' && w.trim()) {
      if (/not authorized|ineligible|cannot work/i.test(w)) return 'no';
      // "Needs sponsorship" still implies authorized-to-work-with-sponsor → Yes on auth radios.
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

/** Self-check: legacy workAuth strings map to yes/no flags both ways. */
export function selfCheckProfileFlags(): void {
  const needs = { workAuth: 'Needs sponsorship' };
  if (getProfilePath(needs, 'flags.workAuthYes') !== 'yes') throw new Error('workAuthYes for sponsorship');
  if (getProfilePath(needs, 'flags.sponsorshipNo') !== 'no') throw new Error('sponsorshipNo for sponsorship');
  const ok = { workAuth: 'Authorized — no sponsorship' };
  if (getProfilePath(ok, 'flags.sponsorshipNo') !== 'yes') throw new Error('sponsorshipNo authorized');
}

if (process.argv[1]?.endsWith('profile.ts') || process.argv[1]?.endsWith('profile.js')) {
  selfCheckProfileFlags();
  console.log('profile self-check ok');
}
