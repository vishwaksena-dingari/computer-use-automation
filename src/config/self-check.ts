/**
 * @file Tiny assert-based self-check for config merge / secret refuse (run via npm run check:config).
 */
import assert from 'node:assert/strict';
import { loadConfig, validateConfig } from './load.js';
import { isSecretSetPath } from './schema.js';

assert.equal(isSecretSetPath('ANTHROPIC_API_KEY'), true);
assert.equal(isSecretSetPath('llm.provider'), false);

const loaded = loadConfig();
assert.equal(loaded.config.schemaVersion, 1);
assert.ok(['ollama', 'anthropic', 'openai'].includes(loaded.config.llm.provider));
assert.ok(loaded.sources['llm.provider']);

const errs = validateConfig(loaded);
assert.deepEqual(errs, []);

// Fail-closed: bogus CLI provider must throw before validate can pass.
let threw = false;
try {
  loadConfig({ provider: 'bogus' });
} catch {
  threw = true;
}
assert.equal(threw, true);

// Local overlay file (if present) must not break validate; example path is documented only.
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { findProjectRoot } from './paths.js';
const root = findProjectRoot();
const localPath = join(root, 'config.local.yaml');
const hadLocal = existsSync(localPath);
if (!hadLocal) {
  writeFileSync(
    localPath,
    `schemaVersion: 1\npolicy:\n  allowedHosts:\n    - 127.0.0.1\n    - localhost\n    - jobs.ashbyhq.com\n`,
    'utf8',
  );
}
try {
  const withLocal = loadConfig();
  assert.ok(withLocal.config.policy.allowedHosts.includes('127.0.0.1'));
  if (!hadLocal) {
    assert.equal(withLocal.sources['policy.allowedHosts'], 'local');
    assert.ok(withLocal.config.policy.allowedHosts.includes('jobs.ashbyhq.com'));
  }
} finally {
  if (!hadLocal && existsSync(localPath)) unlinkSync(localPath);
}

console.log('config self-check ok');
