import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRoots } from '../src/roots.js';
import { scanHooks, scanMcpServers, scanMemory, scanScheduledTasks } from '../src/scan/config.js';

const home = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'home');
const roots = resolveRoots(home, {});

describe('scanMcpServers', () => {
  const result = scanMcpServers(roots);

  it('never leaks env, headers, args or URL credentials (Review Focus 1)', () => {
    const out = JSON.stringify(result);
    for (const secret of ['sk-test-123', 'Bearer abc', 'tok-xyz', 'env-value-456', 'pw-in-url', 'urlkey-999', 'API_KEY', 'Authorization']) {
      expect(out).not.toContain(secret);
    }
  });

  it('keeps name, transport and URL host only', () => {
    const byName = new Map(result.items.map((i) => [i.name, i]));
    expect(byName.get('secret')!.id).toBe('cli:mcp_server:secret');
    expect(byName.get('secret')!.detail).toEqual({ transport: 'http', host: 'example.com' });
    expect(byName.get('local')!.detail).toEqual({ transport: 'stdio' });
    expect(byName.get('scoped')!.detail).toEqual({ transport: 'sse', host: 'localhost' });
    expect(result.warnings).toEqual([]);
  });
});

describe('scanHooks', () => {
  it('lists one item per hook entry', () => {
    const { items } = scanHooks(roots);
    expect(items.map((i) => i.id).sort()).toEqual([
      'cli:hook:PostToolUse#0',
      'cli:hook:SessionStart#0',
      'cli:hook:SessionStart#1',
    ]);
    const post = items.find((i) => i.name === 'PostToolUse#0')!;
    expect(post.detail).toEqual({ event: 'PostToolUse', matcher: 'Bash', type: 'command' });
    expect(JSON.stringify(items)).not.toContain('echo');
  });
});

describe('scanScheduledTasks', () => {
  it('lists scheduled tasks', () => {
    const { items } = scanScheduledTasks(roots);
    expect(items.map((i) => i.id)).toEqual(['cli:scheduled_task:weekly']);
    expect(items[0].description).toBe('Weekly hygiene check');
  });
});

describe('scanMemory', () => {
  it('counts memory entries and lists CLAUDE.md', () => {
    const { items } = scanMemory(roots);
    const mem = items.find((i) => i.kind === 'memory')!;
    expect(mem.detail?.entries).toBe(3);
    const instr = items.find((i) => i.kind === 'instructions')!;
    expect(instr.name).toBe('CLAUDE.md');
    expect(instr.staticTokensEst).toBeGreaterThan(0);
  });
});

describe('missing sources', () => {
  it('give zero items and one warning per missing file', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-sheet-'));
    const r = resolveRoots(empty, {});
    for (const fn of [scanMcpServers, scanHooks]) {
      const res = fn(r);
      expect(res.items).toEqual([]);
      expect(res.warnings).toHaveLength(1);
    }
    expect(scanScheduledTasks(r).items).toEqual([]);
    expect(scanMemory(r).items).toEqual([]);
    fs.rmSync(empty, { recursive: true, force: true });
  });

  it('survive unparsable JSON', () => {
    const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-sheet-'));
    fs.mkdirSync(path.join(bad, '.claude'));
    fs.writeFileSync(path.join(bad, '.claude.json'), '{ nope');
    fs.writeFileSync(path.join(bad, '.claude', 'settings.json'), '{ nope');
    const r = resolveRoots(bad, {});
    expect(scanMcpServers(r)).toMatchObject({ items: [], warnings: [{ source: 'mcp' }] });
    expect(scanHooks(r)).toMatchObject({ items: [], warnings: [{ source: 'hooks' }] });
    fs.rmSync(bad, { recursive: true, force: true });
  });
});
