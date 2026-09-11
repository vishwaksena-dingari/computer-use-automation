/**
 * @file Assert JSON-table joins + API lookup paths for mock-core.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  FOUND_ID,
  NOT_FOUND_ID,
  NOT_FOUND_CODE,
  loadTables,
  lookupMember,
} from '../apps/mock-core/lib/db.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'apps/mock-core/data');
const HTML = join(ROOT, 'apps/mock-core/member-lookup/index.html');

const tables = await loadTables(DATA);
const found = lookupMember(tables, FOUND_ID);
assert.equal(found.kind, 'found');
assert.equal(found.name, 'Alex Rivera');
assert.equal(found.savingsBalance, '$12,480.55');
assert.ok(found.accounts.length >= 2);
assert.equal(found.contact.city, 'Tulsa');
assert.equal(lookupMember(tables, NOT_FOUND_ID).kind, 'not_found');
assert.equal(lookupMember(tables, NOT_FOUND_ID).code, NOT_FOUND_CODE);
assert.equal(tables.members.length >= 7, true);

const html = readFileSync(HTML, 'utf8');
assert.match(html, /Demo contract:.*M-10042.*M-99999/s);
assert.match(html, /name="member_id"/);
assert.match(html, />Search</);
assert.match(html, /role="alert"/);
assert.match(html, /Savings balance/);
assert.doesNotMatch(html, /\sdata-testid\s*=/);

// Boot real serve-mock on ephemeral port
const port = 4173 + Math.floor(Math.random() * 200) + 20;
const child = spawn(process.execPath, [join(ROOT, 'scripts/serve-mock.mjs')], {
  env: { ...process.env, MOCK_PORT: String(port), MOCK_HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

await new Promise((resolveWait, reject) => {
  const t = setTimeout(() => reject(new Error('mock server start timeout')), 5000);
  child.stdout.on('data', (buf) => {
    if (String(buf).includes('mock-core')) {
      clearTimeout(t);
      resolveWait();
    }
  });
  child.stderr.on('data', (buf) => {
    // surface unexpected errors
    process.stderr.write(buf);
  });
  child.on('exit', (code) => reject(new Error(`mock exited early ${code}`)));
});

try {
  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(health.status, 200);
  const h = await health.json();
  assert.equal(h.ok, true);

  const page = await fetch(`http://127.0.0.1:${port}/member-lookup/`);
  assert.equal(page.status, 200);

  const ok = await fetch(`http://127.0.0.1:${port}/api/members/${FOUND_ID}`);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.kind, 'found');
  assert.equal(body.savingsBalance, '$12,480.55');
  assert.ok(body.accounts.some((a) => a.product === 'Savings'));

  const nf = await fetch(`http://127.0.0.1:${port}/api/members/${NOT_FOUND_ID}`);
  assert.equal(nf.status, 200); // business outcome — not HTTP 404
  const nfBody = await nf.json();
  assert.equal(nfBody.kind, 'not_found');
  assert.equal(nfBody.code, NOT_FOUND_CODE);
} finally {
  child.kill('SIGTERM');
}

console.log('mock-core self-check ok');
