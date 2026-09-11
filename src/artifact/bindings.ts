/**
 * @file Apply capability `bindings` overlays (tenant entryPath + target remaps).
 */
import {
  CapabilitySchema,
  TargetSchema,
  type Capability,
  type LocatorCandidate,
} from './schema.js';

export type BindingsOverlay = {
  entryPath?: string;
  targets?: Record<
    string,
    {
      strict?: boolean;
      timeoutMs?: number;
      candidates: LocatorCandidate[];
    }
  >;
};

/**
 * Merge overlay into `capability.bindings`, remap `targets`, leave steps intact.
 * Fail-closed via Zod when remapped targets are invalid.
 */
export function applyBindings(
  capability: Capability,
  overlay?: BindingsOverlay | Record<string, unknown> | null,
): Capability {
  const base =
    capability.bindings && typeof capability.bindings === 'object'
      ? { ...(capability.bindings as Record<string, unknown>) }
      : {};
  const extra =
    overlay && typeof overlay === 'object' ? { ...(overlay as Record<string, unknown>) } : {};
  const merged: Record<string, unknown> = { ...base, ...extra };

  const targets = { ...capability.targets };
  const rawTargets = merged.targets;
  if (rawTargets && typeof rawTargets === 'object' && !Array.isArray(rawTargets)) {
    for (const [key, val] of Object.entries(rawTargets as Record<string, unknown>)) {
      if (!val || typeof val !== 'object') continue;
      const prev = targets[key];
      const next = TargetSchema.parse({
        strict: (val as { strict?: boolean }).strict ?? prev?.strict ?? true,
        timeoutMs: (val as { timeoutMs?: number }).timeoutMs ?? prev?.timeoutMs ?? 10000,
        candidates: (val as { candidates: LocatorCandidate[] }).candidates,
      });
      targets[key] = next;
    }
  }

  return CapabilitySchema.parse({
    ...capability,
    bindings: merged,
    targets,
  });
}

/**
 * Entry path from bindings, else undefined (caller uses config.target.entryPath).
 */
export function bindingsEntryPath(capability: Capability): string | undefined {
  const ep = (capability.bindings as BindingsOverlay | undefined)?.entryPath;
  return typeof ep === 'string' && ep.length > 0 ? ep : undefined;
}
