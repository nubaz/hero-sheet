import type { Roots, Surface } from '../types.js';
import { usageFromCclens } from './cclens.js';
import { BUILTIN_COMMANDS, type Exec, type UsageMap } from './shared.js';
import { usageFromTranscripts } from './transcripts.js';

export { BUILTIN_COMMANDS };
export type { Exec, UsageMap };

/** cclens when it works, otherwise the built-in transcript parser. */
export async function collectUsage(
  roots: Roots,
  exec: Exec,
  opts: { days?: number; now?: Date } = {},
): Promise<UsageMap> {
  const viaCclens = await usageFromCclens(exec);
  if (viaCclens) return viaCclens;
  return usageFromTranscripts(roots, opts.days ?? 30, opts.now);
}

/**
 * Split a skill reference as invoked: 'anthropic-skills:x' came from the
 * desktop app; 'plugin:skill' keeps its prefix as part of the name; a bare
 * name is ambiguous across surfaces.
 */
export function normalizeSkillRef(ref: string): { surface?: Surface; name: string } {
  const prefix = 'anthropic-skills:';
  if (ref.startsWith(prefix) && ref.length > prefix.length) {
    return { surface: 'desktop', name: ref.slice(prefix.length) };
  }
  return { name: ref };
}
