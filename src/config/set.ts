/**
 * @file Mutate non-secret keys in config.yaml (`config set`).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { FileConfigSchema, isSecretSetPath, type FileConfig } from './schema.js';
import { configYamlPath, findProjectRoot } from './paths.js';

function parseValue(raw: string): unknown {
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) {
    return JSON.parse(t) as unknown;
  }
  return raw;
}

function setDotted(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) throw new Error('empty key path');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    const next = cur[p];
    if (next === undefined || next === null || typeof next !== 'object' || Array.isArray(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

/**
 * Write a non-secret dotted key into config.yaml. Refuses API key paths.
 * @returns absolute path written
 */
export function setConfigValue(path: string, rawValue: string, configPathOverride?: string): string {
  if (isSecretSetPath(path)) {
    throw new Error(
      `Refusing to set secret path "${path}". Put API keys in .env only (see .env.example).`,
    );
  }

  const root = findProjectRoot();
  const yamlPath = configYamlPath(root, configPathOverride);
  if (!existsSync(yamlPath)) {
    throw new Error(`config.yaml not found at ${yamlPath}`);
  }

  const raw = parseYaml(readFileSync(yamlPath, 'utf8'));
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('config.yaml root must be a mapping');
  }

  const doc = raw as Record<string, unknown>;
  let value: unknown;
  try {
    value = parseValue(rawValue);
  } catch (e) {
    throw new Error(`Could not parse value for ${path}: ${(e as Error).message}`);
  }

  setDotted(doc, path, value);

  const parsed = FileConfigSchema.safeParse(doc);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`After set, config.yaml would be invalid: ${detail}`);
  }

  writeFileSync(yamlPath, stringifyYaml(parsed.data as FileConfig, { lineWidth: 100 }), 'utf8');
  return yamlPath;
}
