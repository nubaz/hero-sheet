import { describe, it, expect } from 'vitest';
import type { Item } from '../src/types.js';
import type { UsageMap } from '../src/usage/index.js';
import { buildCards, normalizeSkillRef, verdictFor } from '../src/join.js';

function item(over: Partial<Item> & Pick<Item, 'id' | 'kind' | 'surface' | 'name'>): Item {
  return { enabled: true, ...over };
}
function usageMap(skills: Record<string, number> = {}, servers: Record<string, number> = {}): UsageMap {
  const m = (o: Record<string, number>) => new Map(Object.entries(o).map(([k, v]) => [k, { uses30d: v }]));
  return { skills: m(skills), servers: m(servers), agents: new Map(), source: 'transcripts', sessions: 0 };
}

describe('verdictFor', () => {
  const skill = item({ id: 'cli:skill:a', kind: 'skill', surface: 'cli', name: 'a' });
  it('applies the thresholds', () => {
    expect(verdictFor({ ...skill, enabled: false }, { uses30d: 50 })).toBe('disabled');
    expect(verdictFor(skill, { uses30d: 0 })).toBe('dead_weight');
    expect(verdictFor(skill, undefined)).toBe('dead_weight');
    expect(verdictFor(skill, { uses30d: 1 })).toBe('rare');
    expect(verdictFor(skill, { uses30d: 2 })).toBe('rare');
    expect(verdictFor(skill, { uses30d: 3 })).toBe('active');
  });
  it('gives kinds without a usage signal unknown', () => {
    for (const kind of ['hook', 'memory', 'instructions', 'scheduled_task'] as const) {
      expect(verdictFor(item({ id: `cli:${kind}:x`, kind, surface: 'cli', name: 'x' }), { uses30d: 9 })).toBe('unknown');
    }
  });
});

describe('normalizeSkillRef', () => {
  it('splits the desktop prefix only', () => {
    expect(normalizeSkillRef('anthropic-skills:x')).toEqual({ surface: 'desktop', name: 'x' });
    expect(normalizeSkillRef('p:s')).toEqual({ name: 'p:s' });
    expect(normalizeSkillRef('s')).toEqual({ name: 's' });
  });
});

describe('buildCards', () => {
  it('attributes same-named skills by invocation prefix (Review Focus 5)', () => {
    const items = [
      item({ id: 'cli:skill:caveman', kind: 'skill', surface: 'cli', name: 'caveman' }),
      item({ id: 'desktop:skill:caveman', kind: 'skill', surface: 'desktop', name: 'caveman' }),
    ];
    const cards = buildCards(items, usageMap({ caveman: 1, 'anthropic-skills:caveman': 11 }), new Map());
    const by = new Map(cards.map((c) => [c.id, c]));
    expect(by.get('cli:skill:caveman')!.usage.uses30d).toBe(1);
    expect(by.get('desktop:skill:caveman')!.usage.uses30d).toBe(11);
  });

  it('sends a bare ref to cli, then synced, then desktop', () => {
    const items = [
      item({ id: 'desktop:skill:x', kind: 'skill', surface: 'desktop', name: 'x' }),
      item({ id: 'synced:skill:x', kind: 'skill', surface: 'synced', name: 'x' }),
    ];
    const cards = buildCards(items, usageMap({ x: 4 }), new Map());
    expect(cards.find((c) => c.id === 'synced:skill:x')!.usage.uses30d).toBe(4);
    expect(cards.find((c) => c.id === 'desktop:skill:x')!.usage.uses30d).toBe(0);
  });

  it('sums a plugin from its skills and plugin_ servers, adds lifetime', () => {
    const items = [
      item({ id: 'cli:plugin:demo@mkt', kind: 'plugin', surface: 'cli', name: 'demo@mkt' }),
      item({ id: 'cli:skill:demo:one', kind: 'skill', surface: 'cli', name: 'demo:one', origin: 'demo@mkt' }),
      item({ id: 'cli:skill:alpha', kind: 'skill', surface: 'cli', name: 'alpha' }),
      item({ id: 'cli:mcp_server:fibery', kind: 'mcp_server', surface: 'cli', name: 'fibery' }),
    ];
    const lifetime = new Map([['alpha', { lifetimeUses: 7, lastUsedAt: '2026-11-01T00:00:00.000Z' }]]);
    const cards = buildCards(items, usageMap({ 'demo:one': 2 }, { plugin_demo_srv: 3, fibery: 5 }), lifetime);
    const by = new Map(cards.map((c) => [c.id, c]));
    expect(by.get('cli:plugin:demo@mkt')!.usage.uses30d).toBe(5);
    expect(by.get('cli:plugin:demo@mkt')!.verdict).toBe('active');
    expect(by.get('cli:mcp_server:fibery')!.usage.uses30d).toBe(5);
    expect(by.get('cli:skill:alpha')!.usage.lifetimeUses).toBe(7);
    expect(by.get('cli:skill:alpha')!.usage.lastUsedAt).toBe('2026-11-01T00:00:00.000Z');
    expect(by.get('cli:skill:alpha')!.verdict).toBe('dead_weight');
  });
});
