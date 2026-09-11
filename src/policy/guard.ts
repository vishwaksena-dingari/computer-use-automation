/**
 * @file Allowlist + risky-action gate (hosts / action types).
 */
import type { RuntimeConfig } from '../config/schema.js';

export type PolicyDecision =
  | { ok: true }
  | { ok: false; reasonCode: 'POLICY_BLOCK' | 'RISKY_ACTION'; detail: string };

/**
 * Check navigate URL host is allowlisted.
 */
export function assertHostAllowed(config: RuntimeConfig, url: string): PolicyDecision {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { ok: false, reasonCode: 'POLICY_BLOCK', detail: `bad url ${url}` };
  }
  if (!config.policy.allowedHosts.includes(host)) {
    return {
      ok: false,
      reasonCode: 'POLICY_BLOCK',
      detail: `host ${host} not in allowedHosts`,
    };
  }
  return { ok: true };
}

/**
 * Check action type is allowlisted; flag risky separately.
 */
export function assertActionAllowed(
  config: RuntimeConfig,
  action: string,
): PolicyDecision {
  if (config.policy.riskyActions.includes(action)) {
    return { ok: false, reasonCode: 'RISKY_ACTION', detail: `risky action ${action}` };
  }
  if (!config.policy.allowedActions.includes(action)) {
    return {
      ok: false,
      reasonCode: 'POLICY_BLOCK',
      detail: `action ${action} not in allowedActions`,
    };
  }
  return { ok: true };
}
