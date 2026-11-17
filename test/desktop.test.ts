import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRoots } from '../src/roots.js';
import { scanDesktopSkills, scanSynced } from '../src/scan/desktop.js';

const home = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'home');
const roots = resolveRoots(home, {});

describe('scanDesktopSkills', () => {
  const { items, warnings } = scanDesktopSkills(roots);
  const byId = new Map(items.map((i) => [i.id, i]));

  it('takes name, enabled and creatorType from the manifest', () => {
    const h = byId.get('desktop:skill:humanizer')!;
    expect(h.surface).toBe('desktop');
    expect(h.enabled).toBe(true);
    expect(h.description).toBe('Rewrite text so it reads naturally');
    expect(h.detail?.creatorType).toBe('anthropic');
    expect(h.updatedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(h.staticTokensEst).toBeGreaterThan(0);
    expect(h.startupTokensEst).toBe(
      Math.ceil(('humanizer' + 'Rewrite text so it reads naturally').length / 4),
    );
  });

  it('keeps a manifest skill that has no directory, without token fields', () => {
    const n = byId.get('desktop:skill:no-dir-skill')!;
    expect(n.enabled).toBe(false);
    expect(n.staticTokensEst).toBeUndefined();
    expect(n.startupTokensEst).toBeUndefined();
    expect(n.updatedAt).toBe(new Date(1760000000000).toISOString());
  });

  it('ignores dot directories such as .bucket-*', () => {
    expect(items.some((i) => i.name === 'hidden-bucket-skill')).toBe(false);
    expect(warnings).toEqual([]);
  });

  it('warns on an unparsable manifest and still completes', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-sheet-'));
    const dir = path.join(tmp, 'Library', 'Application Support', 'Claude', 'local-agent-mode-sessions', 'skills-plugin', 'a', 'b');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{ nope');
    const res = scanDesktopSkills(resolveRoots(tmp, {}));
    expect(res.items).toEqual([]);
    expect(res.warnings).toHaveLength(1);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe('scanSynced', () => {
  it('lists synced skills on the synced surface', () => {
    const { items } = scanSynced(roots);
    expect(items.map((i) => i.id)).toEqual(['synced:skill:x', 'synced:skill:y']);
    expect(items[0].surface).toBe('synced');
    expect(items[0].description).toBe('Synced test skill');
    expect(items[0].enabled).toBe(true);
  });
});
