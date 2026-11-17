import type { Card, Item, Surface, Usage, Verdict } from './types.js';
import { defaultBranch, packOf } from './branch.js';
import { normalizeSkillRef, type UsageMap } from './usage/index.js';

export { normalizeSkillRef };

/** Kinds whose use leaves no trace we can count. */
const NO_SIGNAL = new Set<Item['kind']>(['hook', 'memory', 'instructions', 'scheduled_task']);

export function verdictFor(item: Item, usage: Usage | undefined): Verdict {
  if (!item.enabled) return 'disabled';
  if (NO_SIGNAL.has(item.kind)) return 'unknown';
  const uses = usage?.uses30d ?? 0;
  if (uses === 0) return (usage?.missed30d ?? 0) > 0 ? 'missed' : 'asleep';
  if (uses <= 2) return 'rare';
  return 'active';
}

const BARE_ORDER: Surface[] = ['cli', 'synced', 'desktop'];

function merge(into: Usage, uses: number, lastUsedAt?: string): void {
  into.uses30d += uses;
  if (lastUsedAt && (!into.lastUsedAt || lastUsedAt > into.lastUsedAt)) into.lastUsedAt = lastUsedAt;
}

/**
 * Join items with usage. A skill reference resolves to exactly one item: a
 * prefix names the surface ('anthropic-skills:' is the desktop app), a bare
 * name goes to cli, then synced, then desktop. Plugins sum their shipped
 * skills, agents and plugin_<name>_* servers.
 */
export function buildCards(
  items: Item[],
  usage: UsageMap,
  lifetime: Map<string, { lifetimeUses: number; lastUsedAt: string }>,
  missed: Map<string, number> = new Map(),
): Card[] {
  const byKey = new Map<string, Item>();
  for (const it of items) byKey.set(`${it.kind}|${it.surface}|${it.name}`, it);

  const resolveSkill = (ref: string): Item | undefined => {
    const { surface, name } = normalizeSkillRef(ref);
    if (surface) return byKey.get(`skill|${surface}|${name}`);
    for (const s of BARE_ORDER) {
      const hit = byKey.get(`skill|${s}|${name}`);
      if (hit) return hit;
    }
    return undefined;
  };

  const acc = new Map<string, Usage>();
  const slot = (id: string): Usage => {
    let u = acc.get(id);
    if (!u) acc.set(id, (u = { uses30d: 0 }));
    return u;
  };

  for (const [ref, u] of usage.skills) {
    const target = resolveSkill(ref);
    if (!target) continue;
    const s = slot(target.id);
    merge(s, u.uses30d, u.lastUsedAt);
    if (u.outTokens !== undefined) s.outTokens = (s.outTokens ?? 0) + u.outTokens;
    if (u.ctxGrowth !== undefined) s.ctxGrowth = (s.ctxGrowth ?? 0) + u.ctxGrowth;
  }
  for (const [ref, l] of lifetime) {
    const target = resolveSkill(ref);
    if (!target) continue;
    const s = slot(target.id);
    s.lifetimeUses = (s.lifetimeUses ?? 0) + l.lifetimeUses;
    if (!s.lastUsedAt || l.lastUsedAt > s.lastUsedAt) s.lastUsedAt = l.lastUsedAt;
  }
  // missed: skill references the oracle recommended and the session did not load
  for (const [ref, n] of missed) {
    const target = resolveSkill(ref);
    if (!target) continue;
    const s = slot(target.id);
    s.missed30d = (s.missed30d ?? 0) + n;
  }
  for (const [ref, u] of usage.agents) {
    const target = items.find((i) => i.kind === 'agent' && i.name === ref);
    if (!target) continue;
    const s = slot(target.id);
    merge(s, u.uses30d, u.lastUsedAt);
    if (u.outTokens !== undefined) s.outTokens = (s.outTokens ?? 0) + u.outTokens;
  }
  for (const [ref, u] of usage.servers) {
    const target = items.find((i) => i.kind === 'mcp_server' && i.name === ref);
    if (!target) continue;
    merge(slot(target.id), u.uses30d, u.lastUsedAt);
  }

  // Plugins: shipped skills and agents plus servers named plugin_<plugin>_<server>.
  for (const plugin of items.filter((i) => i.kind === 'plugin')) {
    const total = slot(plugin.id);
    const pluginName = plugin.name.split('@')[0];
    for (const child of items) {
      if (child.origin !== plugin.name || (child.kind !== 'skill' && child.kind !== 'agent')) continue;
      const c = acc.get(child.id);
      if (c) {
        merge(total, c.uses30d, c.lastUsedAt);
        if (c.missed30d) total.missed30d = (total.missed30d ?? 0) + c.missed30d;
      }
    }
    for (const [server, u] of usage.servers) {
      if (server.startsWith(`plugin_${pluginName}_`)) merge(total, u.uses30d, u.lastUsedAt);
    }
  }

  return items.map((it) => {
    const u = acc.get(it.id) ?? { uses30d: 0 };
    u.missed30d ??= 0;
    return { ...it, branch: defaultBranch(it), pack: packOf(it), usage: u, verdict: verdictFor(it, u) };
  });
}
