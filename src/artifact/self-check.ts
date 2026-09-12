/**
 * @file Assert Capability schema validates (S3 self-check) — no disk golden required.
 */
import assert from 'node:assert/strict';
import { parseCapability } from './load.js';

const minimal = parseCapability({
  schemaVersion: 1,
  id: 'self-check-cap',
  version: '0.0.1',
  surface: 'web',
  name: 'Self-check',
  description: 'inline fixture',
  goalTemplate: 'noop',
  bindings: {},
  inputs: [{ name: 'x', type: 'string', required: true, sensitive: false }],
  outputs: [{ name: 'y', type: 'string', sensitive: false }],
  businessOutcomes: [{ code: 'demo.EMPTY', description: 'empty' }],
  steps: [
    { id: 's1', action: 'navigate', urlFrom: 'config.target.entryPath' },
    {
      id: 's2',
      action: 'branch',
      on: [{ when: { checkpoint: 'done' }, outcome: 'demo.EMPTY' }],
    },
    {
      id: 's3',
      action: 'extract',
      target: { $ref: '#/targets/out' },
      output: 'y',
    },
  ],
  targets: {
    out: {
      strict: true,
      timeoutMs: 1000,
      candidates: [{ kind: 'css', rank: 1, selector: 'body' }],
    },
  },
  checkpoints: {
    done: { kind: 'visible', target: { $ref: '#/targets/out' } },
    success: { kind: 'allOf', refs: ['done'] },
  },
  successCheckpoint: 'success',
});

assert.equal(minimal.schemaVersion, 1);
assert.ok(minimal.steps.some((s) => s.action === 'branch'));
assert.throws(() => parseCapability({ schemaVersion: 1 }), /Invalid capability/);

import { applyBindings, bindingsEntryPath } from './bindings.js';

const withBind = applyBindings(minimal, {
  entryPath: '/member-lookup-beta/',
  targets: {
    out: {
      candidates: [{ kind: 'css', rank: 1, selector: '[data-field=x]' }],
    },
  },
});
assert.equal(bindingsEntryPath(withBind), '/member-lookup-beta/');
assert.equal(withBind.targets.out?.candidates[0]?.selector, '[data-field=x]');

import { findCapabilityPathById } from './load.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const found = findCapabilityPathById(root, 'lookup-member-savings-balance');
assert.ok(found.endsWith('lookup-member-savings-balance.json'));
assert.throws(() => findCapabilityPathById(root, 'no-such-capability-id'), /not found/);

import { loadFieldMapById, parseFieldMap } from './field-map.js';

const fm = loadFieldMapById(root, 'demo-co-a');
assert.equal(fm.id, 'demo-co-a');
assert.ok(fm.fields.some((f) => f.key === 'email'));
assert.throws(() => parseFieldMap({ schemaVersion: 1 }), /Invalid field-map/);

const withFill = parseCapability({
  schemaVersion: 1,
  id: 'fill-self-check',
  version: '0.0.1',
  surface: 'web',
  name: 'Fill check',
  description: 'inline',
  goalTemplate: 'noop',
  bindings: {},
  inputs: [],
  outputs: [{ name: 'y', type: 'string', sensitive: false }],
  businessOutcomes: [{ code: 'field.UNMAPPED', description: 'gap' }],
  steps: [
    { id: 's1', action: 'navigate', urlFrom: 'config.target.entryPath' },
    { id: 's2', action: 'fillForm', fieldMapRef: 'demo-co-a' },
    {
      id: 's3',
      action: 'extract',
      target: { $ref: '#/targets/out' },
      output: 'y',
    },
  ],
  targets: {
    out: {
      strict: true,
      timeoutMs: 1000,
      candidates: [{ kind: 'css', rank: 1, selector: 'body' }],
    },
  },
  checkpoints: {
    done: { kind: 'visible', target: { $ref: '#/targets/out' } },
    success: { kind: 'allOf', refs: ['done'] },
  },
  successCheckpoint: 'success',
});
assert.ok(withFill.steps.some((s) => s.action === 'fillForm'));

import { mergeFieldMap } from './repair-field-map.js';
import type { FieldMapField } from './schema.js';

const merged = mergeFieldMap(
  fm,
  [
    {
      key: 'phone',
      required: true,
      profilePath: 'phone',
      kind: 'text',
      targets: [{ kind: 'css', rank: 1, selector: '#phone' }],
    } satisfies FieldMapField,
  ],
  fm.id,
);
assert.ok(merged.fields.some((f) => f.key === 'phone'));
assert.ok(merged.updatedAt !== fm.updatedAt);

import { applyInvertBool, snapSelectValue } from './fill-form.js';
import { isNegatedSponsorshipQuestion } from './repair-field-map.js';
import { getProfilePath } from './profile.js';

assert.equal(snapSelectValue('yes', ['Yes', 'No']), 'Yes');
assert.equal(snapSelectValue('yes', ['Authorized', 'Needs sponsorship']), 'Authorized');
assert.equal(snapSelectValue('Authorized', ['authorized', 'Needs sponsorship']), 'authorized');
assert.equal(applyInvertBool('yes'), 'No');
assert.equal(applyInvertBool('no'), 'Yes');
assert.ok(isNegatedSponsorshipQuestion('authorized without requiring sponsorship'));
assert.ok(!isNegatedSponsorshipQuestion('Will you require sponsorship?'));
assert.equal(getProfilePath({ fullName: 'Alex Applicant' }, 'firstName'), 'Alex');
assert.equal(getProfilePath({ fullName: 'Alex Applicant' }, 'lastName'), 'Applicant');
assert.equal(getProfilePath({ location: 'New York, NY' }, 'city'), 'New York');
assert.equal(getProfilePath({ location: 'New York, NY' }, 'state'), 'NY');
assert.equal(getProfilePath({ workAuth: 'Authorized' }, 'flags.workAuthYes'), 'yes');
assert.equal(
  snapSelectValue('Decline to self-identify', ['Male', 'Female', 'Decline To Self Identify']),
  'Decline To Self Identify',
);

console.log('artifact self-check ok');
