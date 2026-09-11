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

console.log('config self-check ok');
