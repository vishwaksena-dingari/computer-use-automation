/**
 * @file Load/validate field-map JSON under capabilities/field-maps/ (G1).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FieldMapSchema, type FieldMap } from './schema.js';

/** Parse and validate a field-map object (fail closed). */
export function parseFieldMap(raw: unknown): FieldMap {
  const parsed = FieldMapSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid field-map: ${detail}`);
  }
  return parsed.data;
}

/** Load field-map JSON from an absolute or relative path. */
export function loadFieldMap(path: string): FieldMap {
  const abs = resolve(path);
  const raw = JSON.parse(readFileSync(abs, 'utf8')) as unknown;
  return parseFieldMap(raw);
}

/**
 * Resolve `capabilities/field-maps/<id>.json` by id under project root.
 */
export function loadFieldMapById(root: string, id: string): FieldMap {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error(`invalid field-map id: ${id}`);
  }
  const dir = resolve(root, 'capabilities', 'field-maps');
  const path = resolve(dir, `${id}.json`);
  if (!path.startsWith(dir + '/') && path !== dir) {
    throw new Error(`field-map path escapes field-maps/: ${id}`);
  }
  if (!existsSync(path)) {
    throw new Error(`field-map not found: ${id} (${path})`);
  }
  const map = loadFieldMap(path);
  if (map.id !== id) {
    throw new Error(`field-map file ${id}.json has id "${map.id}"`);
  }
  return map;
}
