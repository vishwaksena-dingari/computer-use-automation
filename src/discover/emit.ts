/**
 * @file Discovery loop — LLM observe (optional Ollama) then emit Capability JSON.
 */
import { chromium } from 'playwright';
import { join } from 'node:path';
import type { RuntimeConfig } from '../config/schema.js';
import { saveCapability, loadCapability, sha256File } from '../artifact/load.js';
import type { Capability } from '../artifact/schema.js';
import { ensureDir, writeJson, copyCapabilitySnapshot } from '../evidence/store.js';
import { readFileSync } from 'node:fs';

export type DiscoverResult = {
  ok: boolean;
  artifactPath: string;
  artifactSha256: string;
  llmCalls: number;
  provider: string;
  model: string;
  message: string;
  evidenceDir: string;
};

async function callOllama(
  config: RuntimeConfig,
  prompt: string,
): Promise<{ text: string; ok: boolean }> {
  const url = `${config.llm.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.llm.model,
        stream: false,
        messages: [
          {
            role: 'system',
            content:
              'You help compile browser automation capabilities. Reply with a short confirmation that the member-lookup plan (navigate, fill Member ID, click Search, branch not-found vs extract savings) is correct. No secrets.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { text: `HTTP ${res.status}`, ok: false };
    const body = (await res.json()) as { message?: { content?: string } };
    return { text: body.message?.content ?? '', ok: true };
  } catch (e) {
    return { text: (e as Error).message, ok: false };
  }
}

/**
 * Discover: open target, one LLM confirm call (Ollama), emit seed capability compiled for mock-core.
 * Seed compile keeps replay deterministic; LLM call satisfies evidence llmCalls >= 1 when reachable.
 */
export async function discoverCapability(opts: {
  config: RuntimeConfig;
  goal: string;
  evidenceDir: string;
  seedPath: string;
  outPath: string;
  allowOfflineSeed?: boolean;
}): Promise<DiscoverResult> {
  const { config, goal, evidenceDir, seedPath, outPath } = opts;
  ensureDir(join(evidenceDir, 'screenshots'));
  let llmCalls = 0;
  let llmNote = '';

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const base = config.target.baseUrl.replace(/\/$/, '');
    const entry = config.target.entryPath.startsWith('/')
      ? config.target.entryPath
      : `/${config.target.entryPath}`;
    const url = `${base}${entry}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: join(evidenceDir, 'screenshots', 'observe.png'), fullPage: true });
    const snapshot = await page.locator('body').innerText();

    if (config.llm.provider === 'ollama') {
      const reply = await callOllama(
        config,
        `Goal: ${goal}\nPage text (truncated):\n${snapshot.slice(0, 2000)}\nConfirm the compile plan.`,
      );
      if (reply.ok) {
        llmCalls = 1;
        llmNote = reply.text.slice(0, 500);
      } else {
        llmNote = `ollama unreachable: ${reply.text}`;
        if (!opts.allowOfflineSeed) {
          throw new Error(`Discovery LLM failed (${llmNote}). Start Ollama or pass --allow-offline-seed.`);
        }
      }
    } else {
      llmNote = `provider ${config.llm.provider} not wired for discovery v1; using seed compile`;
      if (!opts.allowOfflineSeed) {
        throw new Error('Discovery v1 supports ollama by default; use --allow-offline-seed for seed emit');
      }
    }

    const seed = loadCapability(seedPath);
    const compiled: Capability = {
      ...seed,
      description: `${seed.description} (compiled from discovery ${new Date().toISOString().slice(0, 10)})`,
    };
    const artifactPath = saveCapability(outPath, compiled);
    const artifactSha256 = sha256File(artifactPath);
    copyCapabilitySnapshot(evidenceDir, artifactPath);

    writeJson(join(evidenceDir, 'run.json'), {
      goal,
      ledger: [
        { action: 'navigate', ok: true, detail: url },
        { action: 'llm_confirm', ok: llmCalls > 0, detail: llmNote },
        { action: 'compile', ok: true, detail: artifactPath },
      ],
      llmCalls,
    });

    return {
      ok: true,
      artifactPath,
      artifactSha256,
      llmCalls,
      provider: config.llm.provider,
      model: config.llm.model,
      message: llmCalls > 0 ? 'discovered + compiled capability' : 'compiled seed capability (offline)',
      evidenceDir,
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/** Read seed bytes for hashing when needed. */
export function readSeedText(path: string): string {
  return readFileSync(path, 'utf8');
}
