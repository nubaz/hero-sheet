import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveRoots } from '../src/roots.js';
import { buildCards } from '../src/join.js';
import { scanUserAgents } from '../src/scan/agents.js';
import type { UsageMap } from '../src/usage/index.js';

const homes: string[] = [];
function makeHome(files: Record<string, string>): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-sheet-agents-'));
  homes.push(home);
  for (const [name, text] of Object.entries(files)) {
    const f = path.join(home, '.claude', 'agents', name);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
  return home;
}
afterEach(() => { for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true }); });

describe('scanUserAgents', () => {
  it('reads frontmatter, falls back to the file name, and estimates tokens', () => {
    const named = '---\nname: reviewer\ndescription: Reviews code\n---\nBody text here\n';
    const home = makeHome({
      'rev.md': named,
      'plain.md': 'No frontmatter at all\n',
      'notes.txt': 'ignored',
      '.hidden.md': '---\nname: hidden\n---\n',
    });
    const { items, warnings } = scanUserAgents(resolveRoots(home, {}));
    expect(warnings).toEqual([]);
    expect(items.map((i) => i.id)).toEqual(['cli:agent:plain', 'cli:agent:reviewer']);
    const rev = items.find((i) => i.name === 'reviewer')!;
    expect(rev).toMatchObject({ kind: 'agent', surface: 'cli', origin: 'user', enabled: true, description: 'Reviews code' });
    expect(rev.staticTokensEst).toBe(Math.ceil(named.length / 4));
    expect(rev.startupTokensEst).toBe(Math.ceil(('reviewer' + 'Reviews code').length / 4));
    expect(rev.path!.endsWith('rev.md')).toBe(true);
  });

  it('yields nothing without an agents directory and warns on broken frontmatter', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-sheet-agents-'));
    homes.push(empty);
    expect(scanUserAgents(resolveRoots(empty, {}))).toEqual({ items: [], warnings: [] });
    const home = makeHome({ 'bad.md': '---\n: : [\n---\n', 'ok.md': '---\nname: ok\n---\n' });
    const r = scanUserAgents(resolveRoots(home, {}));
    expect(r.items.map((i) => i.name)).toEqual(['ok']);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].message).toContain('bad');
  });

  it('attaches agent usage to the card', () => {
    const home = makeHome({ 'rev.md': '---\nname: reviewer\n---\n' });
    const { items } = scanUserAgents(resolveRoots(home, {}));
    const usage: UsageMap = {
      skills: new Map(), servers: new Map(), source: 'transcripts', sessions: 1,
      agents: new Map([['reviewer', { uses30d: 4, lastUsedAt: '2026-11-01T00:00:00Z' }]]),
    };
    const card = buildCards(items, usage, new Map())[0];
    expect(card.usage.uses30d).toBe(4);
    expect(card.verdict).toBe('active');
  });
});
