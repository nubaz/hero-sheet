import type { Usage } from '../types.js';
import { bump, BUILTIN_COMMANDS, type Exec, type UsageMap } from './shared.js';

export type { Exec, UsageMap } from './shared.js';

function rec(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function rows(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(rec).filter((r): r is Record<string, unknown> => !!r) : [];
}

async function runJson(exec: Exec, args: string[]): Promise<Record<string, unknown> | null> {
  try {
    const r = await exec('cclens', args);
    if (r.code !== 0) return null;
    return rec(JSON.parse(r.stdout)) ?? null;
  } catch {
    return null; // missing binary, crash or junk output: caller falls back
  }
}

/**
 * Usage from the optional `cclens` binary. Returns null when it is missing,
 * exits non-zero or prints something unparsable.
 */
export async function usageFromCclens(exec: Exec): Promise<UsageMap | null> {
  const usage = await runJson(exec, ['usage', '--format', 'json']);
  if (!usage) return null;
  const inventory = await runJson(exec, ['inventory', '--format', 'json']);
  if (!inventory) return null;

  const skills = new Map<string, Usage>();
  for (const r of rows(usage.skills)) {
    const name = typeof r.skill === 'string' ? r.skill : undefined;
    if (!name || BUILTIN_COMMANDS.has(name)) continue;
    const u: Usage = { uses30d: num(r.invocations) };
    if (r.out_tokens !== undefined) u.outTokens = num(r.out_tokens);
    if (r.ctx_growth !== undefined) u.ctxGrowth = num(r.ctx_growth);
    skills.set(name, u);
  }
  const agents = new Map<string, Usage>();
  for (const r of rows(usage.agents)) {
    const name = typeof r.agent === 'string' ? r.agent : undefined;
    if (!name) continue;
    const u: Usage = { uses30d: num(r.runs) };
    if (r.out_tokens !== undefined) u.outTokens = num(r.out_tokens);
    agents.set(name, u);
  }
  const servers = new Map<string, Usage>();
  for (const r of rows(inventory.surfaces)) {
    if (r.kind !== 'mcp_server' || typeof r.id !== 'string') continue;
    bump(servers, r.id, num(r.uses));
  }
  return { skills, servers, agents, source: 'cclens', sessions: num(usage.sessions) };
}
