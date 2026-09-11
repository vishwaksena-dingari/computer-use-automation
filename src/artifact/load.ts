/**
 * @file Read/write/validate Capability JSON files under capabilities/.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CapabilitySchema, type Capability } from './schema.js';

/**
 * Parse and validate a capability object (fail closed).
 */
export function parseCapability(raw: unknown): Capability {
  const parsed = CapabilitySchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid capability: ${detail}`);
  }
  return parsed.data;
}

/** Load capability JSON from disk. */
export function loadCapability(path: string): Capability {
  const abs = resolve(path);
  const raw = JSON.parse(readFileSync(abs, 'utf8')) as unknown;
  return parseCapability(raw);
}

/** Write capability JSON (pretty) and return absolute path. */
export function saveCapability(path: string, capability: Capability): string {
  const abs = resolve(path);
  mkdirSync(dirname(abs), { recursive: true });
  const validated = parseCapability(capability);
  writeFileSync(abs, JSON.stringify(validated, null, 2) + '\n', 'utf8');
  return abs;
}

/** SHA-256 of file bytes for evidence manifests. */
export function sha256File(path: string): string {
  const buf = readFileSync(resolve(path));
  return createHash('sha256').update(buf).digest('hex');
}

export function capabilityExists(path: string): boolean {
  return existsSync(resolve(path));
}
