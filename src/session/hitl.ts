/**
 * @file Same-session HITL pause/resume files (docs/hitl-contract.md).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type PauseReason = 'POLICY_BLOCK' | 'RISKY_ACTION' | 'STUCK';

export type Intervention = {
  schemaVersion: 1;
  runId: string;
  mode: 'replay' | 'discover';
  reasonCode: PauseReason;
  reasonDetail: string;
  capabilityId?: string;
  stepId?: string;
  goalSnapshot?: string;
  pageUrl?: string;
  screenshotPath?: string;
  owner: 'paused' | 'automation' | 'human';
  pausedAt: string;
};

/**
 * Write intervention.json under evidence run hitl/.
 */
export function writeIntervention(runDir: string, intervention: Intervention): string {
  const dir = join(runDir, 'hitl');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'intervention.json');
  writeFileSync(path, JSON.stringify(intervention, null, 2) + '\n');
  return path;
}

/**
 * Write resume.json and flip owner to automation.
 */
export function writeResume(runDir: string, note: string): string {
  const dir = join(runDir, 'hitl');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'resume.json');
  const body = {
    schemaVersion: 1,
    resumedAt: new Date().toISOString(),
    note,
    humanActionsRecorded: false,
  };
  writeFileSync(path, JSON.stringify(body, null, 2) + '\n');
  const interventionPath = join(dir, 'intervention.json');
  if (existsSync(interventionPath)) {
    const i = JSON.parse(readFileSync(interventionPath, 'utf8')) as Intervention;
    i.owner = 'automation';
    writeFileSync(interventionPath, JSON.stringify(i, null, 2) + '\n');
  }
  return path;
}

export function hitlDir(runDir: string): string {
  return join(runDir, 'hitl');
}

export function interventionPath(runDir: string): string {
  return join(runDir, 'hitl', 'intervention.json');
}
