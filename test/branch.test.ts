import { describe, it, expect } from 'vitest';
import type { Item } from '../src/types.js';
import { buildCards } from '../src/join.js';
import { defaultBranch, packOf } from '../src/branch.js';

function item(over: Partial<Item> & Pick<Item, 'id' | 'kind' | 'surface' | 'name'>): Item {
  return { enabled: true, ...over };
}
const base = { skills: new Map(), servers: new Map(), agents: new Map(), source: 'transcripts' as const, sessions: 0 };

describe('defaultBranch', () => {
  it('maps kinds without enrichment', () => {
    const k = (kind: Item['kind'], surface: Item['surface'] = 'cli') =>
      defaultBranch(item({ id: 'x', kind, surface, name: 'x' }));
    expect(k('mcp_server')).toBe('system');
    expect(k('mcp_server', 'connector')).toBe('system');
    expect(k('memory')).toBe('memory');
    expect(k('instructions')).toBe('memory');
    expect(k('hook')).toBe('automation');
    expect(k('scheduled_task')).toBe('automation');
    for (const kind of ['skill', 'plugin', 'agent'] as const) expect(k(kind)).toBe('other');
  });
});

describe('packOf', () => {
  const p = (over: Partial<Item>) => packOf(item({ id: 'x', kind: 'skill', surface: 'cli', name: 'x', ...over }));
  it('uses the owning plugin name without marketplace', () => {
    expect(p({ origin: 'demo@mkt' })).toBe('demo');
    expect(p({ kind: 'plugin', name: 'demo@mkt' })).toBe('demo');
    expect(p({ surface: 'synced', origin: 'synced-plugin' })).toBe('synced-plugin');
  });
  it('names the surface or source otherwise', () => {
    expect(p({ origin: 'user' })).toBe('user');
    expect(p({ surface: 'synced', origin: 'synced' })).toBe('synced');
    expect(p({ surface: 'desktop', origin: 'plugin_abc' })).toBe('desktop');
    expect(p({ surface: 'desktop' })).toBe('desktop');
    expect(p({ kind: 'mcp_server', surface: 'connector' })).toBe('connectors');
    expect(p({ kind: 'mcp_server', origin: 'app' })).toBe('app');
  });
});

describe('buildCards', () => {
  it('sets branch and pack on every card', () => {
    const cards = buildCards([
      item({ id: 'cli:hook:h', kind: 'hook', surface: 'cli', name: 'h', origin: 'user' }),
      item({ id: 'cli:skill:demo:s', kind: 'skill', surface: 'cli', name: 'demo:s', origin: 'demo@mkt' }),
    ], base, new Map());
    expect(cards.map((c) => [c.branch, c.pack])).toEqual([['automation', 'user'], ['other', 'demo']]);
  });
});
