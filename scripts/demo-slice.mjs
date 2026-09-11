/**
 * @file End-to-end vertical-slice demo: discover (seed OK) + happy + exception replay.
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cua = join(root, 'dist/cli/main.js');

function run(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cua, ...args], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('exit', (code) => resolve({ code: code ?? 1, out, err }));
    child.on('error', reject);
  });
}

const mock = spawn(process.execPath, [join(root, 'scripts/serve-mock.mjs')], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, MOCK_PORT: '4173' },
});

await new Promise((r) => setTimeout(r, 400));

try {
  const disc = await run([
    'discover',
    '--goal',
    'Look up member savings balance',
    '--allow-offline-seed',
    '--evidence',
    join(root, 'evidence/01-discovery'),
  ]);
  console.log('discover', disc.code, disc.err.slice(0, 200));
  if (disc.code !== 0 && !disc.out.includes('artifactPath')) {
    console.error(disc.out, disc.err);
    throw new Error('discover failed');
  }

  const happy = await run([
    'replay',
    join(root, 'capabilities/lookup-member-savings-balance.json'),
    '--member-id',
    'M-10042',
    '--chapter',
    '02-replay-happy',
  ]);
  console.log('happy', happy.out.slice(0, 400));
  const happyJson = JSON.parse(happy.out);
  if (happyJson.status !== 'SUCCESS' || happyJson.outputs?.savingsBalance !== '$12,480.55') {
    throw new Error('happy replay failed: ' + happy.out + happy.err);
  }

  const ex = await run([
    'replay',
    join(root, 'capabilities/lookup-member-savings-balance.json'),
    '--member-id',
    'M-99999',
    '--chapter',
    '03-replay-exception',
  ]);
  console.log('exception', ex.out.slice(0, 400));
  const exJson = JSON.parse(ex.out);
  if (exJson.status !== 'BUSINESS_OUTCOME' || exJson.code !== 'member.NOT_FOUND') {
    throw new Error('exception replay failed: ' + ex.out + ex.err);
  }

  console.log('demo-slice ok');
} finally {
  mock.kill('SIGTERM');
}
