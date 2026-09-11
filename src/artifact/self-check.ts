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

console.log('artifact self-check ok');
