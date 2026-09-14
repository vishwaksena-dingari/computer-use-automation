/**
 * @file Shared LLM HTTP door (Ollama JSON chat). Multi-provider lives in T-F-3.
 */
import type { RuntimeConfig } from '../config/schema.js';

export type CallModelResult = {
  text: string;
  ok: boolean;
  provider?: string;
  model?: string;
  error?: string;
};

/**
 * Ollama `/api/chat` with `format: json`. Returns ok:false for non-ollama (no throw).
 * Timeout 180s — matches prior repair/author-steps callers.
 */
export async function callOllamaJson(
  config: RuntimeConfig,
  system: string,
  user: string,
): Promise<CallModelResult> {
  if (config.llm.provider !== 'ollama') {
    return {
      text: 'non-ollama',
      ok: false,
      provider: config.llm.provider,
      error: 'provider_unsupported',
    };
  }
  const url = `${config.llm.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.llm.model,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      return {
        text: `HTTP ${res.status}`,
        ok: false,
        provider: 'ollama',
        model: config.llm.model,
        error: `http_${res.status}`,
      };
    }
    const body = (await res.json()) as { message?: { content?: string } };
    return {
      text: body.message?.content ?? '',
      ok: true,
      provider: 'ollama',
      model: config.llm.model,
    };
  } catch (e) {
    return {
      text: (e as Error).message,
      ok: false,
      provider: 'ollama',
      model: config.llm.model,
      error: 'transport',
    };
  }
}

async function selfCheckCallOllamaJson(): Promise<void> {
  const cfg = {
    llm: {
      provider: 'openai' as const,
      model: 'gpt-test',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
    },
  } as RuntimeConfig;
  const r = await callOllamaJson(cfg, 's', 'u');
  if (r.ok || r.error !== 'provider_unsupported') {
    throw new Error(`expected provider_unsupported, got ${JSON.stringify(r)}`);
  }
}

if (process.argv[1]?.endsWith('call-model.ts') || process.argv[1]?.endsWith('call-model.js')) {
  selfCheckCallOllamaJson()
    .then(() => console.log('call-model self-check ok'))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
