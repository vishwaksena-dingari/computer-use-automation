/**
 * @file Pure control→field inference (no Page / no LLM). Used by repairFieldMap (T-F-7 / C3).
 */
import type { FieldMapField, LocatorCandidate } from './schema.js';
import type { ControlHint } from '../surface/observe-controls.js';

export function isNegatedSponsorshipQuestion(text: string): boolean {
  return /without\s+(requiring\s+)?sponsorship|not\s+require\s+sponsorship|no\s+sponsorship\s+required/i.test(
    text,
  );
}

export function inferFieldMap(controls: ControlHint[], profileKeys: string[]): FieldMapField[] {
  const fields: FieldMapField[] = [];
  const radioGroups = new Map<string, ControlHint[]>();

  for (const c of controls) {
    if (c.widget === 'radio' && c.inputName) {
      const list = radioGroups.get(c.inputName) || [];
      list.push(c);
      radioGroups.set(c.inputName, list);
      continue;
    }
    const h = heuristicFieldFromControl(c, profileKeys);
    if (h) fields.push(h);
  }

  for (const [, opts] of radioGroups) {
    const h = heuristicRadioGroup(opts, profileKeys);
    if (h) fields.push(h);
  }

  return fields;
}

function blob(c: ControlHint): string {
  return [c.label, c.question, c.name, c.placeholder, c.id, c.inputName, c.text]
    .filter(Boolean)
    .join(' ');
}

/** Identity-ish text only — excludes nearby question (Ashby/Workday pollution). */
function coreBlob(c: ControlHint): string {
  return [c.label, c.name, c.placeholder, c.id, c.inputName, c.type, c.text].filter(Boolean).join(' ');
}

export function pickPath(keys: string[], candidates: string[], fallback: string): string {
  for (const c of candidates) {
    if (!keys.length || keys.includes(c) || c.startsWith('flags.') || c.startsWith('answers.'))
      return c;
  }
  return fallback;
}

function heuristicRadioGroup(opts: ControlHint[], profileKeys: string[]): FieldMapField | null {
  if (!opts.length) return null;
  const sample = opts[0];
  const b = blob(sample) + ' ' + opts.map((o) => o.label || o.text || '').join(' ');

  if (/communicationConsent|text message|consent to receiving/i.test(b)) {
    const no = opts.find((o) => /notGiven|do not consent/i.test(`${o.value} ${o.label} ${o.text}`));
    if (!no) return null;
    const targets: LocatorCandidate[] = [];
    const nm = (no.label || no.text || '').slice(0, 80);
    if (nm) targets.push({ kind: 'role', rank: 1, role: 'radio', name: nm });
    if (no.value && no.inputName)
      targets.push({
        kind: 'css',
        rank: 2,
        selector: `input[name='${no.inputName}'][value='${no.value}']`,
      });
    return {
      key: 'smsConsent',
      required: true,
      profilePath: pickPath(profileKeys, ['flags.smsConsentNo'], 'flags.smsConsentNo'),
      kind: 'radio',
      targets,
    };
  }

  // Workday: previously employed?
  if (/previously worked|former employee|employee or contractor/i.test(b)) {
    const no = opts.find((o) => /^(No)$/i.test((o.label || o.text || '').trim()));
    if (!no) return null;
    const targets: LocatorCandidate[] = [];
    const nm = (no.label || no.text || 'No').slice(0, 80);
    targets.push({ kind: 'role', rank: 1, role: 'radio', name: nm });
    if (no.id) targets.push({ kind: 'css', rank: 2, selector: `#${no.id}` });
    return {
      key: 'previouslyEmployed',
      required: true,
      profilePath: pickPath(profileKeys, ['flags.previouslyEmployedNo'], 'flags.previouslyEmployedNo'),
      kind: 'radio',
      targets,
    };
  }

  if (
    /monthly|NYC|in-person|travel/i.test(b) &&
    opts.some((o) => /^(Yes|No)$/i.test(o.label || o.text || ''))
  ) {
    const yes = opts.find((o) => /^(Yes)$/i.test((o.label || o.text || '').trim()));
    if (!yes) return null;
    const targets: LocatorCandidate[] = [];
    if (yes.id?.includes('-labeled-radio-')) {
      const suffix = yes.id.replace(/^.*?(_[0-9a-f-]{30,}-labeled-radio-\d+)$/i, '$1');
      if (suffix.startsWith('_'))
        targets.push({ kind: 'css', rank: 1, selector: `input[id$='${suffix}']` });
    }
    if (yes.id) targets.push({ kind: 'css', rank: targets.length + 1, selector: `#${yes.id}` });
    return {
      key: 'monthlyTravel',
      required: true,
      profilePath: pickPath(profileKeys, ['flags.monthlyTravelYes'], 'flags.monthlyTravelYes'),
      kind: 'radio',
      targets,
    };
  }

  if (/visa|sponsorhip|sponsorship not required|F-1 OPT|H-1B/i.test(b)) {
    const none = opts.find((o) => /not required/i.test(o.label || o.text || ''));
    if (!none) return null;
    const targets: LocatorCandidate[] = [
      {
        kind: 'role',
        rank: 1,
        role: 'radio',
        name: none.label || none.text || 'Visa Sponsorhip Not Required',
      },
    ];
    if (none.id?.includes('-labeled-radio-')) {
      const suffix = none.id.replace(/^.*?(_[0-9a-f-]{30,}-labeled-radio-\d+)$/i, '$1');
      if (suffix.startsWith('_'))
        targets.push({ kind: 'css', rank: 2, selector: `input[id$='${suffix}']` });
    }
    return {
      key: 'visaType',
      required: true,
      profilePath: pickPath(profileKeys, ['flags.visaNotRequired'], 'flags.visaNotRequired'),
      kind: 'radio',
      targets,
    };
  }

  return null;
}

export function heuristicFieldFromControl(c: ControlHint, profileKeys: string[]): FieldMapField | null {
  if (c.widget === 'yesno') return heuristicYesNo(c, profileKeys);
  if (c.tag === 'button' || c.type === 'submit') return null;
  if (c.id?.includes('g-recaptcha') || c.inputName === 'g-recaptcha-response') return null;
  if (!(c.tag === 'input' || c.tag === 'select' || c.tag === 'textarea' || c.widget === 'combobox'))
    return null;
  if (c.widget === 'radio') return null;

  const b = blob(c);
  const core = coreBlob(c);
  const targets: LocatorCandidate[] = [];
  const label = (c.label || '')
    .replace(/\s*[＊✱*]\s*$/u, '')
    .replace(/[＊✱*]/gu, '')
    .trim()
    .slice(0, 80);

  if (c.widget === 'file' || c.type === 'file') {
    if (!/resume|cv|curriculum|upload/i.test(core + ' ' + b) && c.id !== '_systemfield_resume' && c.inputName !== 'resume')
      return null;
    if (label && label.length < 60) targets.push({ kind: 'label', rank: 1, name: label.split(/\s{2,}/)[0] || 'Resume' });
    if (c.id) targets.push({ kind: 'css', rank: targets.length + 1, selector: `#${c.id}` });
    else if (c.inputName)
      targets.push({
        kind: 'css',
        rank: targets.length + 1,
        selector: `input[type='file'][name='${c.inputName}']`,
      });
    else targets.push({ kind: 'css', rank: targets.length + 1, selector: "input[type='file']" });
    return {
      key: 'resume',
      required: true,
      profilePath: pickPath(profileKeys, ['resumePath'], 'resumePath'),
      kind: 'file',
      targets,
    };
  }

  // Honeypot / bot traps
  if (
    c.inputName === 'website' ||
    /beecatcher|for robots only|robots only/i.test(b) ||
    c.dataField === 'beecatcher'
  )
    return null;

  if (c.widget === 'checkbox' || c.type === 'checkbox') {
    if (!/i agree|agree|terms|integrity|candidate account|createAccountCheckbox/i.test(core + ' ' + b + ' ' + (c.dataField || '')))
      return null;
    if (c.dataField) targets.push({ kind: 'css', rank: 1, selector: `[data-automation-id='${c.dataField}']` });
    if (c.id) targets.push({ kind: 'css', rank: targets.length + 1, selector: `#${c.id}` });
    if (label) targets.push({ kind: 'label', rank: targets.length + 1, name: label });
    if (!targets.length) return null;
    return {
      key: 'agreeTerms',
      required: true,
      profilePath: pickPath(profileKeys, ['flags.agreeTerms'], 'flags.agreeTerms'),
      kind: 'checkbox',
      targets,
    };
  }

  let profilePath: string | null = null;
  let kind: FieldMapField['kind'] = 'text';
  let key = 'field';
  let required = Boolean(c.required);
  let craft: 'llm' | undefined;
  let invertBool: boolean | undefined;

  if (
    /email/i.test(core) ||
    c.type === 'email' ||
    c.inputName === 'email' ||
    c.inputName === '_systemfield_email' ||
    c.id === '_systemfield_email' ||
    c.dataField === 'email'
  ) {
    profilePath = 'email';
    key = 'email';
    required = true;
  } else if (
    (profileKeys.includes('password') || profileKeys.includes('passwordConfirm')) &&
    (c.type === 'password' || /password/i.test(core) || c.dataField === 'password' || c.dataField === 'verifyPassword')
  ) {
    profilePath = 'password';
    key =
      /confirm|verify|re-?enter|repeat/i.test(core) || c.dataField === 'verifyPassword'
        ? 'passwordConfirm'
        : 'password';
    required = true;
  } else if (/legal\s*first|first\s*name/i.test(core) || /firstName/i.test(c.id || '')) {
    profilePath = 'firstName';
    key = 'firstName';
    required = true;
  } else if (/legal\s*last|last\s*name/i.test(core) || /lastName/i.test(c.id || '')) {
    profilePath = 'lastName';
    key = 'lastName';
    required = true;
  } else if (/how did you hear|source\s*type|hear about us/i.test(core + ' ' + b) || c.dataField === 'formField-source') {
    profilePath = 'howHeard';
    key = 'howHeard';
    required = true;
    kind = 'text';
  } else if (/phone\s*device\s*type|device\s*type/i.test(core)) {
    profilePath = 'phoneDeviceType';
    key = 'phoneDeviceType';
    required = true;
    kind = 'select';
  } else if (/country\s*phone\s*code|phone\s*code|phone\s*extension/i.test(core)) {
    return null; // leave Workday defaults
  } else if (
    /phone\s*number|^phone\b/i.test(core) ||
    c.type === 'tel' ||
    c.inputName === 'phone'
  ) {
    profilePath = 'phone';
    key = 'phone';
    required = true;
  } else if (/address\s*line\s*1|^address$/i.test(core)) {
    profilePath = 'address1';
    key = 'address1';
    required = Boolean(c.required);
  } else if (/^city$/i.test(label || '') || /^city\b/i.test(core)) {
    profilePath = 'city';
    key = 'city';
    required = Boolean(c.required);
  } else if (/^state$/i.test(label || '') || /state\/province|province/i.test(core)) {
    profilePath = 'state';
    key = 'state';
    required = Boolean(c.required);
    kind = c.tag === 'select' || c.widget === 'select' || c.widget === 'combobox' ? 'select' : 'text';
  } else if (/postal|zip\s*code/i.test(core)) {
    profilePath = 'postalCode';
    key = 'postalCode';
    required = Boolean(c.required);
  } else if (
    /^(country|country\/region)\b/i.test(core) &&
    !/phone|authorized|sponsorship/i.test(`${b} ${c.question || ''}`)
  ) {
    profilePath = 'country';
    key = 'country';
    required = true;
    kind = c.tag === 'select' || c.widget === 'combobox' || c.widget === 'select' ? 'select' : 'text';
  } else if (/country/i.test(core) && /phone/i.test(`${c.question || ''} ${c.label || ''}`)) {
    // Greenhouse phone dial-code "Country" combobox — leave default.
    return null;
  } else if (/school or university|^school$|institution|university|college/i.test(core)) {
    profilePath = pickPath(profileKeys, ['school'], 'school');
    key = 'school';
    required = Boolean(c.required) || /✱|\*/.test(c.label || '');
  } else if (/^degree$/i.test(label || '') || (/degree/i.test(core) && !/field|study/i.test(core))) {
    profilePath = pickPath(profileKeys, ['degree'], 'degree');
    key = 'degree';
    required = Boolean(c.required) || /✱|\*/.test(c.label || '');
    kind = c.tag === 'select' || c.widget === 'combobox' ? 'select' : 'text';
  } else if (/field of study|major|area of study/i.test(core)) {
    profilePath = pickPath(profileKeys, ['fieldOfStudy'], 'fieldOfStudy');
    key = 'fieldOfStudy';
    required = Boolean(c.required) || /✱|\*/.test(c.label || '');
    kind = 'text';
  } else if (/overall result|\bgpa\b|grade point/i.test(core)) {
    profilePath = pickPath(profileKeys, ['gpa'], 'gpa');
    key = 'gpa';
    required = false;
  } else if (/^from\b|start year|attendance.*from/i.test(core) && /year|yyyy|date/i.test(b + ' ' + (c.placeholder || ''))) {
    profilePath = pickPath(profileKeys, ['eduFromYear'], 'eduFromYear');
    key = 'eduFromYear';
    required = Boolean(c.required);
  } else if (/^to\b|end year|expected|graduation year/i.test(core) && /year|yyyy|date|expected/i.test(b + ' ' + (c.placeholder || ''))) {
    profilePath = pickPath(profileKeys, ['eduToYear'], 'eduToYear');
    key = 'eduToYear';
    required = Boolean(c.required);
  } else if (/linkedin/i.test(core)) {
    profilePath = 'linkedin';
    key = 'linkedin';
    required = /✱|\*/.test(c.label || '') || Boolean(c.required);
  } else if (/github|portfolio|kaggle|stackoverflow/i.test(core) || (/website/i.test(core) && c.inputName !== 'website')) {
    profilePath = 'portfolio';
    key = 'portfolio';
    required = false;
  } else if (
    c.inputName === 'name' ||
    c.inputName === 'legalName' ||
    c.inputName === '_systemfield_name' ||
    c.id === 'legalName' ||
    /full\s*name|legal\s*name|^name$|_systemfield_name/i.test(core) ||
    c.id === '_systemfield_name'
  ) {
    profilePath = 'fullName';
    key = 'fullName';
    required = true;
  } else if (
    /current company|\borg\b/i.test(core) ||
    c.inputName === 'org'
  ) {
    profilePath = 'company';
    key = 'company';
    required = Boolean(c.required) || /✱|\*/.test(c.label || '');
  } else if (
    // Greenhouse / Ashby yes-no style comboboxes (not free-text location)
    (c.widget === 'combobox' || c.widget === 'select' || c.tag === 'select') &&
    /authorized to work|legally authorized|work authorization|require sponsorship|without.*sponsorship|need sponsorship/i.test(
      b,
    )
  ) {
    const opts = (c.options || []).filter((o) => o && !/^select/i.test(o));
    const onlyYesNo = opts.length > 0 && opts.every((o) => /^(yes|no)$/i.test(o.trim()));
    const authStyle = opts.some((o) => /authorized|needs sponsorship/i.test(o));
    if (c.tag === 'select' && authStyle && !onlyYesNo) {
      // Mock / ATS selects with Authorized vs Needs sponsorship — use string workAuth.
      profilePath = 'workAuth';
      key = 'workAuth';
      kind = 'select';
      required = true;
    } else if (isNegatedSponsorshipQuestion(b) || /require sponsorship|need sponsorship/i.test(b)) {
      profilePath = 'flags.sponsorshipNo';
      key = `sponsorship-${(c.id || core).slice(0, 24)}`;
      invertBool = !isNegatedSponsorshipQuestion(b);
      kind = c.tag === 'select' ? 'select' : 'text';
      required = true;
    } else {
      profilePath = 'flags.workAuthYes';
      key = `workAuth-${(c.id || core).slice(0, 24)}`;
      kind = c.tag === 'select' ? 'select' : 'text';
      required = true;
    }
  } else if (
    (c.widget === 'combobox' || c.tag === 'select') &&
    /yes\s*\/\s*no|experience in|do you have|are you|will you|have you/i.test(b) &&
    !/location|country|city/i.test(core)
  ) {
    // Required custom Y/N — prefer decline-safe flags; craftable essays stay elsewhere.
    profilePath = pickPath(profileKeys, ['flags.workAuthYes', 'answers.additional'], 'flags.workAuthYes');
    key = `custom-${(c.id || core).slice(0, 32)}`;
    kind = 'text';
    required = Boolean(c.required) || /✱|\*/.test(c.label || '');
  } else if (
    (c.tag === 'select' || c.widget === 'combobox' || c.widget === 'select') &&
    /gender|sex\b|race|ethnicity|veteran|disability|lgbt|hispanic|demographic|\beeo\b|equal opportunity|self-identify|pronoun/i.test(
      b,
    )
  ) {
    profilePath = pickPath(profileKeys, ['flags.eeoDecline'], 'flags.eeoDecline');
    key = `eeo-${(c.id || core).slice(0, 28)}`;
    kind = c.tag === 'select' ? 'select' : 'text';
    required = Boolean(c.required) || /✱|\*/.test(c.label || '');
  } else if (
    /start typing/i.test(c.placeholder || '') ||
    c.inputName === 'location' ||
    /current location|^location|city\)/i.test(core) ||
    (c.widget === 'combobox' && /location|city/i.test(core))
  ) {
    profilePath = 'location';
    key = 'location';
    required = Boolean(c.required) || /✱|\*/.test(c.label || '');
  } else if (/pick date|available to start|start date/i.test(b)) {
    profilePath = 'startDate';
    key = 'startDate';
    required = true;
  } else if (c.tag === 'textarea' || c.widget === 'textarea') {
    if (/additional|anything else|love to share|why/i.test(b)) {
      const isWhy = /why/i.test(b);
      profilePath = isWhy ? 'answers.whyCompany' : 'answers.additional';
      // Align with import-plan keys (whyCompany) so seed literals are not shadow-dropped.
      key = isWhy ? 'whyCompany' : 'additional';
      kind = 'textarea';
      required = false;
      craft = isWhy ? 'llm' : undefined;
    } else return null;
  } else if (c.tag === 'select') {
    if (!/auth|sponsor|authorized to work|country/i.test(b)) return null;
    if (/country/i.test(core)) {
      profilePath = 'country';
      kind = 'select';
      key = 'country';
    } else if (
      c.inputName === 'workAuth' ||
      c.id === 'workAuth' ||
      /work auth|authorized to work/i.test(label || core)
    ) {
      // Option text often includes "Needs sponsorship" — don't let that steal workAuth.
      profilePath = 'workAuth';
      kind = 'select';
      key = 'workAuth';
    } else if (/sponsor/i.test(label || '')) {
      profilePath = 'flags.sponsorshipNo';
      kind = 'select';
      key = 'sponsorship';
    } else {
      profilePath = 'workAuth';
      kind = 'select';
      key = 'workAuth';
    }
  } else {
    return null;
  }

  if (
    invertBool === undefined &&
    (kind === 'select' || kind === 'text') &&
    profilePath === 'flags.sponsorshipNo' &&
    !isNegatedSponsorshipQuestion(b) &&
    /sponsor/i.test(b)
  ) {
    invertBool = true;
  }
  const enumHints =
    c.options?.length && (kind === 'select' || kind === 'text') ? c.options.slice(0, 40) : undefined;

  // Stable Workday automation ids beat ephemeral #input-N
  if (c.dataField && !['beecatcher'].includes(c.dataField))
    targets.push({ kind: 'css', rank: 1, selector: `[data-automation-id='${c.dataField}']` });
  if (c.id && !/^input-\d+$/i.test(c.id)) targets.push({ kind: 'css', rank: targets.length + 1, selector: `#${c.id}` });
  if (label && label.length < 60 && !/attach resume|analyzing|success/i.test(label))
    targets.push({ kind: 'label', rank: targets.length + 1, name: label });
  if (c.placeholder && (profilePath === 'location' || profilePath === 'startDate'))
    targets.push({ kind: 'placeholder', rank: targets.length + 1, name: c.placeholder });
  if (c.inputName && !c.inputName.includes('['))
    targets.push({
      kind: 'css',
      rank: targets.length + 1,
      selector: `${c.tag}[name='${c.inputName}']`,
    });
  else if (c.inputName?.startsWith('urls['))
    targets.push({
      kind: 'css',
      rank: targets.length + 1,
      selector: `input[name="${c.inputName}"]`,
    });
  if (!targets.length && c.id)
    targets.push({ kind: 'css', rank: 1, selector: `#${c.id}` });
  if (!targets.length && c.placeholder)
    targets.push({ kind: 'placeholder', rank: 1, name: c.placeholder });
  if (!targets.length) return null;

  return {
    key,
    required,
    profilePath: pickPath(profileKeys, [profilePath], profilePath),
    kind,
    targets,
    craft,
    enumHints,
    invertBool,
  };
}

function heuristicYesNo(c: ControlHint, profileKeys: string[]): FieldMapField | null {
  const q = `${c.question || ''} ${c.label || ''}`;
  const idx = Number(c.value || '0');
  let profilePath: string;
  let wantYes: boolean;
  let key: string;
  if (isNegatedSponsorshipQuestion(q)) {
    // Truthy sponsorshipNo → Yes (“authorized without requiring sponsorship”)
    profilePath = 'flags.sponsorshipNo';
    wantYes = true;
    key = 'sponsorship';
  } else if (/legally authorized|authorized to work/i.test(q)) {
    profilePath = 'flags.workAuthYes';
    wantYes = true;
    key = 'workAuth';
  } else if (/require sponsorship|future require sponsorship|need sponsorship/i.test(q)) {
    profilePath = 'flags.sponsorshipNo';
    wantYes = false;
    key = 'sponsorship';
  } else if (idx === 0) {
    profilePath = 'flags.workAuthYes';
    wantYes = true;
    key = 'workAuth';
  } else if (idx === 1) {
    profilePath = 'flags.sponsorshipNo';
    wantYes = false;
    key = 'sponsorship';
  } else {
    return null;
  }
  const btn = wantYes ? 'Yes' : 'No';
  return {
    key,
    required: true,
    profilePath: pickPath(profileKeys, [profilePath], profilePath),
    kind: 'radio',
    targets: [
      {
        kind: 'css',
        rank: 1,
        selector: `div.ashby-application-form-input-yesno >> nth=${idx} >> button:has-text("${btn}")`,
      },
    ],
    enumHints: c.options?.length ? c.options.slice(0, 40) : ['Yes', 'No'],
  };
}


/** @deprecated use inferFieldMap */
export const buildHeuristicFields = inferFieldMap;

export function selfCheckInferFieldMap(): void {
  const fields = inferFieldMap(
    [{ kind: 'textbox', label: 'Email', required: true } as never],
    ['email', 'fullName'],
  );
  if (!Array.isArray(fields)) throw new Error('inferFieldMap must return array');
  if (!isNegatedSponsorshipQuestion('without requiring sponsorship')) {
    throw new Error('negated sponsorship');
  }
}

if (process.argv[1]?.endsWith('infer-field-map.ts') || process.argv[1]?.endsWith('infer-field-map.js')) {
  selfCheckInferFieldMap();
  console.log('infer-field-map self-check ok');
}
