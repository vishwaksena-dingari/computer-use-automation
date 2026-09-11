/**
 * @file Self-check for P3 recorded-action → locator merge.
 */
import assert from 'node:assert/strict';
import {
  candidatesFromRecorded,
  applyRecordedToTarget,
  type RecordedAction,
} from './record-actions.js';
import { parseCapability } from '../artifact/load.js';

const actions: RecordedAction[] = [
  {
    at: '2026-09-11T00:00:00Z',
    kind: 'click',
    tag: 'button',
    role: 'button',
    name: 'Find member',
    text: 'Find member',
    css: "form button[type='submit']",
  },
];

const cands = candidatesFromRecorded(actions);
assert.ok(cands.some((c) => c.kind === 'css'));
assert.ok(cands.some((c) => c.kind === 'role'));

const cap = parseCapability({
  schemaVersion: 1,
  id: 'teach-check',
  version: '0.0.1',
  surface: 'web',
  name: 'Teach check',
  description: 'fixture',
  goalTemplate: 'x',
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
      target: { $ref: '#/targets/btn' },
      output: 'y',
    },
  ],
  targets: {
    btn: {
      strict: true,
      timeoutMs: 1000,
      candidates: [{ kind: 'role', rank: 1, role: 'button', name: 'Search', exact: true }],
    },
  },
  checkpoints: {
    done: { kind: 'visible', target: { $ref: '#/targets/btn' } },
    success: { kind: 'allOf', refs: ['done'] },
  },
  successCheckpoint: 'success',
});

const applied = applyRecordedToTarget(cap, 'btn', actions);
assert.equal(applied.applied, true);
assert.ok((cap.targets.btn?.candidates.length ?? 0) > 1);
assert.equal(cap.targets.btn?.candidates[0]?.kind, 'css');

console.log('record-actions self-check ok');
