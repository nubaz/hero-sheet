import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveRoots } from '../src/roots.js';
import { buildCards } from '../src/join.js';
import { scanSyncedPlugins } from '../src/scan/synced-plugins.js';

const homes: string[] = [];
function makeHome(files: Record<string, string>): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-sheet-sp-'));
  homes.push(home);
  for (const [rel, text] of Object.entries(files)) {
    const f = path.join(home, '.claude', 'plugins', 'synced', rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
  return home;
}
afterEach(() => { for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true }); });

const manifest = (name: string, version = '0.4.0') => JSON.stringify({ name, version, description: `${name} plugin` });

describe('scanSyncedPlugins', () => {
  it('emits the plugin and its skills and agents on the synced surface', () => {
    const home = makeHome({
      'bucket1/acme/.claude-plugin/plugin.json': manifest('acme'),
      'bucket1/acme/skills/one/SKILL.md': '---\nname: one\ndescription: First\n---\nbody\n',
      'bucket1/acme/agents/helper.md': '---\ndescription: Helps\n---\n',
    });
    const { items, warnings } = scanSyncedPlugins(resolveRoots(home, {}));
    expect(warnings).toEqual([]);
    expect(items.map((i) => i.id).sort()).toEqual([
      'synced:agent:acme:helper', 'synced:plugin:acme', 'synced:skill:acme:one',
    ]);
    const plugin = items.find((i) => i.kind === 'plugin')!;
    expect(plugin).toMatchObject({ surface: 'synced', name: 'acme', version: '0.4.0', enabled: true, description: 'acme plugin' });
    const skill = items.find((i) => i.kind === 'skill')!;
    expect(skill).toMatchObject({ surface: 'synced', name: 'acme:one', origin: 'acme', description: 'First' });
    expect(skill.staticTokensEst).toBeGreaterThan(0);
    expect(items.find((i) => i.kind === 'agent')!.name).toBe('acme:helper');
  });

  it('finds plugins up to three levels deep, ignores dot buckets and deeper ones', () => {
    const home = makeHome({
      'b/x/y/z/.claude-plugin/plugin.json': manifest('deep3'),
      'b/x/y/z/w/.claude-plugin/plugin.json': manifest('deep4'),
      'b/one/.claude-plugin/plugin.json': manifest('shallow'),
      '.hidden/p/.claude-plugin/plugin.json': manifest('hidden'),
      'b/.dot/p/.claude-plugin/plugin.json': manifest('dotdir'),
    });
    const names = scanSyncedPlugins(resolveRoots(home, {})).items.filter((i) => i.kind === 'plugin').map((i) => i.name);
    expect(names.sort()).toEqual(['deep3', 'shallow']);
  });

  it('yields nothing when the folder is missing and warns on a broken manifest', () => {
    const none = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-sheet-sp-'));
    homes.push(none);
    expect(scanSyncedPlugins(resolveRoots(none, {}))).toEqual({ items: [], warnings: [] });
    const home = makeHome({ 'b/p/.claude-plugin/plugin.json': '{ nope' });
    const r = scanSyncedPlugins(resolveRoots(home, {}));
    expect(r.items).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].source).toBe('synced');
  });

  it('rolls shipped skill usage up into the plugin card', () => {
    const home = makeHome({
      'b/acme/.claude-plugin/plugin.json': manifest('acme'),
      'b/acme/skills/one/SKILL.md': '---\nname: one\n---\n',
    });
    const { items } = scanSyncedPlugins(resolveRoots(home, {}));
    const usage = {
      skills: new Map([['acme:one', { uses30d: 5 }]]), servers: new Map(), agents: new Map(),
      source: 'transcripts' as const, sessions: 1,
    };
    const cards = buildCards(items, usage, new Map());
    expect(cards.find((c) => c.kind === 'plugin')!.usage.uses30d).toBe(5);
  });
});
