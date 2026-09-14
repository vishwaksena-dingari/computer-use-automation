/**
 * @file Shared CLI runner — replayCapability + evidence writes (T-F-8 / C5).
 */
import { join } from 'node:path';
import { writeJson } from '../evidence/store.js';
import { replayCapability, type ReplayOptions, type ReplayResult } from '../replay/engine.js';
import { workerSummaryFromReplay, type WorkerSummary } from './worker-exit.js';

export type RunCapabilityRequestOpts = ReplayOptions & {
  /** When set, also write worker.json (apply path). */
  worker?: Parameters<typeof workerSummaryFromReplay>[1];
};

/**
 * Run a capability once and persist result.json (and optional worker.json).
 * Does not call process.exit — caller owns exit codes / logging.
 */
export async function runCapabilityRequest(
  opts: RunCapabilityRequestOpts,
): Promise<{ result: ReplayResult; summary?: WorkerSummary }> {
  const { worker, ...replayOpts } = opts;
  const result = await replayCapability(replayOpts);
  writeJson(join(replayOpts.evidenceDir, 'result.json'), result);
  if (!worker) return { result };
  const summary = workerSummaryFromReplay(result, worker);
  writeJson(join(replayOpts.evidenceDir, 'worker.json'), summary);
  return { result, summary };
}

export function selfCheckRunCapabilityRequestExports(): void {
  if (typeof runCapabilityRequest !== 'function') throw new Error('missing runCapabilityRequest');
}

if (
  process.argv[1]?.endsWith('run-capability-request.ts') ||
  process.argv[1]?.endsWith('run-capability-request.js')
) {
  selfCheckRunCapabilityRequestExports();
  console.log('run-capability-request self-check ok');
}
