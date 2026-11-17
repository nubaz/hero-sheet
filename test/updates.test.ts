import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveRoots } from '../src/roots.js';
import type { Card } from '../src/types.js';
import { checkUpdates } from '../src/updates.js';

function card(name: string, version?: string): Card {
  return {
    id: `cli:plugin:${name}`, kind: 'plugin', surface: 'cli', name, enabled: true,
    version, usage: { uses30d: 0 }, verdict: 'asleep',
  };
}
const skill: Card = {
  id: 'cli:skill:alpha', kind: 'skill', surface: 'cli', name: 'alpha', enabled: true,
  usage: { uses30d: 0 }, verdict: 'asleep',
};

const homes: string[] = [];
function makeHome(): { home: string; clone: (mkt: string) => string } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-sheet-upd-'));
  homes.push(home);
  return { home, clone: (mkt) => path.join(home, '.claude', 'plugins', 'marketplaces', mkt) };
}
function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
}
function catalog(dir: string, plugins: unknown[]): void {
  writeJson(path.join(dir, '.claude-plugin', 'marketplace.json'), { name: 'mkt', plugins });
}
afterEach(() => { for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true }); });

describe('checkUpdates', () => {
  it('flags a differing version from the marketplace entry', () => {
    const { home, clone } = makeHome();
    catalog(clone('mkt'), [{ name: 'demo', version: '1.3.0', source: './demo' }]);
    const r = checkUpdates([card('demo@mkt', '1.2.0'), skill], resolveRoots(home, {}));
    expect(r.cards[0].update).toEqual({ installed: '1.2.0', latest: '1.3.0' });
    expect(r.cards[1].update).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });

  it('sets nothing when versions match or the entry is absent', () => {
    const { home, clone } = makeHome();
    catalog(clone('mkt'), [{ name: 'demo', version: '1.2.0' }, { name: 'other', version: '9' }]);
    const roots = resolveRoots(home, {});
    expect(checkUpdates([card('demo@mkt', '1.2.0')], roots).cards[0].update).toBeUndefined();
    expect(checkUpdates([card('missing@mkt', '1.0.0')], roots).cards[0].update).toBeUndefined();
  });

  it('falls back to plugin.json under a relative source path', () => {
    const { home, clone } = makeHome();
    catalog(clone('mkt'), [{ name: 'demo', source: './plugins/demo' }]);
    writeJson(path.join(clone('mkt'), 'plugins', 'demo', '.claude-plugin', 'plugin.json'), { version: '2.0.0' });
    const r = checkUpdates([card('demo@mkt', '1.0.0')], resolveRoots(home, {}));
    expect(r.cards[0].update).toEqual({ installed: '1.0.0', latest: '2.0.0' });
  });

  it('ignores a source that escapes the clone or is not a string', () => {
    const { home, clone } = makeHome();
    catalog(clone('mkt'), [
      { name: 'esc', source: '../../outside' },
      { name: 'git', source: { source: 'github', repo: 'a/b' } },
    ]);
    writeJson(path.join(home, '.claude', 'plugins', 'outside', '.claude-plugin', 'plugin.json'), { version: '9.9.9' });
    const r = checkUpdates([card('esc@mkt', '1.0.0'), card('git@mkt', '1.0.0')], resolveRoots(home, {}));
    expect(r.cards.every((c) => c.update === undefined)).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('gives no update and no warning for a commit-hash install or a missing clone', () => {
    const { home, clone } = makeHome();
    catalog(clone('mkt'), [{ name: 'demo', version: '1.3.0' }]);
    const roots = resolveRoots(home, {});
    const r = checkUpdates([card('demo@mkt', 'abc1234def5678'), card('x@nomarket', '1.0.0'), card('nov@mkt')], roots);
    expect(r.cards[0].update).toBeUndefined();
    expect(r.cards[1].update).toBeUndefined();
    expect(r.cards[2].update).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });

  it('warns once per marketplace with an unparsable catalog', () => {
    const { home, clone } = makeHome();
    writeJson(path.join(clone('mkt'), '.claude-plugin', 'marketplace.json'), '{ nope');
    const r = checkUpdates([card('a@mkt', '1'), card('b@mkt', '1')], resolveRoots(home, {}));
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].source).toBe('updates');
    expect(r.cards.every((c) => c.update === undefined)).toBe(true);
  });
});
