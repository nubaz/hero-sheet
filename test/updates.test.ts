import { describe, it, expect } from 'vitest';
import type { Card } from '../src/types.js';
import { checkUpdates } from '../src/updates.js';
import type { Exec } from '../src/usage/index.js';

const plugin: Card = {
  id: 'cli:plugin:demo@mkt', kind: 'plugin', surface: 'cli', name: 'demo@mkt', enabled: true,
  version: '1.2.0', usage: { uses30d: 0 }, verdict: 'dead_weight',
};
const skill: Card = {
  id: 'cli:skill:alpha', kind: 'skill', surface: 'cli', name: 'alpha', enabled: true,
  usage: { uses30d: 0 }, verdict: 'dead_weight',
};

describe('checkUpdates', () => {
  it('flags a differing catalog version', async () => {
    const exec: Exec = async (cmd, args) => {
      expect(cmd).toBe('claude');
      expect(args).toEqual(['plugin', 'list', '--available', '--json']);
      return { code: 0, stdout: JSON.stringify({ available: [{ pluginId: 'demo@mkt', version: '1.3.0' }] }) };
    };
    const r = await checkUpdates([plugin, skill], exec);
    expect(r.cards[0].update).toEqual({ installed: '1.2.0', latest: '1.3.0' });
    expect(r.cards[1].update).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });

  it('sets nothing when versions match or the plugin is not in the catalog', async () => {
    const exec: Exec = async () => ({
      code: 0,
      stdout: JSON.stringify({ available: [{ pluginId: 'demo@mkt', version: '1.2.0' }, { pluginId: 'other@mkt', version: '9' }] }),
    });
    const r = await checkUpdates([plugin], exec);
    expect(r.cards[0].update).toBeUndefined();
  });

  it('accepts a bare array catalog', async () => {
    const exec: Exec = async () => ({ code: 0, stdout: JSON.stringify([{ id: 'demo@mkt', version: '2.0.0' }]) });
    expect((await checkUpdates([plugin], exec)).cards[0].update!.latest).toBe('2.0.0');
  });

  it('warns and leaves cards unchanged when the command fails', async () => {
    for (const exec of [
      (async () => ({ code: 1, stdout: '' })) as Exec,
      (async () => { throw new Error('ENOENT'); }) as Exec,
      (async () => ({ code: 0, stdout: 'junk' })) as Exec,
    ]) {
      const r = await checkUpdates([plugin, skill], exec);
      expect(r.cards).toEqual([plugin, skill]);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0].source).toBe('updates');
    }
  });
});
