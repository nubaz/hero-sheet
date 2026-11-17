import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRoots } from '../src/roots.js';
import { scanPlugins } from '../src/scan/plugins.js';

const fixtureHome = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'home');

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hero-sheet-'));
}

describe('scanPlugins', () => {
  it('emits the plugin and what it ships', () => {
    const { items, warnings } = scanPlugins(resolveRoots(fixtureHome, {}));
    const ids = items.map((i) => i.id);
    expect(ids).toContain('cli:plugin:demo@mkt');
    expect(ids).toContain('cli:skill:demo:one');
    expect(ids).toContain('cli:agent:demo:helper');
    const plugin = items.find((i) => i.id === 'cli:plugin:demo@mkt')!;
    expect(plugin.version).toBe('1.2.0');
    expect(plugin.enabled).toBe(true);
    expect(plugin.installedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(plugin.updatedAt).toBe('2026-02-03T04:05:06.000Z');
    const skill = items.find((i) => i.id === 'cli:skill:demo:one')!;
    expect(skill.origin).toBe('demo@mkt');
    expect(skill.description).toBe('Demo plugin skill');
    expect(warnings).toEqual([]);
  });

  it('inherits disabled state from settings.json', () => {
    const home = tmpHome();
    fs.cpSync(path.join(fixtureHome, '.claude', 'plugins'), path.join(home, '.claude', 'plugins'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'demo@mkt': false } }),
    );
    const { items } = scanPlugins(resolveRoots(home, {}));
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.enabled === false)).toBe(true);
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('warns when installPath does not exist but keeps the plugin item', () => {
    const home = tmpHome();
    fs.mkdirSync(path.join(home, '.claude', 'plugins'), { recursive: true });
    fs.writeFileSync(
      path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({ version: 2, plugins: { 'ghost@mkt': [{ scope: 'user', installPath: '/nonexistent/ghost', version: '0.1.0' }] } }),
    );
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'ghost@mkt': true } }));
    const { items, warnings } = scanPlugins(resolveRoots(home, {}));
    expect(items.map((i) => i.id)).toEqual(['cli:plugin:ghost@mkt']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('ghost@mkt');
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('yields no items and one warning when installed_plugins.json is missing', () => {
    const home = tmpHome();
    const { items, warnings } = scanPlugins(resolveRoots(home, {}));
    expect(items).toEqual([]);
    expect(warnings).toHaveLength(1);
    fs.rmSync(home, { recursive: true, force: true });
  });
});
