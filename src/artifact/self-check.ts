/**
 * @file Assert sample capability validates (S3 self-check).
 */
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCapability, parseCapability } from './load.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const sample = join(root, 'capabilities/lookup-member-savings-balance.json');

const cap = loadCapability(sample);
assert.equal(cap.id, 'lookup-member-savings-balance');
assert.equal(cap.schemaVersion, 1);
assert.ok(cap.steps.some((s) => s.action === 'branch'));
assert.equal(cap.successCheckpoint, 'success');

assert.throws(() => parseCapability({ schemaVersion: 1 }), /Invalid capability/);

console.log('artifact self-check ok');
