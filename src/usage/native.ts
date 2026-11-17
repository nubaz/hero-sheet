import type { Roots } from '../types.js';
import { readJson } from '../util.js';

/** Lifetime skill counts the Claude Code app keeps in ~/.claude.json (skillUsage). */
export function lifetimeFromClaudeJson(roots: Roots): Map<string, { lifetimeUses: number; lastUsedAt: string }> {
  const out = new Map<string, { lifetimeUses: number; lastUsedAt: string }>();
  let usage: unknown;
  try {
    usage = (readJson(roots.claudeJson) as { skillUsage?: unknown } | null)?.skillUsage;
  } catch {
    return out;
  }
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return out;
  for (const [name, v] of Object.entries(usage as Record<string, unknown>)) {
    const r = v as { usageCount?: unknown; lastUsedAt?: unknown } | null;
    if (!r || typeof r.usageCount !== 'number') continue;
    const ms = typeof r.lastUsedAt === 'number' ? r.lastUsedAt : NaN;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) continue;
    out.set(name, { lifetimeUses: r.usageCount, lastUsedAt: d.toISOString() });
  }
  return out;
}
