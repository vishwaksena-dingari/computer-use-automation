/**
 * @file Shared LLM door — Ollama / Anthropic / OpenAI. Never throws; never logs secrets.
 */
import type { RuntimeConfig } from '../config/schema.js';

export type CallModelResult = {
  text: string;
  ok: boolean;
  provider: string;
  model: string;
  error?: string;
};

export type CallModelOpts = {
  /** Prefer JSON object replies (Ollama format / OpenAI json_object / Anthropic prompt hint). */
  json?: boolean;
  /** Ollama-only structured `format` object (locator schemas). Ignored elsewhere. */
  ollamaFormat?: unknown;
  /** Override timeout ms (default 180_000). */
  timeoutMs?: number;
  /**
   * Test hook — inject fetch. Production omits.
   * @internal
   */
  fetchImpl?: typeof fetch;
};

export type BuiltModelRequest = {
  url: string;
  headers: Record<string, string>;
  body: unknown;
};

/**
 * Pure request builder — no network. Secrets only in headers, never body.
 */
export function buildModelRequest(
  config: RuntimeConfig,
  system: string,
  user: string,
  opts: CallModelOpts = {},
): BuiltModelRequest | { error: string } {
  const provider = config.llm.provider;
  const model = config.llm.model;
  const json = opts.json !== false; // default json for repair/discover callers

  if (provider === 'ollama') {
    const body: Record<string, unknown> = {
      model,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };
    if (opts.ollamaFormat !== undefined) body.format = opts.ollamaFormat;
    else if (json) body.format = 'json';
    return {
      url: `${config.llm.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`,
      headers: { 'content-type': 'application/json' },
      body,
    };
  }

  if (provider === 'anthropic') {
    const key = config.secrets.anthropicApiKey;
    if (!key) return { error: 'missing_api_key' };
    const sys = json
      ? `${system}\n\nReply with a single JSON object only (no markdown).`
      : system;
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: {
        model,
        max_tokens: 4096,
        system: sys,
        messages: [{ role: 'user', content: user }],
      },
    };
  }

  if (provider === 'openai') {
    const key = config.secrets.openaiApiKey;
    if (!key) return { error: 'missing_api_key' };
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };
    if (json) body.response_format = { type: 'json_object' };
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body,
    };
  }

  return { error: 'provider_unsupported' };
}

function parseProviderText(provider: string, raw: unknown): string {
  if (provider === 'ollama') {
    const body = raw as { message?: { content?: string } };
    return body.message?.content ?? '';
  }
  if (provider === 'anthropic') {
    const body = raw as { content?: Array<{ type?: string; text?: string }> };
    const block = (body.content ?? []).find((c) => c.type === 'text' || c.text);
    return block?.text ?? '';
  }
  if (provider === 'openai') {
    const body = raw as { choices?: Array<{ message?: { content?: string } }> };
    return body.choices?.[0]?.message?.content ?? '';
  }
  return '';
}

/**
 * One-shot model call. Never throws. Unsupported / missing key → ok:false.
 */
export async function callModel(
  config: RuntimeConfig,
  system: string,
  user: string,
  opts: CallModelOpts = {},
): Promise<CallModelResult> {
  const provider = config.llm.provider;
  const model = config.llm.model;
  const built = buildModelRequest(config, system, user, opts);
  if ('error' in built) {
    return {
      text: built.error,
      ok: false,
      provider,
      model,
      error: built.error,
    };
  }

  const fetchFn = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  try {
    const res = await fetchFn(built.url, {
      method: 'POST',
      headers: built.headers,
      body: JSON.stringify(built.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return {
        text: `HTTP ${res.status}`,
        ok: false,
        provider,
        model,
        error: `http_${res.status}`,
      };
    }
    const raw = await res.json();
    return {
      text: parseProviderText(provider, raw),
      ok: true,
      provider,
      model,
    };
  } catch (e) {
    return {
      text: (e as Error).message,
      ok: false,
      provider,
      model,
      error: 'transport',
    };
  }
}

/** Backward-compatible alias — JSON chat via callModel. */
export async function callOllamaJson(
  config: RuntimeConfig,
  system: string,
  user: string,
): Promise<CallModelResult> {
  return callModel(config, system, user, { json: true });
}

function stubConfig(provider: 'ollama' | 'anthropic' | 'openai', key?: string): RuntimeConfig {
  return {
    schemaVersion: 1,
    llm: { provider, model: 'test-model', ollamaBaseUrl: 'http://127.0.0.1:11434' },
    target: { name: 't', baseUrl: 'http://127.0.0.1:4173', entryPath: '/' },
    policy: { allowedHosts: ['127.0.0.1'], allowedActions: ['navigate'], riskyActions: [] },
    limits: { maxSteps: 1, stepTimeoutMs: 1, runTimeoutMs: 1 },
    session: { headedOnEscalate: false, pauseScreenshot: false },
    evidence: {
      dir: 'evidence',
      redactSensitiveOutputs: true,
      keepHarOnSuccess: false,
      keepTraceOnSuccess: false,
    },
    secrets: {
      anthropicApiKey: provider === 'anthropic' ? key : undefined,
      openaiApiKey: provider === 'openai' ? key : undefined,
    },
  } as unknown as RuntimeConfig;
}

export function selfCheckBuildModelRequest(): void {
  const o = buildModelRequest(stubConfig('ollama'), 'sys', 'usr', { json: true });
  if ('error' in o) throw new Error('ollama build failed');
  if (!o.url.includes('/api/chat')) throw new Error('ollama url');
  const body = o.body as { format?: string };
  if (body.format !== 'json') throw new Error('ollama json format');

  const noKey = buildModelRequest(stubConfig('anthropic'), 's', 'u');
  if (!('error' in noKey) || noKey.error !== 'missing_api_key') {
    throw new Error('anthropic missing key');
  }

  const a = buildModelRequest(stubConfig('anthropic', 'sk-test'), 's', 'u', { json: true });
  if ('error' in a) throw new Error('anthropic build');
  if (a.headers['x-api-key'] !== 'sk-test') throw new Error('key must be header only');
  if (JSON.stringify(a.body).includes('sk-test')) throw new Error('key leaked into body');

  const oi = buildModelRequest(stubConfig('openai', 'sk-oai'), 's', 'u', { json: true });
  if ('error' in oi) throw new Error('openai build');
  if (!oi.headers.authorization?.includes('sk-oai')) throw new Error('openai auth header');
  if (JSON.stringify(oi.body).includes('sk-oai')) throw new Error('openai key in body');
}

async function selfCheckCallModelStub(): Promise<void> {
  const r = await callModel(stubConfig('openai'), 's', 'u');
  if (r.ok || r.error !== 'missing_api_key') {
    throw new Error(`expected missing_api_key got ${JSON.stringify(r)}`);
  }

  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const ok = await callModel(stubConfig('openai', 'sk'), 's', 'u', {
    json: true,
    fetchImpl: fakeFetch,
  });
  if (!ok.ok || ok.text !== '{"a":1}') throw new Error(`stub openai failed ${JSON.stringify(ok)}`);
}

if (process.argv[1]?.endsWith('call-model.ts') || process.argv[1]?.endsWith('call-model.js')) {
  selfCheckBuildModelRequest();
  selfCheckCallModelStub()
    .then(() => console.log('call-model self-check ok'))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
