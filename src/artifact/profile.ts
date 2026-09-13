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

  const hoistIdentityAliases = (bag: unknown) => {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return;
    const id = bag as Record<string, unknown>;
    const hoist = (from: string, to: string) => {
      if (out[to] === undefined && id[from] !== undefined) out[to] = id[from];
    };
    hoist('full_name', 'fullName');
    hoist('fullName', 'fullName');
    hoist('name', 'fullName');
    hoist('first_name', 'firstName');
    hoist('firstName', 'firstName');
    hoist('last_name', 'lastName');
    hoist('lastName', 'lastName');
    hoist('email', 'email');
    hoist('phone', 'phone');
    hoist('phone_number', 'phone');
    hoist('mobile', 'phone');
    hoist('linkedin', 'linkedin');
    hoist('linkedin_url', 'linkedin');
    hoist('linkedinUrl', 'linkedin');
    hoist('github_url', 'portfolio');
    hoist('github', 'portfolio');
    // Nested identity.location → top-level location for getProfilePath city/state/country.
    if (out.location === undefined && id.location !== undefined) out.location = id.location;
  };
  // Nested vault hoist (identity / contact / personal / work_auth / sponsorship / answers).
  hoistIdentityAliases(out.identity);
  hoistIdentityAliases(out.contact);
  hoistIdentityAliases(out.personal);

  // career-data uses work_authorization; also accept camelCase / short aliases.
  const workAuth =
    out.work_auth ?? out.workAuth ?? out.workAuthorization ?? out.work_authorization;
  if (typeof workAuth === 'string' && out.workAuth === undefined) out.workAuth = workAuth;
  if (workAuth && typeof workAuth === 'object' && !Array.isArray(workAuth)) {
    const wa = workAuth as Record<string, unknown>;
    const defaults =
      wa.form_defaults && typeof wa.form_defaults === 'object' && !Array.isArray(wa.form_defaults)
        ? (wa.form_defaults as Record<string, unknown>)
        : undefined;
    if (out.workAuth === undefined && wa.status !== undefined) out.workAuth = wa.status;
    if (out.workAuth === undefined && typeof defaults?.authorized === 'string') {
      out.workAuth = defaults.authorized;
    }
    if (out.workAuth === undefined && wa.authorized !== undefined) {
      out.workAuth = wa.authorized ? 'Authorized' : 'Not authorized';
    }
    if (out.workAuth === undefined && wa.legally_authorized_to_work_in_us !== undefined) {
      out.workAuth = wa.legally_authorized_to_work_in_us ? 'Authorized' : 'Not authorized';
    }
    if (out.flags === undefined || typeof out.flags !== 'object') out.flags = {};
    const flags = out.flags as Record<string, unknown>;
    if (flags.workAuthYes === undefined && wa.legally_authorized_to_work_in_us !== undefined) {
      flags.workAuthYes = wa.legally_authorized_to_work_in_us ? 'yes' : 'no';
    }
    if (flags.workAuthYes === undefined && typeof defaults?.authorized === 'string') {
      flags.workAuthYes = /^(yes|authorized|true|1)$/i.test(defaults.authorized.trim())
        ? 'yes'
        : 'no';
    }
    // sponsorshipNo: "yes" = does NOT need sponsorship (FieldMap invert-friendly).
    if (flags.sponsorshipNo === undefined && wa.require_sponsorship_now_or_future !== undefined) {
      flags.sponsorshipNo = wa.require_sponsorship_now_or_future ? 'no' : 'yes';
    }
    if (flags.sponsorshipNo === undefined && typeof defaults?.sponsorship === 'string') {
      // form_defaults.sponsorship "Yes" means needs sponsorship → sponsorshipNo = no.
      flags.sponsorshipNo = /^(yes|true|1|required|needs)/i.test(defaults.sponsorship.trim())
        ? 'no'
        : 'yes';
    }
  }
  const sponsorship = out.sponsorship;
  if (sponsorship && typeof sponsorship === 'object' && !Array.isArray(sponsorship)) {
    const s = sponsorship as Record<string, unknown>;
    if (out.flags === undefined || typeof out.flags !== 'object') out.flags = {};
    const flags = out.flags as Record<string, unknown>;
    if (flags.sponsorshipNo === undefined && s.required !== undefined) {
      flags.sponsorshipNo = s.required ? 'no' : 'yes';
    }
  }
  if (
    (!out.answers || typeof out.answers !== 'object' || Array.isArray(out.answers)) &&
    out.custom_answers &&
    typeof out.custom_answers === 'object' &&
    !Array.isArray(out.custom_answers)
  ) {
    out.answers = out.custom_answers;
  }
  // Nested answers bags when top-level answers empty.
  if (!out.answers || typeof out.answers !== 'object' || Array.isArray(out.answers)) {
    for (const bag of [out.identity, out.contact, out.personal, out.survey, out.application]) {
      if (bag && typeof bag === 'object' && !Array.isArray(bag)) {
        const a = (bag as Record<string, unknown>).answers;
        if (a && typeof a === 'object' && !Array.isArray(a)) {
          out.answers = a;
          break;
        }
      }
    }
  }
  // Flatten education[0] into FieldMap-friendly top-level keys (aliases only).
  const edu0 = Array.isArray(out.education) ? out.education[0] : undefined;
  if (edu0 && typeof edu0 === 'object' && !Array.isArray(edu0)) {
    const e = edu0 as Record<string, unknown>;
    const hoistEdu = (from: string, to: string) => {
      if (out[to] === undefined && e[from] !== undefined) out[to] = e[from];
    };
    hoistEdu('school', 'school');
    hoistEdu('university', 'school');
    hoistEdu('name', 'school');
    hoistEdu('degree', 'degree');
    hoistEdu('fieldOfStudy', 'fieldOfStudy');
    hoistEdu('field', 'fieldOfStudy');
    hoistEdu('major', 'fieldOfStudy');
    hoistEdu('discipline', 'fieldOfStudy');
    hoistEdu('fromYear', 'eduFromYear');
    hoistEdu('startYear', 'eduFromYear');
    hoistEdu('toYear', 'eduToYear');
    hoistEdu('endYear', 'eduToYear');
    hoistEdu('gpa', 'gpa');
  }
  return out;
}

/** True when path is not a known apply-profile key (LLM / plan allowlist). */
export function isOpaqueProfilePath(path: string, profileKeys: string[]): boolean {
  if (profileKeys.includes(path)) return false;
  if (path.startsWith('answers.') || path.startsWith('flags.') || path.startsWith('_plan.'))
    return false;
  if (
    /^(fullName|email|phone|resumePath|linkedin|portfolio|location|startDate|workAuth|firstName|lastName|password|country|company|howHeard|phoneDeviceType|address1|city|state|postalCode|school|degree|fieldOfStudy|eduFromYear|eduToYear|gpa)$/.test(
      path,
    )
  )
    return false;
  if (/^[0-9a-f]{8}/i.test(path)) return true;
  if (/systemfield/i.test(path)) return true;
  if (path.length > 40) return true;
  return !profileKeys.some((k) => path === k || path.startsWith(`${k}.`));
}

/**
 * Format vault location object (or string) for text/combobox fields.
 * Keeps city/state/country readable via getProfilePath('city'|…).
 */
export function formatLocationDisplay(loc: unknown): string | undefined {
  if (loc === undefined || loc === null || loc === '') return undefined;
  if (typeof loc === 'string') {
    const t = loc.trim();
    if (!t || t === '[object Object]') return undefined;
    return t;
  }
  if (typeof loc === 'object' && !Array.isArray(loc)) {
    const o = loc as Record<string, unknown>;
    const parts = [o.city, o.region ?? o.state, o.country]
      .map((x) => (typeof x === 'string' ? x.trim() : x != null && x !== '' ? String(x).trim() : ''))
      .filter((s) => s && s !== '[object Object]');
    return parts.length ? parts.join(', ') : undefined;
  }
  return undefined;
}

/** Read a dotted path from a plain object (e.g. answers.whyCompany). */
export function getProfilePath(profile: Record<string, unknown>, path: string): unknown {
  // Text fields bind profilePath "location" — never return a raw object (→ "[object Object]").
  if (path === 'location') {
    const fromLoc = formatLocationDisplay(readPath(profile, 'location'));
    if (fromLoc) return fromLoc;
    const syn = formatLocationDisplay({
      city: readPath(profile, 'city'),
      region: readPath(profile, 'region') ?? readPath(profile, 'state'),
      country: readPath(profile, 'country'),
    });
    if (syn) return syn;
  }

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
  const vault = normalizeApplyProfile({
    identity: { full_name: 'Sam Vault', email: 'sam@example.com' },
    work_auth: { authorized: true },
    sponsorship: { required: false },
  });
  if (vault.fullName !== 'Sam Vault') throw new Error('vault identity.full_name');
  if (vault.email !== 'sam@example.com') throw new Error('vault identity.email');
  if (vault.workAuth !== 'Authorized') throw new Error('vault work_auth');
  const flags = vault.flags as Record<string, unknown> | undefined;
  if (flags?.sponsorshipNo !== 'yes') throw new Error('vault sponsorship.required→sponsorshipNo');

  const contact = normalizeApplyProfile({
    contact: { name: 'Casey Contact', phone: '555-0100' },
    workAuthorization: { status: 'Citizen' },
    education: [{ school: 'OU', degree: 'BS', major: 'CS', startYear: 2018, endYear: 2022 }],
    identity: { answers: { whyCompany: 'Fit' } },
  });
  if (contact.fullName !== 'Casey Contact') throw new Error('contact.name→fullName');
  if (contact.phone !== '555-0100') throw new Error('contact.phone');
  if (contact.workAuth !== 'Citizen') throw new Error('workAuthorization.status');
  if (contact.school !== 'OU' || contact.degree !== 'BS' || contact.fieldOfStudy !== 'CS') {
    throw new Error('education[0] flatten');
  }
  if (contact.eduFromYear !== 2018 || contact.eduToYear !== 2022) throw new Error('education years');
  const ans = contact.answers as Record<string, unknown> | undefined;
  if (ans?.whyCompany !== 'Fit') throw new Error('identity.answers hoist');

  // career-data apply-profile shape (work_authorization + identity.location + discipline).
  const career = normalizeApplyProfile({
    identity: {
      full_name: 'Dana Career',
      email: 'dana@example.com',
      location: { city: 'City', state: 'MD', country: 'United States' },
    },
    work_authorization: {
      legally_authorized_to_work_in_us: true,
      require_sponsorship_now_or_future: true,
      form_defaults: { authorized: 'Yes', sponsorship: 'Yes' },
    },
    education: [{ school: 'UMD', degree: 'MS', discipline: 'CS' }],
  });
  if (career.fullName !== 'Dana Career') throw new Error('career identity.full_name');
  if (getProfilePath(career, 'city') !== 'City') throw new Error('career identity.location.city');
  if (getProfilePath(career, 'state') !== 'MD') throw new Error('career identity.location.state');
  if (career.workAuth !== 'Yes') throw new Error('career form_defaults.authorized→workAuth');
  const cf = career.flags as Record<string, unknown> | undefined;
  if (cf?.workAuthYes !== 'yes') throw new Error('career legally_authorized→workAuthYes');
  if (cf?.sponsorshipNo !== 'no') throw new Error('career require_sponsorship→sponsorshipNo');
  if (career.fieldOfStudy !== 'CS') throw new Error('career education.discipline');
}

if (process.argv[1]?.endsWith('profile.ts') || process.argv[1]?.endsWith('profile.js')) {
  selfCheckProfileFlags();
  console.log('profile self-check ok');
}
